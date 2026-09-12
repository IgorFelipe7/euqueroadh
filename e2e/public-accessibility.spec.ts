/**
 * WCAG 2.2 AA on the public surface — PRODUCT-SPEC.md acceptance criterion 23.
 *
 * Axe is run against the **built** application at a phone width and a desktop width, and on the
 * three states of the form that a visitor actually meets: the empty form, the form after a failed
 * submit, and the confirmation panel. Two of those only exist after an interaction, which is
 * precisely why a single scan of the landing state would prove very little — a contrast failure in
 * an error message or an unlabelled button in the success panel is exactly the kind of thing that
 * ships.
 *
 * Automated checks catch roughly a third of what matters. The rest — focus order, hierarchy,
 * reduced motion, the meaning of the copy — was reviewed by hand and is asserted in
 * `public-design.spec.ts`.
 *
 * Every scan waits for the page to settle first; see `settle` below for why that is a correctness
 * requirement rather than a convenience.
 *
 * Playwright runs spec files in alphabetical order, so this one runs **before** the other public
 * suites. It therefore sets the event open itself, uses its own synthetic number for the single
 * registration it makes, and resets the event afterwards — which also deletes that row — so the
 * suites after it start from exactly the state they expect.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { resetActiveEvent, syntheticName, syntheticPhone } from './support/database';

const OPEN = { capacity: 50, waitlistEnabled: false, state: 'open' } as const;

/** WCAG 2.2 AA, which is the standard PRODUCT-SPEC.md names. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Wait for the page to stop moving before measuring it.
 *
 * Axe's contrast check reads computed colours, and it blends them through every ancestor's opacity.
 * Run while the hero's 630ms entrance is still in flight, it therefore measures a gold button at
 * `opacity: 0.2` against the navy behind it, reports 1.2:1, and fails — a real reading of a state
 * that exists for half a second and that SC 1.4.3 is not about. It reproduced in roughly one run in
 * three, which is worse than a failure: it is a suite that cannot be trusted either way.
 *
 * So the scan waits for the page's own animations to finish rather than for a duration. Nothing on
 * these routes loops — the one infinite animation, the submit spinner, exists only while a
 * submission is in flight and none of these states has one — so this settles in about two seconds,
 * the counting rail's entrance being the longest of them (VISUAL-DIRECTION.md section 7.4), and
 * asserts against the page a person actually reads.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((animation) => animation.playState === 'finished' || animation.playState === 'idle'),
    undefined,
    { timeout: 10_000 },
  );
}

async function scan(page: Page, label: string): Promise<void> {
  await settle(page);

  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // Cloudflare's widget is a cross-origin iframe we do not author and cannot fix; its own
    // contents are Cloudflare's responsibility. Everything around it is still scanned.
    .exclude('[data-testid="turnstile"]')
    .analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
    `axe violations on ${label}`,
  ).toEqual([]);
}

test.beforeAll(async () => {
  await resetActiveEvent(OPEN);
});

test('the event page has no violations at 390px or at 1440px', async ({ page }) => {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Faça sua inscrição' })).toBeVisible();
    await scan(page, `/ at ${width}px`);
  }
});

test('the privacy notice has no violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: 'Privacidade', level: 1 })).toBeVisible();
  await scan(page, '/privacidade');
});

test('the failed-submit state has no violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#inscricao').scrollIntoViewIfNeeded();

  await page.getByLabel('Nome completo').fill('A');
  await page.getByLabel('Idade').fill('0');
  await page.getByLabel('Celular').fill('1933456789');
  await page.getByRole('button', { name: 'Confirmar inscrição' }).click();

  await expect(page.getByTestId('registration-alert')).toContainText('Verifique estes campos');
  await scan(page, 'the error summary and invalid fields');
});

test('the confirmation panel has no violations', async ({ page }) => {
  await resetActiveEvent(OPEN);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#inscricao').scrollIntoViewIfNeeded();

  const phone = syntheticPhone(600);
  await page.getByLabel('Nome completo').fill(syntheticName(600));
  await page.getByLabel('Idade').fill('17');
  await page.getByLabel('Celular').fill(phone.digits);

  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Confirmar inscrição' }).click();

  await expect(page.locator('[data-outcome="confirmed"]')).toBeVisible();
  await scan(page, 'the confirmation panel');

  // Leave the event as the next suite expects to find it.
  await resetActiveEvent(OPEN);
});
