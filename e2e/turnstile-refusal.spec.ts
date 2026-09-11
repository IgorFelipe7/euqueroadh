/**
 * What happens when Cloudflare says no.
 *
 * This spec runs against a second instance of the same built application, started by
 * `e2e/support/strict-turnstile-server.mjs` with Cloudflare's published **"always fails"** test
 * secret. Everything else — the code, the database, the widget, the Siteverify call — is the real
 * thing: a genuine token is issued by the widget, genuinely sent to Cloudflare, and genuinely
 * refused.
 *
 * It is a separate server because the primary one cannot produce this answer. Verified against the
 * live endpoint on 2026-09-11: the always-passes test secret returns `success: true` for any
 * non-empty token, forged ones included. Two Cloudflare test secrets, two servers, one application.
 *
 * It runs first, immediately after the build, so the page it loads is the one `next build`
 * prerendered — and it writes nothing, so it leaves that page exactly as it found it.
 */
import { expect, test } from '@playwright/test';

import { countRegistrations, registrationsFor, resetActiveEvent, syntheticName, syntheticPhone } from './support/database';

const REFUSAL = 'Não conseguimos confirmar que você não é um robô. Tente novamente.';

test('a token Cloudflare refuses stops the registration before the database is touched', async ({
  page,
}) => {
  await resetActiveEvent({ capacity: 50, waitlistEnabled: false, state: 'open' });

  const phone = syntheticPhone(500);
  const name = syntheticName(500);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Faça sua inscrição' })).toBeVisible();

  await page.getByLabel('Nome completo').fill(name);
  await page.getByLabel('Idade').fill('19');
  await page.getByLabel('Celular').fill(phone.digits);

  // A real token, issued by the real widget. Nothing here is forged.
  const token = page.locator('input[name="cf-turnstile-response"]');
  await expect(token).toHaveValue(/.+/, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Confirmar inscrição' }).click();

  await expect(page.getByTestId('registration-alert')).toContainText(REFUSAL);
  // No outcome panel: the submission never became a registration of any kind.
  await expect(page.locator('[data-outcome]')).toBeHidden();

  expect(await registrationsFor(phone.e164)).toEqual([]);
  expect(await countRegistrations()).toBe(0);
});

test('a refused submission keeps the data and reissues the challenge', async ({ page }) => {
  await resetActiveEvent({ capacity: 50, waitlistEnabled: false, state: 'open' });

  const phone = syntheticPhone(501);
  const name = syntheticName(501);

  await page.goto('/');
  await page.getByLabel('Nome completo').fill(name);
  await page.getByLabel('Idade').fill('19');
  await page.getByLabel('Celular').fill(phone.digits);

  const token = page.locator('input[name="cf-turnstile-response"]');
  await expect(token).toHaveValue(/.+/, { timeout: 20_000 });

  /*
   * Count the resets rather than compare token values: Cloudflare's test sitekey issues the same
   * literal dummy token every time, so two identical values would prove nothing either way. The
   * call itself is the behaviour under test.
   */
  await page.evaluate(() => {
    const api = window.turnstile;
    if (!api) throw new Error('the Turnstile API never loaded');
    const original = api.reset.bind(api);
    const counter = window as unknown as { __turnstileResets?: number };
    counter.__turnstileResets = 0;
    api.reset = (widgetId?: string) => {
      counter.__turnstileResets = (counter.__turnstileResets ?? 0) + 1;
      return original(widgetId);
    };
  });

  await page.getByRole('button', { name: 'Confirmar inscrição' }).click();
  await expect(page.getByTestId('registration-alert')).toContainText(REFUSAL);

  // Nothing the person typed was lost, so the retry costs them no typing.
  await expect(page.getByLabel('Nome completo')).toHaveValue(name);
  await expect(page.getByLabel('Idade')).toHaveValue('19');
  await expect(page.getByLabel('Celular')).toHaveValue(/\(19\) 9/);

  // A Turnstile token is single-use and lives 300 seconds, so the widget is reset rather than left
  // holding a value the next submission could not use.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __turnstileResets?: number }).__turnstileResets ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await expect(token).toHaveValue(/.+/, { timeout: 20_000 });

  // And the failure is never technical.
  const alert = await page.getByTestId('registration-alert').innerText();
  expect(alert).not.toMatch(/turnstile|cloudflare|siteverify|invalid-input|error-codes/i);

  expect(await countRegistrations()).toBe(0);
});
