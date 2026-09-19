/**
 * The self-service certificate portal, end to end, against the real local database.
 *
 * The claim this file exists to prove is the one the feature's safety rests on: **a successful lookup
 * lands on the existing tokenized certificate, and an unsuccessful one reveals nothing.** Both halves
 * are asserted against the database as well as against the screen — the token the browser ended up at
 * is compared with the token that registration actually holds, and a non-attendee's refusal is
 * compared, word for word, with the refusal an unknown number gets.
 *
 * Every participant is synthetic. No real name, age or telephone number appears anywhere.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  certificateTokenFor,
  isPresent,
  registerPerson,
  resetActiveEvent,
  restoreSeedState,
  setAttendanceByName,
  setCertificatesEnabled,
  syntheticPhone,
} from './support/database';

const OPEN = { capacity: 50, waitlistEnabled: true, state: 'open' } as const;

const TURNSTILE_INPUT = 'input[name="cf-turnstile-response"]';

/** Two people on one number, both present, both called Ana — the disambiguation case. */
const SHARED = syntheticPhone(7200);
const ALONE = syntheticPhone(7201);
const ABSENT = syntheticPhone(7202);

const ATTENDEE = { name: 'Carla Dias Certificado', age: '19' } as const;
const NON_ATTENDEE = { name: 'Faltou Silva Certificado', age: '20' } as const;

test.beforeAll(async () => {
  await resetActiveEvent(OPEN);

  await registerPerson('Ana Souza Certificado', 15, SHARED.e164);
  await registerPerson('Ana Beatriz Souza Certificado', 13, SHARED.e164);
  await registerPerson(ATTENDEE.name, Number(ATTENDEE.age), ALONE.e164);
  await registerPerson(NON_ATTENDEE.name, Number(NON_ATTENDEE.age), ABSENT.e164);

  await setAttendanceByName('Ana Souza Certificado', true);
  await setAttendanceByName('Ana Beatriz Souza Certificado', true);
  await setAttendanceByName(ATTENDEE.name, true);
  // NON_ATTENDEE deliberately stays absent.

  expect(await isPresent(NON_ATTENDEE.name)).toBe(false);
});

test.afterAll(async () => {
  // `11-seed.sql` asserts the seeded value, so the switch must go back or a suite that is not even
  // running would fail.
  await setCertificatesEnabled(false);
  await restoreSeedState();
});

async function submit(page: Page, label: string): Promise<void> {
  await expect(page.locator(TURNSTILE_INPUT)).toHaveValue(/.+/, { timeout: 20_000 });
  await page.getByRole('button', { name: label }).click();
}

async function lookUp(page: Page, phone: string, firstName: string): Promise<void> {
  await page.goto('/certificado');
  await page.getByLabel('Celular').fill(phone);
  await page.getByLabel('Primeiro nome').fill(firstName);
  await submit(page, 'Encontrar meu certificado');
}

const GENERIC_REFUSAL = 'Não foi possível localizar um certificado com essas informações.';

test.describe.configure({ mode: 'serial' });

test('before the organizer releases them, the portal mounts no form at all', async ({ page }) => {
  await setCertificatesEnabled(false);
  await page.goto('/certificado');

  await expect(
    page.getByText('Os certificados deste evento ainda não foram liberados.'),
  ).toBeVisible();

  // No form means no lookup is even possible in the window between the event ending and the switch
  // being thrown — the page cannot be used to probe for registrations.
  await expect(page.getByLabel('Celular')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Encontrar meu certificado' })).toHaveCount(0);
});

test('the portal is never indexed and never cached', async ({ page }) => {
  const response = await page.goto('/certificado');

  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('an eligible attendee lands on their own tokenized certificate', async ({ page }) => {
  await setCertificatesEnabled(true);

  await lookUp(page, ALONE.digits, 'Carla');

  // The redirect is the security-critical behaviour: the capability arrives in a Location header.
  const expected = await certificateTokenFor(ATTENDEE.name);
  await expect(page).toHaveURL(new RegExp(`/certificado/${expected}$`));

  // And it is the existing certificate, unchanged.
  await expect(page.getByRole('article', { name: 'Certificado de participação' })).toBeVisible();
  // `getByRole('heading')` rather than `getByText`: Next's route announcer repeats the document title
  // in a live region, so a text match finds two nodes and says nothing about the certificate itself.
  await expect(page.getByRole('heading', { name: ATTENDEE.name })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar certificado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Versão para story' })).toBeVisible();
});

test('two attendees on one number are told apart by age, and only then', async ({ page }) => {
  await setCertificatesEnabled(true);

  await lookUp(page, SHARED.digits, 'Ana');
  await expect(page.getByText('Só mais uma confirmação.')).toBeVisible();

  // Nothing was handed over while it was ambiguous.
  await expect(page).toHaveURL(/\/certificado$/);

  await page.getByLabel('Idade').fill('13');
  await submit(page, 'Continuar');

  const expected = await certificateTokenFor('Ana Beatriz Souza Certificado');
  await expect(page).toHaveURL(new RegExp(`/certificado/${expected}$`));
  await expect(page.getByRole('heading', { name: 'Ana Beatriz Souza Certificado' })).toBeVisible();
});

test('a confirmed non-attendee is refused in the same words as an unknown number', async ({
  page,
}) => {
  await setCertificatesEnabled(true);

  // Someone who registered and did not come.
  await lookUp(page, ABSENT.digits, 'Faltou');
  await expect(page.getByText('Só mais uma confirmação.')).toBeVisible();
  await page.getByLabel('Idade').fill(NON_ATTENDEE.age);
  await submit(page, 'Continuar');

  const refusedAbsent = await page.getByTestId('certificate-not-found').textContent();
  await expect(page.getByText(GENERIC_REFUSAL)).toBeVisible();
  await expect(page).toHaveURL(/\/certificado$/);

  // Someone who never registered at all.
  await lookUp(page, '19990008888', 'Ninguem');
  await page.getByLabel('Idade').fill('30');
  await submit(page, 'Continuar');

  const refusedUnknown = await page.getByTestId('certificate-not-found').textContent();

  // Word for word identical. "Encontramos uma inscrição, mas você não esteve presente" would be a
  // disclosure about a named person to whoever typed their number.
  expect(refusedAbsent).toBe(refusedUnknown);
  await expect(page.getByText(/presen[çt]/i)).toHaveCount(0);
});

test('a wrong name on a real number is refused generically, and keeps what was typed', async ({
  page,
}) => {
  await setCertificatesEnabled(true);

  await lookUp(page, ALONE.digits, 'Xuxa');
  await page.getByLabel('Idade').fill('19');
  await submit(page, 'Continuar');

  await expect(page.getByText(GENERIC_REFUSAL)).toBeVisible();

  // The likely cause is a typo the person can see, so the form comes back populated — but the age,
  // which was a guess, is cleared.
  await expect(page.getByLabel('Celular')).toHaveValue(/9/);
  await expect(page.getByLabel('Primeiro nome')).toHaveValue('Xuxa');
});

test('both opening fields are required', async ({ page }) => {
  await setCertificatesEnabled(true);
  await page.goto('/certificado');

  await page.getByLabel('Celular').fill(ALONE.digits);
  await submit(page, 'Encontrar meu certificado');

  await expect(page.getByText('Informe seu primeiro nome.')).toBeVisible();
  await expect(page).toHaveURL(/\/certificado$/);
});

test('the certificate artefacts stay behind the token, not behind the portal', async ({ page }) => {
  await setCertificatesEnabled(true);

  const token = await certificateTokenFor(ATTENDEE.name);
  const absentToken = await certificateTokenFor(NON_ATTENDEE.name);

  // The attendee's downloads work.
  for (const path of [`/certificado/${token}/imagem`, `/certificado/${token}/story`]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }

  // The non-attendee's do not, even with a valid token — the portal loosened nothing.
  for (const path of [
    `/certificado/${absentToken}`,
    `/certificado/${absentToken}/imagem`,
    `/certificado/${absentToken}/story`,
  ]) {
    const response = await page.request.get(path);
    expect(response.headers()['content-type'] ?? '', path).not.toContain('image/png');
  }

  await page.goto(`/certificado/${absentToken}`);
  await expect(page.getByRole('heading', { name: 'Certificado não disponível' })).toBeVisible();
});

test('turning the switch back off closes the portal again immediately', async ({ page }) => {
  await setCertificatesEnabled(false);
  await page.goto('/certificado');

  await expect(
    page.getByText('Os certificados deste evento ainda não foram liberados.'),
  ).toBeVisible();
});

test('the portal works at 375px without horizontal scroll', async ({ page }) => {
  await setCertificatesEnabled(true);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/certificado');

  await expect(page.getByLabel('Celular')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow, 'the certificate portal must not scroll sideways on a 375px phone').toBe(false);
});
