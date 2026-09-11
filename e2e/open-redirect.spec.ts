/**
 * The `next` parameter is the only attacker-controlled value in the sign-in flow that ends up in a
 * `Location` header, so it is the one place where an open redirect could exist. `safeAdminPath()`
 * has unit tests; this suite checks the real HTTP surface that uses it — the sign-in page, the
 * Server Action's redirect, and the e-mail-link handler.
 *
 * The rule under test is an allowlist: the value must *be* an internal admin path, in both its raw
 * and its once-decoded form. Everything else collapses to `/admin`.
 */
import { expect, test } from '@playwright/test';

import { LOCAL, createActiveAdmin, signIn, testEmail } from './support/local';

/** Every one of these must end up as `/admin`, never as a destination. */
const HOSTILE = [
  'https://evil.example',
  'http://evil.example/admin',
  '//evil.example',
  '/\\evil.example',
  '%2F%2Fevil.example',
  '%252F%252Fevil.example',
  'https%3A%2F%2Fevil.example',
  '/admin/../../evil',
  '/admin/%2e%2e/%2e%2e/evil',
  'javascript:alert(1)',
  'https://127.0.0.1:3000@evil.example',
  '/admin\r\nSet-Cookie:%20x=1',
  // Internal, but not a destination: outside the admin area, or a loop.
  '/auth/sair',
  '/admin/entrar',
  '/admin/sem-acesso',
];

/** Internal admin paths that must survive untouched. */
const ACCEPTED = ['/admin', '/admin/inscricoes', '/admin/inscricoes?estado=confirmada'];

test.describe('the `next` parameter cannot become an open redirect', () => {
  test('a hostile destination collapses to /admin on the sign-in page', async ({ page }) => {
    for (const candidate of HOSTILE) {
      await page.goto(`/admin/entrar?next=${encodeURIComponent(candidate)}`);
      await expect(
        page.locator('input[name="next"]'),
        `rejected: ${candidate}`,
      ).toHaveValue('/admin');
    }
  });

  test('an internal admin destination is preserved', async ({ page }) => {
    for (const candidate of ACCEPTED) {
      await page.goto(`/admin/entrar?next=${encodeURIComponent(candidate)}`);
      await expect(page.locator('input[name="next"]')).toHaveValue(candidate);
    }

    // And the proxy's own redirect remembers where an anonymous visitor was going.
    await page.goto('/admin/inscricoes');
    await expect(page).toHaveURL(/\/admin\/entrar\?next=%2Fadmin%2Finscricoes$/);
    await expect(page.locator('input[name="next"]')).toHaveValue('/admin/inscricoes');
  });

  test('signing in with a hostile destination lands on /admin, in the browser', async ({ page }) => {
    const offSite: string[] = [];
    page.on('request', (request) => {
      const { host } = new URL(request.url());
      if (!host.startsWith('127.0.0.1')) offSite.push(request.url());
    });

    const email = testEmail('admin-redirect');
    await createActiveAdmin(email);

    await signIn(page, email, `/admin/entrar?next=${encodeURIComponent('https://evil.example')}`);

    await page.waitForURL(/\/admin$/);
    expect(page.url()).toBe(`${LOCAL.siteUrl}/admin`);
    expect(offSite, 'the browser must never be sent off-site').toEqual([]);
  });

  test('the e-mail-link handler redirects internally even when the link is crafted', async ({
    request,
  }) => {
    const response = await request.get(
      `/auth/confirmar?token_hash=nao-existe&type=email&next=${encodeURIComponent('https://evil.example')}`,
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(303);
    const location = response.headers().location;
    // Relative or absolute, it must resolve to this origin and to nothing else — and a
    // protocol-relative `//host` reference would resolve elsewhere while looking like a path.
    expect(location.startsWith('//')).toBe(false);
    expect(new URL(location, LOCAL.siteUrl).origin).toBe(new URL(LOCAL.siteUrl).origin);
    expect(location).toContain('/admin/entrar');
    expect(location).toContain('motivo=link-invalido');
    // The provider's wording for a bad hash never reaches the visitor.
    expect(location.toLowerCase()).not.toContain('otp');
  });

  test('signing out is POST-only', async ({ request }) => {
    const response = await request.get('/auth/sair', { maxRedirects: 0 });
    expect(response.status()).toBe(405);
  });
});
