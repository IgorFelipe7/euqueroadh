/**
 * The public registration flow, end to end, against the real local database.
 *
 * Nothing here is mocked. A real browser loads the built application, Cloudflare's **published test
 * widget** issues a real dummy token, the Server Action verifies it against the real Siteverify
 * endpoint with Cloudflare's published test secret, and `register_for_event` decides inside a real
 * row lock. The assertions are made twice — once on what the person sees, once on what the database
 * actually holds — because either alone can be right while the other is wrong.
 *
 * **Ordering is deliberate and this file is one unit.** `/` is an ISR route, so what a test sees
 * depends on what the test before it left in the cache. Two rules keep that honest rather than
 * flaky:
 *
 *   1. **Never navigate to `/` while the event is anything but open with a free seat.** Every test
 *      sets that state, navigates, and only then moves the event to the condition it is testing.
 *      This is also the most realistic scenario there is: the visitor loaded a page that was
 *      correct, and the world changed underneath them. The database, not the page, decides.
 *   2. The advisory-state assertions come last, and each one reaches its state the way production
 *      does — through a registration whose outcome flips the state and revalidates the page.
 *
 * Every participant is synthetic. No real name, age or telephone number appears anywhere.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  countRegistrations,
  occupySeats,
  registrationsFor,
  resetActiveEvent,
  restoreSeedState,
  setMinimumAge,
  syntheticName,
  syntheticPhone,
  updateActiveEvent,
} from './support/database';
import { LOCAL } from './support/local';

/** Open, with room. The only state in which this suite navigates to the page. */
const OPEN = { capacity: 50, waitlistEnabled: false, state: 'open' } as const;

const TURNSTILE_INPUT = 'input[name="cf-turnstile-response"]';

interface Participant {
  readonly name: string;
  readonly age: string;
  readonly digits: string;
  readonly e164: string;
}

/** `n` is an index into a synthetic range, never a real number. */
function participant(n: number, age = '17'): Participant {
  const phone = syntheticPhone(n);
  return { name: syntheticName(n), age, digits: phone.digits, e164: phone.e164 };
}

async function openRegistration(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Faça sua inscrição' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar inscrição' })).toBeVisible();
}

async function fillForm(page: Page, person: Participant): Promise<void> {
  await page.getByLabel('Nome completo').fill(person.name);
  await page.getByLabel('Idade').fill(person.age);
  // The mask is applied on input, so the raw digits a person pastes are what is typed here.
  await page.getByLabel('Celular').fill(person.digits);
}

/**
 * Waits for the widget to put a token in the form. Cloudflare's `1x00000000000000000000AA` sitekey
 * always passes and issues a dummy token, so this resolves quickly and without any network the test
 * controls.
 */
async function awaitToken(page: Page): Promise<string> {
  const input = page.locator(TURNSTILE_INPUT);
  await expect(input).toHaveValue(/.+/, { timeout: 20_000 });
  return input.inputValue();
}

async function submit(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Confirmar inscrição|Confirmando/ }).click();
}

async function expectOutcome(page: Page, kind: string, heading: string): Promise<void> {
  const panel = page.locator(`[data-outcome="${kind}"]`);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: heading })).toBeVisible();
}

/**
 * Replaces what the form will actually send for one field, leaving React's state — and therefore
 * the client-side validation — believing the honest value is still there. This is what a tampered
 * client looks like from the server's side: a well-formed request carrying values no honest form
 * would produce.
 *
 * The controlled input is removed from the form and a plain hidden input takes its place, rather
 * than simply writing `input.value`. React owns that node: any re-render between the write and the
 * submit — a blur handler firing as the button takes focus, for instance — restores both the value
 * and the `name` attribute from state, and the attack quietly becomes an ordinary submission that
 * passes. Verified: after such a re-render the form carried *two* `phone` parts and `FormData.get`
 * returned the honest one. A node React no longer has in the document is a node it cannot restore.
 */
async function tamper(page: Page, field: string, value: string): Promise<void> {
  await page.evaluate(
    ([name, next]) => {
      const form = document.querySelector('form');
      if (!form) throw new Error('no form');

      const original = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!original) throw new Error(`No field named ${name} to tamper with.`);
      original.remove();

      const replacement = document.createElement('input');
      replacement.type = 'hidden';
      replacement.name = name;
      replacement.value = next;
      form.append(replacement);
    },
    [field, value] as const,
  );
}

test.afterAll(async () => {
  await restoreSeedState();
});

/* ================================================================================================
 * The six outcomes
 * ============================================================================================== */

test('a valid registration is confirmed and stored exactly once', async ({ page }) => {
  await resetActiveEvent(OPEN);
  const person = participant(1);

  await openRegistration(page);
  await fillForm(page, person);
  await awaitToken(page);
  await submit(page);

  await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');

  expect(await registrationsFor(person.e164)).toEqual([
    { status: 'confirmed', fullName: person.name, age: 17, waitlistRank: null },
  ]);
});

/**
 * The public page is the one surface an unauthenticated stranger can read in full, and Phase 4 gave
 * it two new reasons to be checked: the Turnstile secret now exists in the server environment, and
 * the page hands a Turnstile value to a Client Component as a prop.
 *
 * Exactly one of the two values may appear in what the browser receives. The site key is public by
 * design — the widget cannot work without it — and asserting that it *is* present is what makes
 * asserting that the secret is *absent* mean anything: a page shipping neither would satisfy a
 * naive check while the widget was silently broken.
 *
 * It lives here rather than beside the other secret-boundary tests so that it runs while the form
 * is certainly on the page. The complete build output is scanned separately in
 * `secret-boundary.spec.ts`, chunks this session never loads included.
 */
test('the public page ships the Turnstile site key and neither secret', async ({ page }) => {
  await resetActiveEvent(OPEN);
  await openRegistration(page);

  const html = await (await page.request.get('/')).text();
  const scriptUrls = await page.$$eval('script[src]', (tags) =>
    tags.map((tag) => (tag as HTMLScriptElement).src),
  );

  const sameOrigin = scriptUrls.filter((url) => url.startsWith(LOCAL.siteUrl));
  expect(
    sameOrigin.length,
    'the public page is expected to load its own JavaScript',
  ).toBeGreaterThan(0);

  const payloads = [html];
  for (const url of sameOrigin) payloads.push(await (await page.request.get(url)).text());

  for (const payload of payloads) {
    expect(payload).not.toContain(LOCAL.secretKey);
    expect(payload).not.toContain(LOCAL.turnstileSecret);
    expect(payload).not.toContain('SUPABASE_SECRET_KEY');
    expect(payload).not.toContain('TURNSTILE_SECRET_KEY');
    // No Supabase client is created on the public page at all, so not even the publishable key
    // belongs here (DATABASE-SECURITY.md § 8.6).
    expect(payload).not.toContain('sb_publishable_');
  }

  expect(
    payloads.some((payload) => payload.includes(LOCAL.turnstileSiteKey)),
    'the public site key must reach the browser, or the widget cannot render',
  ).toBe(true);
});

/**
 * Turnstile is a third-party script and an iframe, and the public profile in `next.config.ts` is
 * what decides whether either is allowed to exist. A CSP that silently blocks the widget looks
 * exactly like a widget that failed to load, and would leave every submission refused.
 */
test('the production Content-Security-Policy admits Turnstile and nothing wider', async ({
  page,
}) => {
  const violations: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy|refused to/i.test(text)) violations.push(text);
    if (message.type() === 'error') consoleErrors.push(text);
  });

  await resetActiveEvent(OPEN);
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';

  expect(csp).toContain('script-src');
  expect(csp).toContain('https://challenges.cloudflare.com');
  expect(csp).toContain("frame-src https://challenges.cloudflare.com");
  // Nothing was widened to make the widget work.
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toContain('*');
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");

  // The widget genuinely ran under that policy: the third-party script was allowed to load, it
  // installed its API, and it issued a token. Cloudflare's dummy sitekey resolves without an
  // iframe, so `frame-src` is asserted on the header above rather than on the DOM here — it is what
  // the managed widget needs in production, and Cloudflare documents exactly these two directives.
  await expect(
    page.locator('script[src^="https://challenges.cloudflare.com/turnstile/"]'),
  ).toBeAttached();
  await awaitToken(page);
  expect(await page.evaluate(() => typeof window.turnstile)).toBe('object');

  expect(violations, 'the policy blocked something the page needs').toEqual([]);
  expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test('a registration that arrives after the seats are gone joins the waiting list', async ({
  page,
}) => {
  await resetActiveEvent({ capacity: 1, waitlistEnabled: true, state: 'open' });
  const person = participant(2);

  // The page is loaded while a seat is still free, then the event fills underneath the visitor.
  await openRegistration(page);
  await occupySeats(1);

  await fillForm(page, person);
  await awaitToken(page);
  await submit(page);

  await expectOutcome(page, 'waitlisted', 'Você está na lista de espera');
  await expect(page.getByText('As vagas confirmadas já foram preenchidas')).toBeVisible();

  expect(await registrationsFor(person.e164)).toEqual([
    { status: 'waitlisted', fullName: person.name, age: 17, waitlistRank: 1 },
  ]);
});

test('the same number twice is recognised, and the stored row is never rewritten', async ({
  page,
}) => {
  await resetActiveEvent(OPEN);
  const person = participant(3);

  await openRegistration(page);
  await fillForm(page, person);
  await awaitToken(page);
  await submit(page);
  await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');

  // The same canonical number, deliberately with a different name and age.
  await openRegistration(page);
  await fillForm(page, { ...person, name: 'Outra Pessoa de Teste', age: '41' });
  await awaitToken(page);
  await submit(page);

  await expectOutcome(page, 'already_registered', 'Você já está inscrito(a)');

  const panel = page.locator('[data-outcome="already_registered"]');
  await expect(panel).toContainText('Encontramos uma inscrição confirmada');
  // Deliberately echoes no personal data: otherwise guessing a number reveals who it belongs to.
  await expect(panel).not.toContainText(person.name);
  await expect(panel).not.toContainText('Outra Pessoa');
  await expect(panel).not.toContainText('41');

  expect(await registrationsFor(person.e164)).toEqual([
    { status: 'confirmed', fullName: person.name, age: 17, waitlistRank: null },
  ]);
});

test('a full event with the waiting list off refuses and writes nothing', async ({ page }) => {
  await resetActiveEvent({ capacity: 1, waitlistEnabled: false, state: 'open' });
  const person = participant(4);

  await openRegistration(page);
  await occupySeats(1);

  await fillForm(page, person);
  await awaitToken(page);
  await submit(page);

  await expectOutcome(page, 'full', 'As vagas se esgotaram');

  expect(await registrationsFor(person.e164)).toEqual([]);
  // Only the seat the fixture occupied.
  expect(await countRegistrations()).toBe(1);
});

test('a closed event refuses and writes nothing', async ({ page }) => {
  await resetActiveEvent(OPEN);
  const person = participant(5);

  await openRegistration(page);
  await updateActiveEvent({ state: 'closed' });

  await fillForm(page, person);
  await awaitToken(page);
  await submit(page);

  await expectOutcome(page, 'closed', 'As inscrições estão encerradas');

  expect(await countRegistrations()).toBe(0);
});

/* ================================================================================================
 * Validation
 * ============================================================================================== */

test('invalid data is refused in pt-BR, summarised, focused, and never stored', async ({ page }) => {
  await resetActiveEvent(OPEN);

  await openRegistration(page);
  await fillForm(page, { name: 'A', age: '0', digits: '1933456789', e164: '' });
  await awaitToken(page);
  await submit(page);

  const summary = page.getByTestId('registration-alert');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Verifique estes campos');
  await expect(summary).toContainText('Informe seu nome completo.');
  await expect(summary).toContainText('Informe uma idade válida.');
  await expect(summary).toContainText(
    'Esse número parece ser um telefone fixo. Informe um celular com 9 dígitos.',
  );

  // The summary receives focus, so a screen-reader user is taken to the problem.
  await expect(summary).toBeFocused();

  // Each field is marked invalid and points at its own message — never colour alone.
  for (const label of ['Nome completo', 'Idade', 'Celular']) {
    await expect(page.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
  }

  expect(await countRegistrations()).toBe(0);
});

test('a field corrects itself as soon as it is fixed, and what was typed survives', async ({
  page,
}) => {
  await resetActiveEvent(OPEN);
  const person = participant(6);

  await openRegistration(page);
  await page.getByLabel('Nome completo').fill(person.name);
  await page.getByLabel('Celular').fill('1933456789');
  await page.getByLabel('Celular').blur();

  await expect(page.getByText('Esse número parece ser um telefone fixo.')).toBeVisible();
  // The name is untouched by another field's error.
  await expect(page.getByLabel('Nome completo')).toHaveValue(person.name);

  await page.getByLabel('Celular').fill(person.digits);
  await expect(page.getByText('Esse número parece ser um telefone fixo.')).toBeHidden();
  // The mask is a typing aid applied as the digits arrive.
  await expect(page.getByLabel('Celular')).toHaveValue('(19) 90000-0006');
});

/* ================================================================================================
 * The anti-abuse boundary
 * ============================================================================================== */

test('a submission with no token is refused before the database is touched', async ({ page }) => {
  await resetActiveEvent(OPEN);
  const person = participant(7);

  await openRegistration(page);
  await fillForm(page, person);
  await awaitToken(page);

  // The widget solved; the token is removed on the way out, which is what a bot would do.
  await tamper(page, 'cf-turnstile-response', '');
  await submit(page);

  await expect(
    page.getByText('Não conseguimos confirmar que você não é um robô. Tente novamente.'),
  ).toBeVisible();

  expect(await registrationsFor(person.e164)).toEqual([]);
  expect(await countRegistrations()).toBe(0);
});

/*
 * A token Cloudflare *refuses* is proved end to end in `turnstile-refusal.spec.ts`, which runs the
 * same build against a second server holding Cloudflare's published "always fails" test secret.
 *
 * It cannot be proved here, and the reason is a property of Cloudflare's test mode rather than of
 * this application: verified against the live endpoint on 2026-09-11, the always-passes secret this
 * server must use for the happy path answers `success: true` for **any** non-empty token — a forged
 * one, or one already spent. Asserting a refusal against it would assert nothing.
 */

/* ================================================================================================
 * The online eligibility floor
 * ============================================================================================== */

/**
 * Under 12 does not complete the online flow, and is told where to go instead.
 *
 * Three layers, and only one of them is the guarantee:
 *
 *   * the **form** refuses before Cloudflare is contacted — a courtesy;
 *   * the **Server Action** re-parses and refuses a request whose browser validation was removed —
 *     the application boundary;
 *   * **`events.min_age`**, checked inside `register_for_event()` under the event row lock — the
 *     authority, and the only layer a tampered client cannot reach past. It is exercised here by
 *     setting a floor the schema does not know about, which is the only way to reach that branch
 *     through the browser; the 12-year-old floor itself is proved in the database suites.
 *
 * Nothing is stored in any of the three cases: the refusal is a redirection to a human channel, not
 * a record of a child's data.
 */
test.describe('the online minimum age', () => {
  test('refuses an under-12 in the form, naming where to go instead', async ({ page }) => {
    await resetActiveEvent(OPEN);
    const person = participant(70, '11');

    await openRegistration(page);
    await fillForm(page, person);
    await awaitToken(page);
    await submit(page);

    /*
     * `.first()` because the sentence is deliberately rendered twice: once in the error summary at
     * the head of the form, and once beneath the field it belongs to. Both are the specified
     * behaviour (PRODUCT-SPEC.md section 6.2), so the locator picks one rather than the design
     * being changed to satisfy strict mode.
     */
    const message = page.getByText(/A inscrição online é para 12 anos ou mais/).first();
    await expect(message).toBeVisible();
    await expect(message).toContainText('contato@euqueroadh.com');

    // The form is still a form: this is a correction, not a terminal outcome.
    await expect(page.getByRole('button', { name: 'Confirmar inscrição' })).toBeVisible();
    expect(await registrationsFor(person.e164)).toEqual([]);
  });

  test('refuses an under-12 submitted by a tampered client, and stores nothing', async ({
    page,
  }) => {
    await resetActiveEvent(OPEN);
    const person = participant(71, '30');

    await openRegistration(page);
    await fillForm(page, person);
    await awaitToken(page);

    // A well-formed request carrying a value no honest form would send. React still believes the
    // field reads 30, so nothing client-side intervenes.
    await tamper(page, 'age', '9');
    await submit(page);

    await expect(page.getByText(/A inscrição online é para 12 anos ou mais/).first()).toBeVisible();
    expect(await registrationsFor(person.e164)).toEqual([]);
    expect(await countRegistrations()).toBe(0);
  });

  test('the database is the authority, not the schema', async ({ page }) => {
    await resetActiveEvent(OPEN);
    // A floor the Zod schema does not know about, so the refusal can only have come from
    // `register_for_event()` — which is the point of the layering.
    await setMinimumAge(30);

    try {
      const person = participant(73, '20');

      await openRegistration(page);
      await fillForm(page, person);
      await awaitToken(page);
      await submit(page);

      await expectOutcome(page, 'age_not_eligible', 'Inscrição online a partir de 12 anos');
      await expect(page.getByText('contato@euqueroadh.com')).toBeVisible();

      expect(await registrationsFor(person.e164)).toEqual([]);
      expect(await countRegistrations()).toBe(0);
    } finally {
      await setMinimumAge(12);
    }
  });

  test('accepts a 12-year-old through the ordinary flow, with no extra field', async ({ page }) => {
    await resetActiveEvent(OPEN);
    const person = participant(72, '12');

    await openRegistration(page);

    // Three fields, and no guardian field has appeared alongside them.
    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await expect(page.getByLabel('Idade')).toBeVisible();
    await expect(page.getByLabel('Celular')).toBeVisible();
    await expect(page.getByText(/respons[\u00e1a]vel/i)).toHaveCount(0);

    await fillForm(page, person);
    await awaitToken(page);
    await submit(page);

    await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');

    expect(await registrationsFor(person.e164)).toEqual([
      { status: 'confirmed', fullName: person.name, age: 12, waitlistRank: null },
    ]);
  });
});

/* ================================================================================================
 * A tampered client
 * ============================================================================================== */

test.describe('a client that has been tampered with', () => {
  test('is refused by the server, whichever field it rewrites', async ({ page }) => {
    await resetActiveEvent(OPEN);

    const attempts: [string, string, string][] = [
      ['phone', '1933456789', 'Esse número parece ser um telefone fixo.'],
      ['phone', '20991234567', 'Informe um celular válido com DDD.'],
      ['phone', '19891234567', 'Informe um celular válido com DDD.'],
      ['phone', '11111111111', 'Informe um celular válido com DDD.'],
      ['age', '0', 'Informe uma idade válida.'],
      ['age', '999', 'Informe uma idade válida.'],
      ['age', 'dezessete', 'Informe uma idade válida.'],
      ['name', '', 'Informe seu nome.'],
      ['name', 'A', 'Informe seu nome completo.'],
      ['name', 'A'.repeat(121), 'Informe seu nome completo.'],
    ];

    for (const [field, value, message] of attempts) {
      const person = participant(100 + attempts.findIndex(([f, v]) => f === field && v === value));

      await openRegistration(page);
      await fillForm(page, person);
      await awaitToken(page);

      // The browser's own checks pass — React's state still holds the valid values.
      await tamper(page, field, value);
      await submit(page);

      await expect(
        page.getByTestId('registration-alert'),
        `${field} = ${JSON.stringify(value)}`,
      ).toContainText(message);
    }

    expect(await countRegistrations()).toBe(0);
  });

  test('cannot choose its own event, status or waitlist position', async ({ page }) => {
    await resetActiveEvent(OPEN);
    const person = participant(11);

    await openRegistration(page);
    await fillForm(page, person);
    await awaitToken(page);

    // Fields the form never sends, injected by hand. The action reads three names and no others.
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) throw new Error('no form');
      for (const [name, value] of [
        ['event_id', '00000000-0000-4000-8000-000000000000'],
        ['status', 'confirmed'],
        ['waitlist_rank', '0'],
        ['capacity', '99999'],
        ['outcome', 'confirmed'],
      ]) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.append(input);
      }
    });

    await submit(page);

    // The registration lands on the real active event, with the real values, as an ordinary seat.
    await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');
    expect(await registrationsFor(person.e164)).toEqual([
      { status: 'confirmed', fullName: person.name, age: 17, waitlistRank: null },
    ]);
  });

  test('gains nothing by invoking the Server Action directly', async ({ page, request }) => {
    await resetActiveEvent(OPEN);
    const person = participant(12);

    /*
     * The real request, captured verbatim — the action id from its header and the multipart body
     * exactly as the browser encoded it, React's own `$ACTION_*` envelope included. Replaying that
     * body with one part rewritten is a genuine direct invocation: it is not a guess at the wire
     * format that the framework can reject before the action ever runs.
     */
    let actionId: string | undefined;
    let contentType: string | undefined;
    let body: string | undefined;

    page.on('request', (outgoing) => {
      const id = outgoing.headers()['next-action'];
      if (outgoing.method() !== 'POST' || !id || actionId) return;
      actionId = id;
      contentType = outgoing.headers()['content-type'];
      body = outgoing.postData() ?? undefined;
    });

    await openRegistration(page);
    await fillForm(page, person);
    const masked = await page.getByLabel('Celular').inputValue();
    await awaitToken(page);
    await submit(page);

    await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');
    expect(actionId, 'a Server Action request must have been observed').toBeTruthy();
    expect(body, 'the request body must have been captured').toBeTruthy();
    expect(body).toContain(masked);

    const before = await countRegistrations();

    // The same envelope, the same spent token, one part rewritten to a landline — a number the
    // browser would never have sent and the database must never be asked to store.
    const forged = (body as string).replace(masked, '(19) 3345-6789');
    expect(forged).not.toBe(body);

    const response = await request.post('/', {
      headers: {
        'next-action': actionId as string,
        'content-type': contentType as string,
        origin: new URL(page.url()).origin,
      },
      data: Buffer.from(forged, 'utf8'),
    });

    // Refused, whether by the framework's own boundary or by the action's parse. Either way the
    // authoritative validation never had to be trusted to the client, and nothing was written.
    expect(await response.text()).not.toContain('Inscrição confirmada');
    expect(await countRegistrations()).toBe(before);
  });
});

/* ================================================================================================
 * Double submission
 * ============================================================================================== */

test('submitting twice in quick succession creates exactly one registration', async ({ page }) => {
  await resetActiveEvent(OPEN);
  const person = participant(14);

  await openRegistration(page);
  await fillForm(page, person);
  await awaitToken(page);

  // Two submissions in the same tick, before React has re-rendered the button into its pending
  // state — a harder case than a human double tap, and one Playwright's actionability checks would
  // otherwise smooth over.
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) throw new Error('no form');
    form.requestSubmit();
    form.requestSubmit();
  });

  const panel = page.locator('[data-outcome]');
  await expect(panel).toBeVisible();
  // Either the second submission never left (the pending state held it) or it arrived and was
  // recognised as the duplicate it is. Both are correct; a second row is not.
  await expect(panel).toHaveAttribute('data-outcome', /^(confirmed|already_registered)$/);

  // The pending state is only UX. What guarantees the line below is the duplicate check inside the
  // row lock, and the partial unique index behind it.
  expect(await registrationsFor(person.e164)).toEqual([
    { status: 'confirmed', fullName: person.name, age: 17, waitlistRank: null },
  ]);
});

/* ================================================================================================
 * A narrow phone
 * ============================================================================================== */

test.describe('on a 390 px viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the whole flow is usable without a horizontal scrollbar', async ({ page }) => {
    await resetActiveEvent(OPEN);
    const person = participant(15);

    await openRegistration(page);

    const overflows = async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

    expect(await overflows(), 'the page overflows horizontally at 390 px').toBe(false);

    // The mobile keyboards the fields ask for (PRODUCT-SPEC.md § 4.2).
    await expect(page.getByLabel('Idade')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByLabel('Celular')).toHaveAttribute('inputmode', 'tel');
    await expect(page.getByLabel('Celular')).toHaveAttribute('type', 'tel');
    await expect(page.getByLabel('Nome completo')).toHaveAttribute('autocomplete', 'name');

    // 16px or more, or iOS Safari zooms the viewport on focus — which reads as a bug.
    const fontSize = await page
      .getByLabel('Celular')
      .evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);

    await fillForm(page, person);
    await awaitToken(page);

    // The widget fits, and the button is reachable without a hover.
    const widget = page.getByTestId('turnstile');
    const box = await widget.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);

    const button = page.getByRole('button', { name: 'Confirmar inscrição' });
    await expect(button).toBeVisible();
    const buttonBox = await button.boundingBox();
    expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await submit(page);
    await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');
    expect(await overflows()).toBe(false);
  });
});

/* ================================================================================================
 * Keyboard only
 * ============================================================================================== */

test('the form is operable by keyboard alone, in a sensible order', async ({ page }) => {
  await resetActiveEvent(OPEN);
  const person = participant(16);

  await openRegistration(page);

  // The skip link is the first focusable element on the page.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir para a inscrição' })).toBeFocused();

  await page.getByLabel('Nome completo').focus();
  await page.keyboard.type(person.name);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Idade')).toBeFocused();
  await page.keyboard.type(person.age);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Celular')).toBeFocused();
  await page.keyboard.type(person.digits);

  await awaitToken(page);
  await page.getByRole('button', { name: 'Confirmar inscrição' }).press('Enter');

  await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');
  // The outcome panel receives focus rather than announcing itself from nowhere.
  await expect(page.locator('[data-outcome="confirmed"]')).toBeFocused();
});

/* ================================================================================================
 * The advisory state, reached the way production reaches it
 *
 * These run last, because they are the only tests that assert what a *rendered* page says about the
 * event — and each one gets to its state through a registration whose own outcome moved the event
 * and revalidated the cached page. That is the mechanism itself under test rather than a fixture
 * pretending to be one, which is also why they are last: they leave a fresh cache entry behind.
 *
 * `closed` is the one rendered state not reachable this way: nothing a participant can do closes an
 * event, so it is an administrator's revalidation to trigger (Phase 6). It shares its rendering
 * branch with `full_closed` below — `acceptsRegistrations()` — and both are covered exhaustively in
 * `lib/domain/outcomes.test.ts`, alongside the `closed` **outcome**, which is asserted end to end
 * further up this file.
 * ============================================================================================== */

test.describe('the advisory state on the page', () => {
  test('starts open, with no count of any kind', async ({ page }) => {
    await resetActiveEvent({ capacity: 2, waitlistEnabled: true, state: 'open' });

    await openRegistration(page);

    await expect(page.getByRole('link', { name: 'Garantir minha vaga' })).toBeVisible();
    // State, never numbers: a public count would leak the organization's turnout (D19).
    await expect(page.locator('main')).not.toContainText('vagas restantes');
    await expect(page.locator('main')).not.toContainText('2 vagas');
    await expect(page.locator('main')).not.toContainText('inscritos');
  });

  test('becomes the waiting-list state when a registration takes the last seat', async ({
    page,
  }) => {
    // Capacity 2 with one seat already taken, so the registration below is the one that fills it.
    await resetActiveEvent({ capacity: 2, waitlistEnabled: true, state: 'open' });
    await occupySeats(1);

    await openRegistration(page);
    await fillForm(page, participant(17));
    await awaitToken(page);
    await submit(page);
    await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');

    // The action revalidated the page, because its own allocation changed the advisory state.
    await page.goto('/');
    await expect(
      page.getByText('As vagas confirmadas acabaram — você ainda pode entrar na lista de espera.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar na lista de espera' })).toBeVisible();
    // The form is unchanged in this state: a visitor can still join the list.
    await expect(page.getByRole('button', { name: 'Confirmar inscrição' })).toBeVisible();
  });

  test('replaces the form when the last seat goes and there is no waiting list', async ({
    page,
  }) => {
    await resetActiveEvent({ capacity: 1, waitlistEnabled: false, state: 'open' });

    // The cached page may still be showing the waiting-list state from the test above; either way
    // it offers the form, which is the point — the database decides, the page only advises.
    await page.goto('/');
    await fillForm(page, participant(18));
    await awaitToken(page);
    await submit(page);
    await expectOutcome(page, 'confirmed', 'Inscrição confirmada!');

    await page.goto('/');
    // The sentence appears twice by design (PRODUCT-SPEC.md § 4.4): once as the hero's state
    // banner, and once where the form used to be — so someone who followed a CTA anchor straight
    // to the section still learns why there is nothing to fill in.
    await expect(page.locator('header')).toContainText('As vagas para esta palestra se esgotaram.');
    await expect(page.locator('#inscricao')).toContainText(
      'As vagas para esta palestra se esgotaram.',
    );
    await expect(page.getByRole('button', { name: 'Confirmar inscrição' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Garantir minha vaga' })).toBeHidden();
    // No third-party script is loaded on a page that cannot submit anything.
    await expect(
      page.locator('script[src^="https://challenges.cloudflare.com/turnstile/"]'),
    ).toHaveCount(0);

    expect(await countRegistrations()).toBe(1);
  });
});
