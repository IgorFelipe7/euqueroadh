/**
 * WCAG 2.2 AA on the admin surface.
 *
 * Every destination is scanned at a phone width and a desktop width, because the admin is a real
 * mobile product rather than a shrunken desktop one: the bottom tab bar, the priority-column table
 * and the detail panel only exist below 640 px, and a contrast or labelling failure in any of them
 * would never be seen by a scan of the desktop layout alone.
 *
 * The open `<dialog>` is scanned as its own state. Dialogs are where accessibility regressions hide
 * — an unlabelled close button, a heading that is not associated, a focus trap that lets focus
 * escape — and none of that is visible in a scan of the page behind it.
 *
 * Automated checks catch roughly a third of what matters; `admin-operations.spec.ts` asserts the
 * behaviour that a scanner cannot see.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { resetActiveEvent, restoreSeedState, activeEventId, withDb } from './support/database';
import { createActiveAdmin, signIn, testEmail } from './support/local';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const WIDTHS: readonly (readonly [number, number])[] = [
  [390, 844],
  [1440, 900],
];

async function scan(page: Page, label: string, include?: string): Promise<void> {
  /*
   * Scroll to the document's end before measuring.
   *
   * The mobile navigation is a `sticky bottom-0` bar, so above the end of the document it is
   * painted over the foot of the viewport. Whichever control happens to be there at scroll 0 is
   * reported as an obscured target — a real reading, but of a position a person scrolls past rather
   * than of a control they cannot reach. At the end of the document the bar rests in its own space,
   * and the layout's bottom padding guarantees that nothing sits under it there. That is the state
   * this asserts: every target reachable, none permanently covered.
   */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(120);

  const builder = new AxeBuilder({ page }).withTags(TAGS);
  const results = await (include ? builder.include(include) : builder).analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => `${node.target.join(' ')} :: ${node.failureSummary}`),
    })),
    `axe violations on ${label}`,
  ).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

/*
 * One signed-in session for the whole file, for the same reason as `admin-operations.spec.ts`:
 * Supabase rate-limits outgoing sign-in e-mail, and a scan suite that signs in once per test starts
 * failing for a reason that has nothing to do with accessibility.
 */
test.describe('the admin has no accessibility violations', () => {
  let context: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser }) => {
    // A populated event, so the table, the meter, the status pills and the promotion prompt are all
    // actually on the page being scanned rather than replaced by empty states.
    await resetActiveEvent({ capacity: 3, waitlistEnabled: true, state: 'open' });

    const eventId = await activeEventId();
    await withDb(async (db) => {
      for (const [index, person] of [
        ['João Gonçalves', 34],
        ['Ana Paula Ribeiro', 17],
        ['Beatriz Nunes', 16],
        ['Rafael Lima', 22],
      ].entries()) {
        await db.query('select public.register_for_event($1, $2, $3::smallint, $4)', [
          eventId,
          person[0],
          person[1],
          `+55199${String(800 + index).padStart(8, '0')}`,
        ]);
      }
    });

    const email = testEmail('admin-axe');
    await createActiveAdmin(email, 'Organizadora acessível');

    context = await browser.newContext();
    admin = await context.newPage();

    await signIn(admin, email);
    await admin.waitForURL(/\/admin$/);
  });

  test.afterAll(async () => {
    await context?.close();
    await restoreSeedState();
  });

  test('every destination passes at 390px and at 1440px', async () => {

    /*
     * Each marker is a string unique to the page's own content. The navigation labels would not do:
     * the sidebar renders them at every width and simply hides it below `md`, so `Inscrições`
     * resolves to a hidden link on a phone.
     */
    const destinations: readonly [string, string][] = [
      ['/admin', 'Confirmadas'],
      ['/admin/inscricoes', 'Buscar por nome ou celular'],
      ['/admin/configuracoes', 'Número máximo de inscrições confirmadas.'],
      ['/admin/equipe', 'Zona de risco'],
      ['/admin/auditoria', 'Toda alteração feita por um organizador'],
    ];

    for (const [width, height] of WIDTHS) {
      await admin.setViewportSize({ width, height });

      for (const [path, marker] of destinations) {
        await admin.goto(path);
        await expect(admin.getByText(marker).first()).toBeVisible();
        await scan(admin, `${path} at ${width}px`);
      }
    }
  });

  test('the sign-in page passes in both of its steps', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/admin/entrar');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await scan(page, '/admin/entrar — step 1');

    // The second step is where an unlabelled code field or an unannounced countdown would hide.
    await page.getByLabel('E-mail').fill(testEmail('axe-desconhecido'));
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();
    await scan(page, '/admin/entrar — step 2');
  });

  test('the registration detail dialog passes while it is open', async () => {
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.goto('/admin/inscricoes');

    await admin.getByRole('button', { name: /Ver detalhes de João/ }).click();

    const dialog = admin.getByRole('dialog', { name: /Inscrição de João/ });
    await expect(dialog).toBeVisible();

    // Scoped to the dialog: `showModal()` makes the rest of the document inert, and scanning the
    // inert background alongside it would report on nodes no one can reach.
    await scan(admin, 'the registration detail dialog', 'dialog');
  });
});
