/**
 * "Inscrição" — PRODUCT-SPEC.md sections 4.1 and 4.5, VISUAL-DIRECTION.md sections 5.3 and 9.
 *
 * **The form is a section of the page, not a modal.** Nothing is behind an extra tap, there is no
 * focus trap, no scroll lock and no dialog-dismissal edge case, and everything except submission
 * works with JavaScript disabled.
 *
 * Desktop is two columns: a short reassurance block and a recap of the date and venue on the left,
 * the form panel on the right. The recap exists for one reason — a desktop visitor filling in the
 * form should never have to scroll back up to check when the event is. On mobile the recap sits
 * above the panel, for the same reason.
 *
 * This is a Server Component. Only the panel's contents are a client island.
 */
import type { EventPresentation } from '@/lib/domain/event-presentation';
import { FORM_COPY } from '@/lib/registration/state';

import { RegistrationForm } from '../registration-form';

export function RegistrationSection({
  event,
  anchor,
  siteKey,
  accepting,
  unavailableMessage,
}: {
  readonly event: EventPresentation;
  readonly anchor: string;
  readonly siteKey: string;
  readonly accepting: boolean;
  readonly unavailableMessage: string | null;
}) {
  return (
    <section
      id={anchor}
      aria-labelledby={`${anchor}-titulo`}
      // `scroll-mt` so the heading is not flush against the top edge when a CTA anchors here.
      className="u-shell scroll-mt-6 py-16 lg:py-28"
    >
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col gap-6 lg:col-span-5 lg:pt-2">
          {/*
            When registrations are not open, the invitation is withdrawn rather than left standing
            above a notice that contradicts it: a heading reading "Faça sua inscrição" and a line
            promising it "leva menos de um minuto" directly above "As inscrições estão encerradas"
            is not a state, it is a contradiction. The section keeps its name and its anchor; the
            island below carries the reason.
          */}
          {accepting ? (
            <p className="text-micro-label text-sky-300 uppercase">Inscrição</p>
          ) : null}

          <h2 id={`${anchor}-titulo`} className="text-h2 font-stretch-[105%] text-text-primary">
            {accepting ? FORM_COPY.heading : 'Inscrição'}
          </h2>

          {accepting ? (
            <p className="text-body max-w-[46ch] text-text-secondary">{FORM_COPY.subheading}</p>
          ) : null}

          {/*
            The recap. Values only, in a definition list — the same three facts the `<dl>` above
            carries, kept beside the fields so filling the form never costs a scroll back.
          */}
          <dl className="mt-2 flex flex-col gap-3 border-t border-ink-600 pt-6 lg:mt-auto">
            <RecapRow term="Quando">
              {[event.weekdayDate, event.timeRange].filter(Boolean).join(' · ')}
            </RecapRow>
            {event.venueName ? <RecapRow term="Onde">{event.venueName}</RecapRow> : null}
            {event.priceLabel ? <RecapRow term="Quanto">{event.priceLabel}</RecapRow> : null}
          </dl>
        </div>

        <div className="lg:col-span-7">
          {accepting ? (
            /*
              Turnstile requires JavaScript, so submission does — a deliberate, disclosed trade-off
              (PRODUCT-SPEC.md section 7.3). Everything else on this page works without it. The
              organizers' contact channel belongs beside this message and is a launch prerequisite,
              not something to invent here.
            */
            <noscript>
              <p className="text-body mb-6 rounded-panel border border-border-strong bg-ink-800 px-5 py-4 text-text-primary">
                {FORM_COPY.noScript}
              </p>
            </noscript>
          ) : null}

          {/*
            Always rendered, in both states. Whether it shows the form or the reason it cannot is
            the island's own decision — rendering that branch here instead would unmount someone's
            confirmation the moment their own registration filled the event.
          */}
          <RegistrationForm
            siteKey={siteKey}
            accepting={accepting}
            unavailableMessage={unavailableMessage}
            links={event.links}
          />
        </div>
      </div>
    </section>
  );
}

function RecapRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="text-micro-label w-[9ch] shrink-0 text-text-muted uppercase">{term}</dt>
      <dd className="text-label flex-1 text-text-primary">{children}</dd>
    </div>
  );
}
