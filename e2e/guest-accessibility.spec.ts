/**
 * WCAG 2.2 AA on the two guest self-service surfaces, plus the projected wall.
 *
 * Axe is run against the **built** application at a phone width, on the states a guest actually
 * meets: the opening field, a later step the server asked for, a success panel and a refusal. Three
 * of those only exist after an interaction, which is why a single scan of the landing state would
 * prove very little — an unlabelled control in a step the flow reaches only sometimes is exactly the
 * kind of thing that ships.
 *
 * The wall is scanned too, at projector width. It is not a page anybody navigates with a screen
 * reader, but it is a page an organizer may have to tab through to reach the fullscreen control, and
 * a contrast failure on it is a QR nobody can scan.
 *
 * Automated checks catch roughly a third of what matters; the rest was reviewed by hand.
 *
 * This file is named to sort before `self-check-in` and `certificate-portal`, so it sets the state it
 * needs itself and hands the database back afterwards.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  openCheckInSession,
  purgeCheckInSessions,
  registerPerson,
  resetActiveEvent,
  restoreSeedState,
  setAttendanceByName,
  setCertificatesEnabled,
  syntheticPhone,
} from './support/database';

const OPEN = { capacity: 50, waitlistEnabled: true, state: 'open' } as const;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const TURNSTILE_INPUT = 'input[name="cf-turnstile-response"]';

const SHARED = syntheticPhone(7300);

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(async () => {
  await resetActiveEvent(OPEN);
  await registerPerson('Ana Acessivel Teste', 15, SHARED.e164);
  await registerPerson('Bruno Acessivel Teste', 17, SHARED.e164);
  await setAttendanceByName('Ana Acessivel Teste', true);
  await setCertificatesEnabled(true);
});

test.afterAll(async () => {
  await setCertificatesEnabled(false);
  await purgeCheckInSessions();
  await restoreSeedState();
});

/**
 * Wait for the page to stop moving before measuring it.
 *
 * Axe's contrast check reads computed colours through every ancestor's opacity, so running it while
 * an entrance is still in flight measures a state that exists for half a second and that SC 1.4.3 is
 * not about. The same reasoning — and the same helper — as `public-accessibility.spec.ts`.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.getAnimations().every((animation) => animation.playState !== 'running'),
    undefined,
    { timeout: 10_000 },
  ).catch(() => {
    // An animation that never settles is a finding of its own, and the design forbids infinite loops
    // on these surfaces — but a timeout here must not mask the accessibility result below it.
  });
}

async function scan(page: Page, label: string): Promise<void> {
  await settle(page);

  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // Cloudflare's widget is a cross-origin iframe whose internals are not ours to fix, and axe
    // cannot reach into it anyway. Everything around it is scanned.
    .exclude('.u-challenge')
    .analyze();

  expect(results.violations.map((v) => `${v.id}: ${v.help}`), label).toEqual([]);
}

async function submit(page: Page, label: string): Promise<void> {
  await expect(page.locator(TURNSTILE_INPUT)).toHaveValue(/.+/, { timeout: 20_000 });
  await page.getByRole('button', { name: label }).click();
}

test('self check-in: every state a guest meets', async ({ page }) => {
  const token = await openCheckInSession();

  await page.goto(`/presenca/${token}`);
  await expect(page.getByLabel('Celular usado na inscrição')).toBeVisible();
  await scan(page, 'check-in, opening field');

  // The step the server asked for.
  await page.getByLabel('Celular usado na inscrição').fill(SHARED.digits);
  await submit(page, 'Confirmar presença');
  await expect(page.getByLabel('Qual é o seu primeiro nome?')).toBeVisible();
  await scan(page, 'check-in, first-name step');

  // The success panel, including the check-mark animation and the certificate hand-off.
  await page.getByLabel('Qual é o seu primeiro nome?').fill('Bruno');
  await submit(page, 'Continuar');
  await expect(page.getByRole('heading', { name: 'Presença confirmada' })).toBeVisible();
  await scan(page, 'check-in, success panel');

  // A validation message under a field.
  await page.getByRole('button', { name: 'Confirmar outra pessoa deste mesmo celular' }).click();
  await expect(page.getByLabel('Qual é o seu primeiro nome?')).toBeVisible();
  await scan(page, 'check-in, household loop');
});

test('self check-in: the closed state', async ({ page }) => {
  await page.goto('/presenca/AAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.getByRole('heading', { name: 'Check-in encerrado' })).toBeVisible();
  await scan(page, 'check-in, closed session');
});

test('the certificate portal: released, ambiguous and refused', async ({ page }) => {
  await page.goto('/certificado');
  await expect(page.getByLabel('Celular')).toBeVisible();
  await scan(page, 'certificate portal, opening fields');

  await page.getByLabel('Celular').fill(SHARED.digits);
  await page.getByLabel('Primeiro nome').fill('Ninguem');
  await submit(page, 'Encontrar meu certificado');
  await expect(page.getByLabel('Idade')).toBeVisible();
  await scan(page, 'certificate portal, age step');

  await page.getByLabel('Idade').fill('44');
  await submit(page, 'Continuar');
  await expect(page.getByTestId('certificate-not-found')).toBeVisible();
  await scan(page, 'certificate portal, generic refusal');
});

test('the certificate portal: the unreleased state', async ({ page }) => {
  await setCertificatesEnabled(false);
  await page.goto('/certificado');
  await expect(
    page.getByText('Os certificados deste evento ainda não foram liberados.'),
  ).toBeVisible();
  await scan(page, 'certificate portal, not yet released');

  await setCertificatesEnabled(true);
});

test('reduced motion resolves every state immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const token = await openCheckInSession();
  await page.goto(`/presenca/${token}`);

  await page.getByLabel('Celular usado na inscrição').fill(SHARED.digits);
  await submit(page, 'Confirmar presença');
  await page.getByLabel('Qual é o seu primeiro nome?').fill('Ana');
  await submit(page, 'Continuar');

  await expect(page.getByRole('heading', { name: /presença/i })).toBeVisible();

  // The claim worth asserting is that nothing LOOPS. A CSS transition that happens to be mid-flight
  // on the frame this runs would make a "nothing is running" check a coin toss, and it is not what
  // § 10.6 is about: reduced motion forbids a page that keeps moving, not a 150ms colour change.
  const endless = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => {
        const timing = (animation.effect as KeyframeEffect | null)?.getTiming();
        return timing?.iterations === Infinity;
      })
      .map((animation) => (animation as CSSAnimation).animationName ?? 'unnamed'),
  );
  expect(endless, 'no animation may loop under reduced motion').toEqual([]);

  // And the page has arrived: the decorative stroke on the success panel is at its final state rather
  // than partway through being drawn.
  await settle(page);

  await scan(page, 'check-in, reduced motion');
});
