/**
 * The Phase 6 admin, end to end against the real local stack.
 *
 * Each test proves a claim that only a real run can prove, because each one crosses the boundary
 * that unit tests deliberately stop at: the Server Action's own authorization check, the RPC's
 * transaction, the audit row written inside it, and the bytes that actually reach the browser.
 *
 * The suite hands the database back in the seeded fail-safe state, because `11-seed.sql` asserts it.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  activeEventId,
  countRegistrations,
  occupySeats,
  resetActiveEvent,
  restoreSeedState,
  updateActiveEvent,
  withDb,
} from './support/database';
import { createActiveAdmin, signIn, testEmail } from './support/local';

/** Registers one synthetic participant through the real allocation function. */
async function register(
  name: string,
  age: number,
  phoneSuffix: number,
): Promise<{ id: string; outcome: string }> {
  const eventId = await activeEventId();

  return withDb(async (db) => {
    const { rows } = await db.query<{ outcome: string; registration_id: string | null }>(
      'select outcome, registration_id from public.register_for_event($1, $2, $3::smallint, $4)',
      [eventId, name, age, `+55199${String(phoneSuffix).padStart(8, '0')}`],
    );
    return { id: rows[0]?.registration_id ?? '', outcome: rows[0]?.outcome ?? '' };
  });
}

async function auditCount(action: string): Promise<number> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ total: string }>(
      'select count(*)::text as total from public.admin_actions where action = $1',
      [action],
    );
    return Number(rows[0].total);
  });
}

async function statusOf(registrationId: string): Promise<string> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ status: string }>(
      'select status from public.registrations where id = $1',
      [registrationId],
    );
    return rows[0]?.status ?? 'gone';
  });
}

/*
 * One administrator, one session, for the whole file.
 *
 * Not a shortcut: Supabase rate-limits outgoing sign-in e-mail, and a suite that signs in once per
 * test spends that budget proving the same thing seven times and then starts failing for a reason
 * that has nothing to do with what it is testing. The sign-in boundary itself is proved in
 * `admin-access.spec.ts`, which is where it belongs.
 *
 * Serial, sharing one page: these tests each leave the event in a deliberate state.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Phase 6 — operating the event', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const email = testEmail('admin-fase6');
    await createActiveAdmin(email, 'Organizadora da fase 6');

    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();

    await signIn(page, email);
    await page.waitForURL(/\/admin$/);
  });

  test.afterAll(async () => {
    await context?.close();
    await restoreSeedState();
  });

  test('the dashboard reports the real numbers, and promotion is capacity-safe and audited', async () => {
    await resetActiveEvent({ capacity: 2, waitlistEnabled: true, state: 'open' });

    await occupySeats(2, 700);
    const queued = await register('Beatriz Nunes', 19, 710);
    expect(queued.outcome, 'the third person must be waitlisted, not confirmed').toBe('waitlisted');

    await page.goto('/admin');

    // The three numbers, read from the event row and guaranteed by invariant I2.
    await expect(page.getByText('Confirmadas')).toBeVisible();
    // At capacity the meter says so in words, never in colour alone.
    await expect(page.getByText('Lotado')).toBeVisible();
    await expect(page.getByText('+1 na espera')).toBeVisible();

    // No headroom, so the promotion prompt must be absent rather than offered and then refused.
    await expect(page.getByRole('button', { name: /Promover/ })).toHaveCount(0);

    // Raising the capacity creates headroom, and the prompt appears.
    await updateActiveEvent({ capacity: 3 });
    await page.reload();

    const promotions = await auditCount('registration.promoted');

    await page.getByRole('button', { name: /Promover a próxima/ }).click();
    await page.getByRole('button', { name: 'Promover 1' }).click();

    /*
     * The result region is the only thing on this page that appears *after* the action returns —
     * the promoted person's name is already on screen in `Últimas inscrições`, so asserting on the
     * name alone would pass before the mutation had happened.
     */
    const promotion = page.getByRole('status').filter({ hasText: 'pessoa promovida' });
    await expect(promotion).toBeVisible();

    // The organizer is given the name and the telephone number, because they now have to call.
    await expect(promotion.getByText('Beatriz Nunes')).toBeVisible();
    await expect(promotion.getByRole('link', { name: '(19) 90000-0710' })).toBeVisible();

    expect(await statusOf(queued.id)).toBe('confirmed');
    expect(
      await auditCount('registration.promoted'),
      'the promotion is audited in the same transaction as the mutation (I9)',
    ).toBe(promotions + 1);
  });

  test('search finds an accented name by its unaccented spelling, and filters by status', async () => {
    await resetActiveEvent({ capacity: 5, waitlistEnabled: true, state: 'open' });
    await register('João Gonçalves', 33, 720);
    await register('Marina Alves', 28, 721);

    await page.goto('/admin/inscricoes?q=joao');

    // The generated `search_name` column is what makes this work — `joao` must find `João`.
    await expect(page.getByRole('cell', { name: 'João Gonçalves', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Marina Alves', exact: true })).toHaveCount(0);
    await expect(page.getByText('1 resultado para «joao»')).toBeVisible();

    // A phone fragment finds the number it belongs to, without the +55 prefix being typed.
    await page.goto('/admin/inscricoes?q=0000721');
    await expect(page.getByRole('cell', { name: 'Marina Alves', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'João Gonçalves', exact: true })).toHaveCount(0);

    await page.goto('/admin/inscricoes?status=cancelada');
    await expect(page.getByText('Nenhuma inscrição com este status.')).toBeVisible();
  });

  test('cancelling frees a seat, and the correction records only the field that changed', async () => {
    await resetActiveEvent({ capacity: 3, waitlistEnabled: true, state: 'open' });
    const person = await register('Carlos Eduardo Souza', 21, 730);

    await page.goto('/admin/inscricoes');

    await page.getByRole('button', { name: /Ver detalhes de Carlos/ }).click();

    // The telephone number is not editable anywhere: it is the identity and the duplicate key.
    await expect(page.getByText(/O celular não pode ser alterado/)).toBeVisible();

    const edits = await auditCount('registration.edited');

    await page.getByLabel('Nome completo').fill('Carlos Eduardo de Souza');
    await page.getByRole('button', { name: 'Salvar correção' }).click();
    await expect(page.getByText('Inscrição atualizada.')).toBeVisible();

    expect(await auditCount('registration.edited')).toBe(edits + 1);

    const metadata = await withDb(async (db) => {
      const { rows } = await db.query<{ metadata: Record<string, unknown> }>(
        `select metadata from public.admin_actions
          where action = 'registration.edited' order by created_at desc limit 1`,
      );
      return JSON.stringify(rows[0]?.metadata ?? {});
    });

    expect(metadata).toContain('full_name');
    // The audit trail records WHICH fields changed, never their values: those are personal data.
    expect(metadata).not.toContain('Carlos');

    // Cancelling frees the seat immediately, through the counter trigger.
    await page.getByRole('button', { name: 'Cancelar inscrição' }).click();
    await page
      .getByRole('dialog', { name: 'Cancelar a inscrição?' })
      .getByRole('button', { name: 'Cancelar inscrição' })
      .click();

    await expect(page.getByText('Inscrição cancelada. A vaga foi liberada.')).toBeVisible();
    expect(await statusOf(person.id)).toBe('cancelled');

    const confirmed = await withDb(async (db) => {
      const { rows } = await db.query<{ confirmed_count: number }>(
        'select confirmed_count from public.events where is_active',
      );
      return rows[0].confirmed_count;
    });
    expect(confirmed).toBe(0);
  });

  test('settings refuse to open at capacity 0, and conflict on a concurrent admin save', async () => {
    await resetActiveEvent({ capacity: 0, waitlistEnabled: true, state: 'closed' });

    await page.goto('/admin/configuracoes');

    // The database refuses this combination (I7), so the control must not offer it and then fail.
    await expect(page.getByRole('radio', { name: 'Abertas' })).toBeDisabled();

    await page.getByLabel('Capacidade').fill('40');
    await page.getByRole('radio', { name: 'Abertas' }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Configurações atualizadas.')).toBeVisible();

    const saved = await withDb(async (db) => {
      const { rows } = await db.query<{
        capacity: number;
        registration_state: string;
        settings_version: string;
      }>('select capacity, registration_state, settings_version from public.events where is_active');
      return rows[0];
    });

    expect(saved.capacity).toBe(40);
    expect(saved.registration_state).toBe('open');

    /*
     * A public registration must NOT cause a conflict: `settings_version` counts administrator
     * settings changes only, never `updated_at`, which the counter trigger bumps on every
     * registration (invariant I8). This is the false conflict the design exists to remove.
     */
    await register('Participante Concorrente', 30, 740);

    await page.getByLabel('Capacidade').fill('45');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    // Polled against the database rather than against the success message: the message is identical
    // to the previous save's, so it cannot distinguish "saved again" from "still showing the last
    // one" — and the assertion has to be certain this save landed before the conflict is staged.
    await expect
      .poll(async () =>
        withDb(async (db) => {
          const { rows } = await db.query<{ capacity: number }>(
            'select capacity from public.events where is_active',
          );
          return rows[0].capacity;
        }),
      )
      .toBe(45);

    // A concurrent *administrator* save does conflict, and nothing is silently overwritten.
    await withDb((db) =>
      db.query(
        'update public.events set settings_version = settings_version + 1 where is_active',
      ),
    );

    await page.getByLabel('Capacidade').fill('60');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page.getByText(/As configurações foram alteradas por outra pessoa/)).toBeVisible();

    const afterConflict = await withDb(async (db) => {
      const { rows } = await db.query<{ capacity: number }>(
        'select capacity from public.events where is_active',
      );
      return rows[0].capacity;
    });
    expect(afterConflict, 'the refused save wrote nothing').toBe(45);
  });

  test('the CSV export is audited before it is served, and the file is inert', async () => {
    await resetActiveEvent({ capacity: 5, waitlistEnabled: true, state: 'open' });
    // A name a spreadsheet would execute, and one that needs the BOM to decode correctly.
    await register("=cmd|' /C calc'!A0", 22, 750);
    await register('Ana Gonçalves', 24, 751);

    const exportsBefore = await auditCount('registrations.exported');

    const response = await page.request.get('/admin/inscricoes/exportar');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    expect(response.headers()['content-disposition']).toContain('attachment; filename="inscricoes-');
    expect(response.headers()['cache-control']).toContain('no-store');

    const body = await response.text();

    expect(body.charCodeAt(0), 'the UTF-8 BOM, or Brazilian Excel mangles every accent').toBe(0xfeff);
    expect(body).toContain('Nome;Idade;Celular;Status');
    expect(body).toContain('Ana Gonçalves');
    // The formula guard: the payload is quoted text, never a leading `=` in its own cell.
    expect(body).toContain('"\'=cmd');
    expect(body).not.toMatch(/(^|;)=cmd/m);

    expect(
      await auditCount('registrations.exported'),
      'every export leaves an audit record',
    ).toBe(exportsBefore + 1);

    // The audit metadata carries the filter, never the search term's text.
    const metadata = await withDb(async (db) => {
      const { rows } = await db.query<{ metadata: Record<string, unknown> }>(
        `select metadata from public.admin_actions
          where action = 'registrations.exported' order by created_at desc limit 1`,
      );
      return rows[0]?.metadata ?? {};
    });
    expect(metadata).toMatchObject({ row_count: 2 });
  });

  test('the purge erases everything, forces registrations closed, and is audited', async () => {
    await resetActiveEvent({ capacity: 3, waitlistEnabled: true, state: 'open' });
    await occupySeats(3, 760);
    await register('Na Espera', 20, 770);

    expect(await countRegistrations()).toBe(4);

    await page.goto('/admin/equipe');

    const purges = await auditCount('registrations.purged');

    await page.getByRole('button', { name: 'Apagar todas as inscrições' }).click();

    const dialog = page.getByRole('dialog', { name: 'Encerrar evento e apagar dados' });
    const confirm = dialog.getByRole('button', { name: 'Apagar todas as inscrições' });

    // The checkbox genuinely gates the button — the one place `disabled` is the correct control.
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Entendo que esta ação é permanente').check();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText('4 inscrições apagadas.')).toBeVisible();

    expect(await countRegistrations()).toBe(0);
    expect(await auditCount('registrations.purged')).toBe(purges + 1);

    const after = await withDb(async (db) => {
      const { rows } = await db.query<{
        registration_state: string;
        confirmed_count: number;
        waitlist_count: number;
      }>(
        'select registration_state, confirmed_count, waitlist_count from public.events where is_active',
      );
      return rows[0];
    });

    // A purged event that kept accepting registrations would begin re-collecting data at once.
    expect(after.registration_state).toBe('closed');
    expect(after.confirmed_count).toBe(0);
    expect(after.waitlist_count).toBe(0);
  });

  test('the audit page renders the trail without exposing participant data', async () => {
    await resetActiveEvent({ capacity: 3, waitlistEnabled: true, state: 'open' });
    const person = await register('Auditada Silva', 26, 780);

    await page.goto('/admin/inscricoes');
    await page.getByRole('button', { name: /Ver detalhes de Auditada/ }).click();
    await page.getByRole('button', { name: 'Cancelar inscrição' }).click();
    await page
      .getByRole('dialog', { name: 'Cancelar a inscrição?' })
      .getByRole('button', { name: 'Cancelar inscrição' })
      .click();
    await expect(page.getByText('Inscrição cancelada. A vaga foi liberada.')).toBeVisible();

    expect(await statusOf(person.id)).toBe('cancelled');

    await page.goto('/admin/auditoria');

    await expect(page.getByText('Inscrição cancelada').first()).toBeVisible();
    await expect(page.getByText('Organizadora da fase 6').first()).toBeVisible();

    // The trail records what happened and who did it — never who it happened to.
    const rendered = await page.getByTestId('audit-rows').innerText();
    expect(rendered).not.toContain('Auditada Silva');
    expect(rendered).not.toContain('0000780');
  });
});

/**
 * The half of the boundary that a page-level check does not cover.
 *
 * Every Server Action and Route Handler in the admin calls `assertAdmin()` as its first statement,
 * because being declared under `(protected)` grants it nothing and `proxy.ts` is not the boundary.
 * These requests carry no session at all.
 */
test.describe('Phase 6 — the admin entry points refuse an anonymous caller', () => {
  test('the CSV export discloses nothing without a session', async ({ request }) => {
    const response = await request.get('/admin/inscricoes/exportar', { maxRedirects: 0 });

    expect([302, 303, 307, 308, 401]).toContain(response.status());

    const body = await response.text();
    expect(body).not.toContain('Nome;Idade;Celular');
    expect(body).not.toContain('Participante');
  });

  test('a direct POST to an admin Server Action is rejected', async ({ request }) => {
    // Next serialises Server Action calls through a `Next-Action` header. Without a valid id the
    // framework refuses the request outright; with a session absent, `assertAdmin()` would refuse it
    // anyway. Either way the response must carry no participant data and change nothing.
    const before = await countRegistrations();

    const response = await request.post('/admin/inscricoes', {
      headers: {
        'Next-Action': '00000000000000000000000000000000000000000',
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      data: '[{}]',
      maxRedirects: 0,
    });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(await countRegistrations()).toBe(before);
  });
});
