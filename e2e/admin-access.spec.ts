/**
 * The admin boundary, end to end, against the real local stack (IMPLEMENTATION-PLAN.md Phase 3).
 *
 * Each test proves one claim of the exit criteria, and two of them prove something stronger than
 * "the right page appeared": the non-administrator and the deactivated administrator both arrive
 * carrying a **valid session**, which means `proxy.ts` lets them through. Everything that stops
 * them after that point is `requireAdmin()` / `assertAdmin()` reading `public.admin_users` — the
 * boundary the plan requires to work with the proxy deleted.
 */
import { expect, test } from '@playwright/test';

import {
  authCookies,
  createActiveAdmin,
  createAuthUser,
  deactivateAdmin,
  signIn,
  testEmail,
} from './support/local';

const PROTECTED_MARKER = 'Área de organizadores';

test.describe('Phase 3 — the admin boundary', () => {
  test('an anonymous visitor never receives protected content', async ({ page, request }) => {
    const direct = await request.get('/admin', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(direct.status());
    expect(direct.headers().location).toContain('/admin/entrar');
    expect(await direct.text()).not.toContain(PROTECTED_MARKER);

    // The Route Handler half of the surface. A redirect here is the proxy being helpful; what
    // matters is that no identity is disclosed.
    const api = await request.get('/admin/sessao', { maxRedirects: 0 });
    expect([302, 303, 307, 308, 401]).toContain(api.status());
    expect(await api.text()).not.toContain('userId');

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/entrar$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByText(PROTECTED_MARKER)).toHaveCount(0);
  });

  test('an authenticated non-administrator is refused', async ({ page }) => {
    const email = testEmail('nao-admin');
    // An Auth identity with no `admin_users` row: authentication without authorization.
    await createAuthUser(email);

    await signIn(page, email);

    await page.waitForURL(/\/admin\/sem-acesso$/);
    await expect(
      page.getByRole('heading', { name: 'Sua conta não tem acesso a esta área' }),
    ).toBeVisible();
    await expect(page.getByText(PROTECTED_MARKER)).toHaveCount(0);

    // The session is real — so the proxy passed this request through, and the refusal below came
    // from `assertAdmin()` alone.
    expect((await authCookies(page)).length).toBeGreaterThan(0);

    const session = await page.request.get('/admin/sessao');
    expect(session.status()).toBe(401);
    expect(await session.json()).toMatchObject({ error: 'unauthorized' });

    const home = await page.request.get('/admin');
    expect(await home.text()).not.toContain(PROTECTED_MARKER);
  });

  test('an active administrator signs in with the real code, then signs out', async ({ page }) => {
    const email = testEmail('admin-ativo');
    await createActiveAdmin(email, 'Organizadora de teste');

    await signIn(page, email);

    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: PROTECTED_MARKER })).toBeVisible();
    await expect(page.getByTestId('audit-count')).toBeVisible();

    // The session exists, is HttpOnly, and is unreadable from page JavaScript.
    const cookies = await authCookies(page);
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.every((cookie) => cookie.httpOnly)).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('auth-token');

    // Identity-dependent HTML must not be storable by a cache.
    const home = await page.request.get('/admin');
    expect(home.status()).toBe(200);
    expect(home.headers()['cache-control']).toContain('no-store');
    expect(home.headers()['cache-control']).toContain('private');

    // The server entry point agrees with the page.
    const session = await page.request.get('/admin/sessao');
    expect(session.status()).toBe(200);
    expect(await session.json()).toMatchObject({ displayName: 'Organizadora de teste' });

    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/admin\/entrar$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

    expect(await authCookies(page)).toHaveLength(0);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/entrar/);
    await expect(page.getByText(PROTECTED_MARKER)).toHaveCount(0);

    const afterSignOut = await page.request.get('/admin/sessao', { maxRedirects: 0 });
    expect(afterSignOut.status()).not.toBe(200);
    expect(await afterSignOut.text()).not.toContain('userId');
  });

  test('deactivating an administrator takes effect on the very next request', async ({ page }) => {
    const email = testEmail('admin-revogado');
    const userId = await createActiveAdmin(email, 'Organizador revogado');

    await signIn(page, email);
    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: PROTECTED_MARKER })).toBeVisible();

    const before = await authCookies(page);
    expect(before.length).toBeGreaterThan(0);

    // Nothing about the session changes — only the table does. The JWT in the cookie is minutes
    // old and still valid for an hour, which is the entire point of D5: authorization is read from
    // `admin_users` on every request, never baked into the token.
    await deactivateAdmin(userId);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/sem-acesso$/);
    await expect(page.getByText(PROTECTED_MARKER)).toHaveCount(0);

    const session = await page.request.get('/admin/sessao');
    expect(session.status()).toBe(401);

    // Still signed in: the cookies survived, and /admin/entrar treats this visitor as an
    // authenticated non-administrator rather than as a stranger. The denial is authorization.
    expect((await authCookies(page)).length).toBeGreaterThan(0);
    await page.goto('/admin/entrar');
    await expect(page).toHaveURL(/\/admin\/sem-acesso$/);
  });
});
