/**
 * Venue self check-in, end to end, against the real local database.
 *
 * Nothing here is mocked. A real browser loads the built application, Cloudflare's published test
 * widget issues a real dummy token, the Server Action verifies it against the real Siteverify
 * endpoint, and `self_check_in` identifies the guest inside a real row lock. Every assertion is made
 * twice — once on what the guest sees, once on what the database actually holds — because either
 * alone can be right while the other is wrong.
 *
 * **The viewport is a phone.** This flow exists to be used standing up, one-handed, in a doorway, and
 * a desktop-width run of it would prove almost nothing about the thing that matters.
 *
 * **The privacy claim is tested by comparison, not by inspection.** A telephone number nobody
 * registered and a telephone number shared by three people must produce the same prompt, in the same
 * order, with the same words. That is asserted by driving both and comparing what the page said.
 *
 * Every participant is synthetic. No real name, age or telephone number appears anywhere.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  closeCheckInSessions,
  isPresent,
  openCheckInSession,
  purgeCheckInSessions,
  registerPerson,
  resetActiveEvent,
  restoreSeedState,
  syntheticPhone,
  updateActiveEvent,
} from './support/database';

const OPEN = { capacity: 50, waitlistEnabled: true, state: 'open' } as const;

const TURNSTILE_INPUT = 'input[name="cf-turnstile-response"]';

/** A phone, not a laptop. 390px is an iPhone 14/15 and the middle of the range that matters. */
test.use({ viewport: { width: 390, height: 844 } });

/** The household: one telephone number, three people, two of whom are called Ana. */
const SHARED = syntheticPhone(7100);
const ALONE = syntheticPhone(7101);
const WAITLISTED = syntheticPhone(7102);

const HOUSEHOLD = [
  { name: 'Ana Souza Teste', age: 15 },
  { name: 'Ana Beatriz Souza Teste', age: 13 },
  { name: 'Bruno Souza Teste', age: 17 },
] as const;

const SOLO = { name: 'Carla Dias Teste', age: 19 } as const;

test.beforeAll(async () => {
  await resetActiveEvent(OPEN);

  for (const person of HOUSEHOLD) {
    const outcome = await registerPerson(person.name, person.age, SHARED.e164);
    expect(outcome, `${person.name} must be seated`).toBe('confirmed');
  }

  expect(await registerPerson(SOLO.name, SOLO.age, ALONE.e164)).toBe('confirmed');

  // A genuinely WAITLISTED person, to prove self check-in cannot seat somebody who has no seat.
  //
  // The capacity is narrowed to what is already taken first, and the outcome is asserted: a fixture
  // that quietly produced a fifth CONFIRMED registration would make the test below pass for the wrong
  // reason — the guest would simply check in, and nothing about the waitlist would have been tested.
  await updateActiveEvent({ capacity: HOUSEHOLD.length + 1 });
  expect(await registerPerson('Espera Lima Teste', 20, WAITLISTED.e164)).toBe('waitlisted');
});

test.afterAll(async () => {
  await purgeCheckInSessions();
  await restoreSeedState();
});

/** Opens a fresh session and lands the browser on its public page. */
async function scanQr(page: Page): Promise<string> {
  const token = await openCheckInSession();
  await page.goto(`/presenca/${token}`);
  await expect(page.getByRole('heading', { name: 'Confirmar presença' })).toBeVisible();
  return token;
}

/** Waits for the challenge to produce a token, then submits. Cloudflare's test widget always passes. */
async function submit(page: Page, label: string): Promise<void> {
  await expect(page.locator(TURNSTILE_INPUT)).toHaveValue(/.+/, { timeout: 20_000 });
  await page.getByRole('button', { name: label }).click();
}

async function fillAndSubmit(page: Page, label: string, field: string, value: string) {
  await page.getByLabel(field).fill(value);
  await submit(page, label);
}

test.describe.configure({ mode: 'serial' });

test('a live session renders the check-in form; an unknown token renders one closed state', async ({
  page,
}) => {
  await scanQr(page);
  await expect(page.getByLabel('Celular usado na inscrição')).toBeVisible();

  // An unknown token, a closed session and an expired one are one outward state.
  await page.goto('/presenca/AAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.getByRole('heading', { name: 'Check-in encerrado' })).toBeVisible();
  await expect(page.getByLabel('Celular usado na inscrição')).toHaveCount(0);
});

test('the page is never indexed and never cached', async ({ page }) => {
  const token = await openCheckInSession();
  const response = await page.goto(`/presenca/${token}`);

  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('a telephone number identifying one person checks in from a single field', async ({ page }) => {
  expect(await isPresent(SOLO.name)).toBe(false);

  await scanQr(page);
  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', ALONE.digits);

  await expect(page.getByRole('heading', { name: 'Presença confirmada' })).toBeVisible();
  expect(await isPresent(SOLO.name)).toBe(true);

  // The certificate hand-off: an address a guest can read and type later, never a personal token.
  await expect(page.getByText('/certificado')).toBeVisible();
  await expect(page.getByText(/certificado\/[A-Za-z0-9_-]{20,}/)).toHaveCount(0);
});

test('checking in again is answered kindly, not as an error', async ({ page }) => {
  await scanQr(page);
  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', ALONE.digits);

  await expect(page.getByRole('heading', { name: 'Sua presença já está confirmada' })).toBeVisible();
  expect(await isPresent(SOLO.name)).toBe(true);
});

test('a shared number asks for a first name, and then for an age when two names collide', async ({
  page,
}) => {
  await scanQr(page);

  // Step 1: the number alone cannot resolve three people.
  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', SHARED.digits);
  await expect(page.getByText('Precisamos confirmar mais uma informação.')).toBeVisible();

  // A first name that is unique on this number resolves immediately.
  await fillAndSubmit(page, 'Continuar', 'Qual é o seu primeiro nome?', 'Bruno');
  await expect(page.getByRole('heading', { name: 'Presença confirmada' })).toBeVisible();

  expect(await isPresent('Bruno Souza Teste')).toBe(true);
  expect(await isPresent('Ana Souza Teste')).toBe(false);
  expect(await isPresent('Ana Beatriz Souza Teste')).toBe(false);
});

test('the household loop returns to the name step without retyping the number', async ({ page }) => {
  await scanQr(page);

  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', SHARED.digits);
  await fillAndSubmit(page, 'Continuar', 'Qual é o seu primeiro nome?', 'Bruno');
  await expect(page.getByRole('heading', { name: /presença/i })).toBeVisible();

  // One tap, and the next member of the family is being asked for their name — no page load, no
  // number retyped, and no name of anybody else on the device.
  await page.getByRole('button', { name: 'Confirmar outra pessoa deste mesmo celular' }).click();
  await expect(page.getByLabel('Qual é o seu primeiro nome?')).toBeVisible();
  await expect(page.getByText('Ana Souza Teste')).toHaveCount(0);

  // Two people called Ana: the name is not enough, and the age breaks it.
  await fillAndSubmit(page, 'Continuar', 'Qual é o seu primeiro nome?', 'Ana');
  await expect(page.getByText('Só mais uma confirmação.')).toBeVisible();

  await fillAndSubmit(page, 'Continuar', 'Para confirmar, informe sua idade', '13');
  await expect(page.getByRole('heading', { name: 'Presença confirmada' })).toBeVisible();

  // The RIGHT Ana, and only her.
  expect(await isPresent('Ana Beatriz Souza Teste')).toBe(true);
  expect(await isPresent('Ana Souza Teste')).toBe(false);
});

test('an unknown number is asked exactly what a shared one is asked, in the same words', async ({
  page,
}) => {
  // The privacy property of migration 18, asserted at the surface a prober actually sees.
  await scanQr(page);

  // The prompt is read only once the step it belongs to is on screen: reading it the instant the
  // action resolves would capture whichever render happened to be current, which is a flake rather
  // than a measurement.
  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', '19990009999');
  await expect(page.getByLabel('Qual é o seu primeiro nome?')).toBeVisible();
  const firstPrompt = await page.getByRole('status').first().textContent();

  await fillAndSubmit(page, 'Continuar', 'Qual é o seu primeiro nome?', 'Ninguem');
  await expect(page.getByLabel('Para confirmar, informe sua idade')).toBeVisible();
  const secondPrompt = await page.getByRole('status').first().textContent();

  // And only at the end, the generic refusal — which offers a human, not a retry loop.
  await fillAndSubmit(page, 'Continuar', 'Para confirmar, informe sua idade', '30');
  await expect(page.getByRole('heading', { name: 'Não foi possível confirmar por aqui' })).toBeVisible();
  await expect(page.getByText('Procure nossa equipe na entrada.')).toBeVisible();

  // The same two prompts a shared number produces.
  expect(firstPrompt?.trim()).toBe('Precisamos confirmar mais uma informação.');
  expect(secondPrompt?.trim()).toBe('Só mais uma confirmação.');
});

test('a waitlisted person cannot self-confirm, and is told nothing about why', async ({ page }) => {
  await scanQr(page);

  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', WAITLISTED.digits);
  await fillAndSubmit(page, 'Continuar', 'Qual é o seu primeiro nome?', 'Espera');
  await fillAndSubmit(page, 'Continuar', 'Para confirmar, informe sua idade', '20');

  // The same sentence an unknown number gets. Never "você está na lista de espera".
  await expect(page.getByRole('heading', { name: 'Não foi possível confirmar por aqui' })).toBeVisible();
  await expect(page.getByText(/espera/i)).toHaveCount(0);

  expect(await isPresent('Espera Lima Teste')).toBe(false);
});

test('an invalid telephone number is refused before anything is submitted', async ({ page }) => {
  await scanQr(page);

  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', '1932114567');
  await expect(page.getByText(/telefone fixo/)).toBeVisible();
  await expect(page.getByLabel('Celular usado na inscrição')).toBeVisible();
});

test('closing check-in makes a link that was already open stop working', async ({ page }) => {
  const token = await openCheckInSession();
  await page.goto(`/presenca/${token}`);
  await expect(page.getByLabel('Celular usado na inscrição')).toBeVisible();

  // The organizer shuts the door while a guest is still holding the page.
  await closeCheckInSessions();

  await fillAndSubmit(page, 'Confirmar presença', 'Celular usado na inscrição', ALONE.digits);
  await expect(page.getByRole('heading', { name: 'Check-in encerrado' })).toBeVisible();

  // And a reload of the same URL is the same closed state.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Check-in encerrado' })).toBeVisible();
});

test('the flow works at the narrowest phone width without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await scanQr(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow, 'the check-in page must not scroll sideways on a 375px phone').toBe(false);

  // The submit control is in the thumb zone and meets the 44px floor.
  const button = page.getByRole('button', { name: 'Confirmar presença' });
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});
