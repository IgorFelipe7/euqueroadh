/**
 * The sign-in page must not answer "is this address an administrator?" — DATABASE-SECURITY.md
 * § 7.1.1, and the hardest requirement in Phase 3.
 *
 * Two things are proven here, and both are required:
 *
 *   1. **`shouldCreateUser: false` is real.** Requesting a code for an address with no account
 *      creates no `auth.users` row — asserted against the database, before and after, both for that
 *      address and for the table as a whole.
 *   2. **The application's answer is the same either way.** Supabase itself answers differently: a
 *      code is sent for one address and `otp_disabled` comes back for the other, which the mailbox
 *      assertions show. `requestAdminOtp()` collapses that difference before it reaches the visitor.
 *
 * ## What "the same" is measured as
 *
 * The strongest available comparison is made against the **no-JavaScript submission**: the form is
 * fetched, its hidden fields are replayed as a plain multipart POST, and the complete HTML document
 * that comes back is compared byte for byte. That path is deterministic — one request, one
 * response, no client-side rendering — and it is the same Server Action the browser calls.
 *
 * Three values in that document legitimately differ between *any* two responses, including two for
 * the same address: the address that was typed, the `Date.now()` stamp that starts the resend
 * countdown, and the per-response CSP nonce from `proxy.ts`. Those three are normalised, and
 * nothing else is. To prove the normalisation is not doing the work, every comparison is run twice:
 * once between two *known* addresses (the baseline, which must be equal) and once between a known
 * and an unknown one. A branch on whether the account exists — a different message, step, field,
 * countdown or status — fails the second while the first still passes.
 *
 * The browser is then checked separately, at the level the visitor actually experiences: the
 * rendered screen. Its Server Action response body is deliberately not compared, because React
 * consumes and discards it as it applies the new tree; what is on the screen afterwards is the
 * observable fact, and it is compared in full.
 *
 * Timing is not asserted. That difference belongs to Supabase's own endpoint — one request sends an
 * e-mail and the other does not — and no application-level assertion can hold it steady; it is
 * recorded in DATABASE-SECURITY.md § 7.1.1 as a platform surface with its own rate limits.
 */
import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

import {
  LOCAL,
  countAuthUsers,
  createActiveAdmin,
  mailCountFor,
  waitForOtp,
} from './support/local';

/**
 * Three addresses of identical length: two that will have an account, one that will not. Equal
 * length matters — a payload that differs only because one address is longer would be a difference
 * with nothing to do with existence.
 */
function addressTrio(): { knownA: string; knownB: string; unknown: string } {
  const id = () => randomUUID().replace(/-/g, '').slice(0, 10);
  return {
    knownA: `conta-a-${id()}@teste.local`,
    knownB: `conta-b-${id()}@teste.local`,
    unknown: `conta-c-${id()}@teste.local`,
  };
}

function normalise(raw: string, email: string): string {
  return raw
    .split(email)
    .join('<address>')
    // `sentAt`, the epoch-millisecond stamp the resend countdown is measured from.
    .replace(/\b\d{13}\b/g, '<timestamp>')
    // The live countdown, which is running while a rendered screen is read.
    .replace(/\(\d{1,3}s\)/g, '(<n>s)')
    // The per-response CSP nonce, in the HTML attribute and in the flight payload spellings.
    .replace(/nonce="[^"]*"/g, 'nonce="<nonce>"')
    .replace(/\\"nonce\\":\\"[^\\]*\\"/g, '\\"nonce\\":\\"<nonce>\\"');
}

/* ------------------------------------------------------------------------------------------------
 * The no-JavaScript submission
 * ---------------------------------------------------------------------------------------------- */

const HIDDEN_INPUT = /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\s*\/>/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * The hidden fields React renders for progressive enhancement — the action reference, the previous
 * state, the action key — plus the form's own `next`. Replaying them is exactly what a browser with
 * JavaScript disabled does when the form is submitted.
 */
function hiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [, name, value] of html.matchAll(HIDDEN_INPUT)) {
    fields[decodeEntities(name)] = decodeEntities(value ?? '');
  }

  expect(Object.keys(fields), 'the sign-in form must post its state for progressive enhancement')
    .toContain('next');

  return fields;
}

interface Submission {
  status: number;
  body: string;
}

async function submitWithoutJavaScript(
  request: APIRequestContext,
  email: string,
): Promise<Submission> {
  const form = await request.get('/admin/entrar');
  expect(form.status()).toBe(200);

  const response = await request.post('/admin/entrar', {
    multipart: { ...hiddenFields(await form.text()), email, intent: 'request' },
    maxRedirects: 0,
  });

  return { status: response.status(), body: normalise(await response.text(), email) };
}

/* ------------------------------------------------------------------------------------------------
 * The browser
 * ---------------------------------------------------------------------------------------------- */

interface Attempt {
  status: number;
  screen: string;
}

/** Requests a code in a clean browser context and records what the visitor is left looking at. */
async function requestCodeInBrowser(browser: Browser, email: string): Promise<Attempt> {
  const context = await browser.newContext({ baseURL: LOCAL.siteUrl });
  const page = await context.newPage();

  try {
    await page.goto(`${LOCAL.siteUrl}/admin/entrar`);
    await page.getByLabel('E-mail').fill(email);

    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.request().method() === 'POST' && candidate.url().includes('/admin/entrar'),
      ),
      page.getByRole('button', { name: 'Enviar código' }).click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();

    return {
      status: response.status(),
      screen: normalise(await page.locator('form').innerText(), email),
    };
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------------------------------------
 * The tests
 * ---------------------------------------------------------------------------------------------- */

test('an unknown address creates no account and is answered byte for byte identically', async ({
  request,
}) => {
  const { knownA, knownB, unknown } = addressTrio();
  await createActiveAdmin(knownA, 'Organizador conhecido');
  await createActiveAdmin(knownB, 'Organizador conhecido');

  const before = await countAuthUsers();

  const firstKnown = await submitWithoutJavaScript(request, knownA);
  const secondKnown = await submitWithoutJavaScript(request, knownB);
  const unknownAttempt = await submitWithoutJavaScript(request, unknown);

  // 1. No account was created for the unknown address — not for it, and not anywhere.
  expect(await countAuthUsers(unknown), 'shouldCreateUser: false must create nothing').toBe(0);
  expect(await countAuthUsers()).toBe(before);

  // 2. The baseline. Two responses that differ in nothing but which address they name must compare
  //    equal, or the normalisation above is hiding differences and proves nothing below.
  expect(secondKnown.status).toBe(firstKnown.status);
  expect(secondKnown.body).toBe(firstKnown.body);

  // 3. The property.
  expect(unknownAttempt.status).toBe(firstKnown.status);
  expect(unknownAttempt.body).toBe(firstKnown.body);

  // The documents being compared are the real second step, not two error pages or two blanks.
  expect(unknownAttempt.body).toContain('Verifique seu e-mail');
  expect(unknownAttempt.body).toContain('Reenviar código');

  // What the server really knew, and did not say: only the known addresses got an e-mail.
  expect(await mailCountFor(knownA)).toBeGreaterThan(0);
  expect(await mailCountFor(knownB)).toBeGreaterThan(0);
  expect(await mailCountFor(unknown)).toBe(0);
});

test('the browser is left on the identical screen either way', async ({ browser }) => {
  const { knownA, knownB, unknown } = addressTrio();
  await createActiveAdmin(knownA, 'Organizador conhecido');
  await createActiveAdmin(knownB, 'Organizador conhecido');

  const firstKnown = await requestCodeInBrowser(browser, knownA);
  const secondKnown = await requestCodeInBrowser(browser, knownB);
  const unknownAttempt = await requestCodeInBrowser(browser, unknown);

  expect(secondKnown.status).toBe(firstKnown.status);
  expect(secondKnown.screen).toBe(firstKnown.screen);

  expect(unknownAttempt.status).toBe(firstKnown.status);
  expect(unknownAttempt.screen).toBe(firstKnown.screen);

  expect(unknownAttempt.screen).toContain('Verifique seu e-mail');
  expect(unknownAttempt.screen).toContain('Reenviar código');
});

test('a wrong code and a code for an address with no account are the same failure', async ({
  browser,
}) => {
  const { knownA: known, unknown } = addressTrio();
  await createActiveAdmin(known, 'Organizador conhecido');

  /**
   * Requests a code, then submits one that cannot be right, and returns the visible outcome.
   * `codeToSubmit` runs after the request, because for the known address it needs the code that
   * actually arrived in order to send back a different one.
   */
  async function failVerification(
    email: string,
    codeToSubmit: () => Promise<string>,
  ): Promise<string> {
    const context = await browser.newContext({ baseURL: LOCAL.siteUrl });
    const page = await context.newPage();

    try {
      await page.goto(`${LOCAL.siteUrl}/admin/entrar`);
      await page.getByLabel('E-mail').fill(email);
      await page.getByRole('button', { name: 'Enviar código' }).click();
      await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();

      await page.getByLabel('Código').fill(await codeToSubmit());

      // Waiting for the attempt to finish without presuming its outcome: first the action's own
      // response, which cannot arrive before the click, then the submit button leaving the
      // "Entrando…" state it shows while pending. (`getByRole('alert')` is not a usable signal —
      // Next's route announcer carries that role on every page, so it is visible from the start.)
      const [response] = await Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.request().method() === 'POST' && candidate.url().includes('/admin/entrar'),
        ),
        page.getByRole('button', { name: 'Entrar', exact: true }).click(),
      ]);
      await response.finished();

      await expect(page.getByRole('button', { name: 'Entrando…' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();

      return normalise(await page.locator('form').innerText(), email);
    } finally {
      await context.close();
    }
  }

  // The code that really arrived, mutated so it is certainly wrong: this exercises the "wrong code"
  // path rather than the "no such account" one, which is what makes the comparison meaningful.
  const knownFailure = await failVerification(known, async () => {
    const real = await waitForOtp(known);
    return `${real[0] === '9' ? '0' : '9'}${real.slice(1)}`;
  });
  const unknownFailure = await failVerification(unknown, async () => '000000');

  expect(unknownFailure).toBe(knownFailure);
  expect(knownFailure).toContain('Código inválido ou expirado.');
  // Supabase's own wording never reaches the screen (ADMIN-SPEC.md § 7.3).
  expect(knownFailure.toLowerCase()).not.toContain('otp');
  expect(knownFailure.toLowerCase()).not.toContain('token');
});
