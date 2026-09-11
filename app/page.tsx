/**
 * The public event page.
 *
 * **Phase 4 is structure. There is no art direction here yet** — the composition, the title lockup,
 * the poster, the chart motif and the logo bar are VISUAL-DIRECTION.md's business and arrive in
 * Phase 5. What is final now is the semantics: the regions, the heading order, the `<dl>`, the skip
 * link, and the fact that everything except the form itself renders with no JavaScript at all.
 *
 * A Server Component, and it stays one. The only client island is the form
 * (ARCHITECTURE.md section 5), so the event information costs the browser nothing.
 *
 * **The state shown here is advisory** (PRODUCT-SPEC.md section 4.4). It is read at render time and
 * served from a 60-second cache, so a visitor can arrive from a stale copy and still be waitlisted
 * or refused — the database decides at submit time and every one of those answers has a screen.
 * The page communicates state, never numbers: no counter, no "faltam 3 vagas".
 */
import { RegistrationForm } from '@/components/registration-form';
import { getActiveEventForDisplay, type PublicEvent } from '@/lib/data/public';
import { client as publicEnv } from '@/lib/env';
import { formatLongDate, formatTimeRange, formatWeekdayDate } from '@/lib/domain/format';
import { PUBLIC_STATE_COPY, acceptsRegistrations } from '@/lib/domain/outcomes';
import { FORM_COPY } from '@/lib/registration/state';

/**
 * ISR. The page is almost entirely static event facts, and serving prerendered HTML from the CDN is
 * what makes the LCP budget reachable; the window bounds how stale the advisory banner can be. The
 * registration action revalidates on demand when an allocation actually changes that state
 * (ARCHITECTURE.md section 4).
 */
export const revalidate = 60;

const REGISTRATION_ANCHOR = 'inscricao';

export default async function Home() {
  const event = await getActiveEventForDisplay();

  if (!event) {
    // The event could not be read. Never a database sentence, never a stack frame.
    return (
      <main className="mx-auto flex max-w-[62ch] flex-col gap-4 px-5 py-16">
        <h1 className="text-h2 text-text-primary">Palestra — Educação Financeira para Jovens</h1>
        <p className="text-body">
          Não conseguimos carregar as informações do evento agora. Tente novamente em instantes.
        </p>
      </main>
    );
  }

  const banner = PUBLIC_STATE_COPY[event.state].banner;
  const cta = PUBLIC_STATE_COPY[event.state].cta;
  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;

  return (
    <>
      {/* The first focusable element on the page, and the one every CTA also points at. */}
      <a
        href={`#${REGISTRATION_ANCHOR}`}
        className="text-label sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:text-ink-900"
      >
        Ir para a inscrição
      </a>

      <main className="mx-auto flex w-full max-w-[68ch] flex-col gap-16 px-5 py-12">
        <header className="flex flex-col gap-4">
          {event.kicker ? (
            <p className="text-kicker text-sky-300 uppercase">{event.kicker}</p>
          ) : null}

          <h1 className="text-h2 text-text-primary">
            {event.title}
            {event.audienceLabel ? ` ${event.audienceLabel}` : ''}
          </h1>

          <p className="text-body">
            {formatWeekdayDate(startsAt)}
            {endsAt ? `, das ${formatTimeRange(startsAt, endsAt)}` : ''}
            {event.venueName ? ` · ${event.venueName}` : ''}
          </p>

          {banner ? (
            // `status`, not `alert`: it is the state of the page on arrival, not an interruption.
            <p role="status" className="text-body rounded-lg border border-border-strong px-4 py-3">
              {banner}
            </p>
          ) : null}

          {cta ? (
            <p>
              <a
                href={`#${REGISTRATION_ANCHOR}`}
                className="text-label inline-flex min-h-12 items-center rounded-xl bg-gold-400 px-6 text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
              >
                {cta}
              </a>
            </p>
          ) : null}
        </header>

        <EventDetails event={event} startsAt={startsAt} endsAt={endsAt} />

        <section
          id={REGISTRATION_ANCHOR}
          aria-labelledby={`${REGISTRATION_ANCHOR}-titulo`}
          className="flex flex-col gap-5 scroll-mt-6"
        >
          <div className="flex flex-col gap-2">
            <h2 id={`${REGISTRATION_ANCHOR}-titulo`} className="text-h2 text-text-primary">
              {FORM_COPY.heading}
            </h2>
            <p className="text-body">{FORM_COPY.subheading}</p>
          </div>

          {acceptsRegistrations(event.state) ? (
            /*
              Turnstile requires JavaScript, so submission does — a deliberate, disclosed trade-off
              (PRODUCT-SPEC.md section 7.3). Everything else on this page works without it. The
              organizers' contact channel belongs beside this message and is a launch prerequisite,
              not something to invent here.
            */
            <noscript>
              <p className="text-body rounded-lg border border-border-strong px-4 py-3">
                {FORM_COPY.noScript}
              </p>
            </noscript>
          ) : null}

          {/*
            Always rendered, in both states. Whether it shows the form or the reason it cannot is
            the island's own decision — see the note on `RegistrationForm`. Rendering the branch
            here instead would unmount someone's confirmation the moment their own registration
            filled the event.
          */}
          <RegistrationForm
            siteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            accepting={acceptsRegistrations(event.state)}
            unavailableMessage={banner}
          />
        </section>

        <footer className="flex flex-col gap-2 border-t border-ink-600 pt-6">
          <p className="text-hint text-text-muted">{FORM_COPY.privacy}</p>
        </footer>
      </main>
    </>
  );
}

/**
 * The factual block. Every value comes from the event row, which comes from the banner
 * (EVENT-SOURCE-OF-TRUTH.md) — nothing here is written by hand and nothing is inferred.
 */
function EventDetails({
  event,
  startsAt,
  endsAt,
}: {
  event: PublicEvent;
  startsAt: Date;
  endsAt: Date | null;
}) {
  const addressLines = [
    event.venueAddressLine,
    event.venueDistrict,
    [event.venueCity, event.venueState].filter(Boolean).join('/'),
  ].filter((line): line is string => Boolean(line));

  return (
    <section aria-labelledby="detalhes-titulo" className="flex flex-col gap-4">
      <h2 id="detalhes-titulo" className="text-h2 text-text-primary">
        Detalhes
      </h2>

      <dl className="flex flex-col gap-3">
        <Detail term="Data">{formatLongDate(startsAt)}</Detail>
        {endsAt ? <Detail term="Horário">{formatTimeRange(startsAt, endsAt)}</Detail> : null}
        {event.venueName ? <Detail term="Local">{event.venueName}</Detail> : null}
        {addressLines.length > 0 ? (
          <Detail term="Endereço">
            {addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </Detail>
        ) : null}
        {event.priceLabel ? <Detail term="Inscrição">{event.priceLabel}</Detail> : null}
        {event.includesLabel ? <Detail term="Incluso">{event.includesLabel}</Detail> : null}
      </dl>

      {addressLines.length > 0 ? (
        <p>
          <a
            className="text-label inline-flex min-h-12 items-center text-sky-300 underline"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              [event.venueName, ...addressLines].filter(Boolean).join(', '),
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Como chegar
          </a>
        </p>
      ) : null}
    </section>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-micro-label text-text-muted uppercase">{term}</dt>
      <dd className="text-body text-text-primary">{children}</dd>
    </div>
  );
}
