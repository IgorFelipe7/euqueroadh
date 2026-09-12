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
import { ClosedPanel } from './closed-panel';
import { JourneyAnchor, JourneyCue, JourneyNode, JourneySegment } from './journey';

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
      className="u-shell relative isolate scroll-mt-6 py-16 lg:py-28"
    >
      {/* The journey's destination. The line arrives at the panel's shoulder, passes behind it and
          leaves — which is what makes the form read as the place the page has been heading. */}
      <JourneySegment />

      {/*
        The page's one climax, and it is a single gesture (VISUAL-DIRECTION.md section 10.9): when the
        line reaches this section, the panel's own edge answers once and dissolves. A direct child of
        the section and before the panel, because the rule that reads it is a sibling combinator.
      */}
      <JourneyCue name="inscricao" className="top-[18%] left-0" />

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        {/*
          The split shifts with the state, because the two states are not the same composition. With
          a form to fill, the left column carries the invitation and the recap and earns five
          columns. With the invitation withdrawn it has only the section's name to hold, so it
          narrows to four and the panel — which now carries the answer *and* the facts — takes
          eight. Same grid, same rhythm, no empty half-page.
        */}
        <div
          className={`flex flex-col gap-6 lg:pt-2 ${accepting ? 'lg:col-span-5' : 'lg:col-span-4'}`}
        >
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

            It belongs here only while there are fields to fill. When registrations are shut the
            facts move into the panel itself (`ClosedPanel`), because a stack of details propping up
            an empty heading is a leftover, and because that is what gives the state the weight the
            section needs. Moved, never repeated.
          */}
          {accepting ? (
            <dl className="mt-2 flex flex-col gap-3 border-t border-ink-600 pt-6 lg:mt-auto">
              <RecapRow term="Quando">
                {[event.weekdayDate, event.timeRange].filter(Boolean).join(' · ')}
              </RecapRow>
              {event.venueName ? <RecapRow term="Onde">{event.venueName}</RecapRow> : null}
              {event.priceLabel ? <RecapRow term="Quanto">{event.priceLabel}</RecapRow> : null}
            </dl>
          ) : null}
        </div>

        <div
          data-panel-arrival
          className={`relative ${accepting ? 'lg:col-span-7' : 'lg:col-span-8'}`}
        >
          {/* ≤ 1023px — the line comes down the gutter, marks the panel and dips behind it. */}
          <JourneyNode className="-top-7 -left-2.5 lg:hidden" ring />
          <JourneyAnchor className="top-[18%] left-[14%] lg:hidden" />
          <JourneyAnchor className="-bottom-8 -left-2.5 lg:hidden" />

          {/* ≥ 1024px — the node sits in the column gap at the panel's top-left shoulder, pointing
              into it, and the line crosses behind the panel on its way to the credits. */}
          <JourneyNode className="-top-4 -left-5 hidden lg:block" ring />
          <JourneyAnchor className="top-[26%] left-[11%] hidden lg:block" />
          <JourneyAnchor className="-bottom-10 left-[3%] hidden lg:block" />

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
            /*
              The closed composition is built here, on the server, and handed over as a node. The
              island still decides *when* it is shown — an outcome already on screen outranks it —
              but none of this markup or these facts cross into the browser's bundle.
            */
            unavailable={
              unavailableMessage ? (
                <ClosedPanel message={unavailableMessage} event={event} />
              ) : null
            }
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
