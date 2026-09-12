/**
 * The registration panel when there is nothing to submit — `closed` and `full_closed`
 * (PRODUCT-SPEC.md section 4.4, VISUAL-DIRECTION.md sections 9.7 and 10.8).
 *
 * **A state is not an error, and it should not look like one.** What stood here was a single
 * sentence in a bordered box: correct, announced, and visually a fraction of the section it was
 * answering — a designed page with an undesigned hole in the middle of it. This section is the
 * destination of the page's whole narrative; arriving to find a notice the size of a form hint reads
 * as something having gone wrong rather than as an answer.
 *
 * **Not one word of new copy, and that constraint is what shaped the fix.** There is no reopening
 * date, no "we will let you know", no waiting-list hint and no contact channel — none of those facts
 * exist ([DECISIONS.md](../../docs/DECISIONS.md) records the open questions), and inventing one
 * would be far worse than a small panel. So the hierarchy is built out of three things the page
 * already has: the state's own sentence, set at the scale of the section instead of the scale of a
 * hint; the three recap facts, **moved** here from the column beside it rather than repeated; and
 * the space and the rule between them.
 *
 * The recap moves because in this state the left column has nothing to hold it up — the invitation
 * has been withdrawn, so a stack of facts beside an empty heading is a leftover. Here the same three
 * facts finish the answer: registrations are shut, and this is still when and where the talk is.
 *
 * A Server Component, handed to the client island as a prop. The island keeps the decision about
 * *when* this appears — an outcome someone is already holding must never be replaced by it — while
 * the composition stays on the server, where it costs the browser nothing.
 */
import type { EventPresentation } from '@/lib/domain/event-presentation';

export function ClosedPanel({
  message,
  event,
}: {
  /** The state's own sentence, from `PUBLIC_STATE_COPY`. The domain owns these words. */
  readonly message: string;
  readonly event: EventPresentation;
}) {
  const when = [event.weekdayDate, event.timeRange].filter(Boolean).join(' · ');

  return (
    <div className="rounded-panel border border-sky-300/40 bg-ink-800 p-6 sm:p-8 lg:p-10">
      <div className="flex flex-col gap-6">
        <p className="text-micro-label text-sky-300 uppercase">Inscrições</p>

        {/*
          `status`, not `alert`: this is the state of the page on arrival, not an interruption of
          something the visitor was doing. Set at heading scale but deliberately not a heading — the
          section already has one, and a second would put a fragment into the document outline.
        */}
        <p
          role="status"
          className="text-h2 max-w-[20ch] font-stretch-[105%] text-balance text-text-primary"
        >
          {message}
        </p>

        <dl className="mt-2 flex flex-col gap-3 border-t border-ink-600 pt-6">
          <Row term="Quando">{when}</Row>
          {event.venueName ? <Row term="Onde">{event.venueName}</Row> : null}
          {event.priceLabel ? <Row term="Quanto">{event.priceLabel}</Row> : null}
        </dl>
      </div>
    </div>
  );
}

function Row({ term, children }: { readonly term: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="text-micro-label w-[9ch] shrink-0 text-text-muted uppercase">{term}</dt>
      <dd className="text-label flex-1 text-text-primary">{children}</dd>
    </div>
  );
}
