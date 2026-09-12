/**
 * The admin's visual vocabulary, as a handful of class strings and four tiny Server Components.
 *
 * Not a component library. These exist because the same panel, the same button and the same status
 * pill appear on four pages, and a second definition of "what a panel looks like" is how an
 * interface starts to drift. Everything here is a Server Component or a constant: nothing in this
 * file ships JavaScript to the browser.
 *
 * Visual language: VISUAL-DIRECTION.md section 12 — light surfaces on an `#F6F7FB` field, 8 px
 * panels, 6 px controls, no pills, blue for actions, colour only for status.
 */

import type { RegistrationRowStatus } from '@/lib/admin/filters';
import { STATUS_LABELS } from '@/lib/admin/copy';

/* ------------------------------------------------------------------------------------------------
 * Controls
 * ---------------------------------------------------------------------------------------------- */

/**
 * 44 px minimum on every control (ADMIN-SPEC.md section 8). `min-h-11` is 44 px on Tailwind's 4 px
 * scale, and it is a floor rather than a fixed height so a wrapped label still fits.
 */
const CONTROL_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-admin-control)] ' +
  'px-4 text-label transition-colors duration-150 ease-settle disabled:cursor-not-allowed ' +
  'disabled:opacity-55';

export const BUTTON_PRIMARY = `${CONTROL_BASE} bg-admin-blue text-white hover:bg-admin-blue-dark`;

export const BUTTON_SECONDARY =
  `${CONTROL_BASE} border border-admin-line-strong bg-admin-surface text-admin-ink ` +
  'hover:border-admin-blue hover:text-admin-blue';

export const BUTTON_DANGER =
  `${CONTROL_BASE} border border-admin-danger bg-admin-danger text-white hover:bg-[#82091f]`;

export const BUTTON_QUIET =
  `${CONTROL_BASE} px-2 text-admin-blue underline decoration-1 underline-offset-4 ` +
  'hover:decoration-2';

export const INPUT_CLASS =
  'min-h-11 w-full rounded-[var(--radius-admin-control)] border border-admin-line-strong ' +
  'bg-admin-surface px-3 text-input text-admin-ink placeholder:text-admin-muted';

/**
 * A telephone number rendered as a dialer link.
 *
 * `min-h-6` is not decoration: WCAG 2.2 SC 2.5.8 sets a 24x24 CSS-pixel floor on pointer targets,
 * and an inline link at `text-hint` inside a 40px table row is about 20px tall — which axe reports
 * and a thumb confirms. The links matter here more than almost anywhere else in the product,
 * because on a phone this list IS the dialer an organizer uses to call the waitlist.
 */
export const PHONE_LINK =
  'inline-flex min-h-6 items-center text-admin-blue underline underline-offset-2';

export const PANEL_CLASS =
  'rounded-[var(--radius-admin-panel)] border border-admin-line bg-admin-surface';

/* ------------------------------------------------------------------------------------------------
 * Structure
 * ---------------------------------------------------------------------------------------------- */

export function Panel({
  children,
  className = '',
  ...rest
}: React.ComponentProps<'section'> & { className?: string }) {
  return (
    <section {...rest} className={`${PANEL_CLASS} ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.5rem] leading-tight font-bold text-admin-ink">{title}</h1>
        {description ? <p className="text-hint text-admin-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Status
 * ---------------------------------------------------------------------------------------------- */

const STATUS_CLASS: Readonly<Record<RegistrationRowStatus, string>> = {
  confirmed: 'bg-status-confirmed-soft text-status-confirmed',
  waitlisted: 'bg-status-waitlisted-soft text-status-waitlisted',
  cancelled: 'bg-status-cancelled-soft text-status-cancelled',
};

/**
 * A status pill. It **always** carries its text label: colour alone is not an accessible carrier of
 * information, and this list is read by people in a hurry at a door.
 *
 * The waitlist position is appended to the label rather than shown as a second badge, so the whole
 * status — `Lista de espera · 3º` — is one announced string.
 */
export function StatusPill({
  status,
  position,
}: {
  status: RegistrationRowStatus;
  position?: number | null;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-admin-control)] px-2 py-1 text-[0.8125rem] leading-tight font-semibold ${STATUS_CLASS[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
      {status === 'waitlisted' && position ? <span>· {position}º</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Numbers
 * ---------------------------------------------------------------------------------------------- */

/**
 * One of the dashboard's headline numbers.
 *
 * `value` accepts `null`, which renders `—`. That is not decoration: an organizer who reads
 * `0 confirmadas` during a database outage will act on it, so an unknown number must never be
 * rendered as a known zero (ADMIN-SPEC.md section 7.3).
 */
export function StatNumber({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[2.25rem] leading-none font-bold tabular-nums text-admin-ink">
        {value === null ? '—' : value}
      </span>
      <span className="text-hint text-admin-muted">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Feedback
 * ---------------------------------------------------------------------------------------------- */

export function Notice({
  tone,
  children,
  role,
}: {
  tone: 'info' | 'warning' | 'error' | 'success';
  children: React.ReactNode;
  role?: 'status' | 'alert';
}) {
  const toneClass = {
    info: 'border-admin-line-strong bg-admin-blue-soft text-admin-ink',
    warning: 'border-status-waitlisted/40 bg-status-waitlisted-soft text-admin-ink',
    error: 'border-admin-danger/40 bg-admin-danger-soft text-admin-ink',
    success: 'border-status-confirmed/40 bg-status-confirmed-soft text-admin-ink',
  }[tone];

  return (
    <p
      role={role}
      className={`rounded-[var(--radius-admin-control)] border px-4 py-3 text-hint ${toneClass}`}
    >
      {children}
    </p>
  );
}

/** Visually hidden, still announced. Used for table captions and skip targets. */
export const SR_ONLY =
  'absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]';
