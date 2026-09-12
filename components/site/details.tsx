/**
 * "Detalhes" — PRODUCT-SPEC.md section 4.1, VISUAL-DIRECTION.md section 5.3.
 *
 * A `<dl>`, because this is a list of terms and their values — not four cards, not a badge cluster,
 * not a row of feature tiles with icons. Section 14 names all three as defects, and the reason is
 * the same each time: a card is a container for a *thing*, and none of these is a thing.
 *
 * Terms are wide-tracked caps in `text-muted`; values are `text-primary`. The layout is two columns
 * from `lg` and one below it, with the address allowed to span so its three lines are not squeezed
 * into half a column.
 *
 * `Gratuita` is **the one gold word on the page outside the two buttons** (section 3.4). If gold
 * appears in a fourth place, the design has drifted.
 *
 * The map pin is the only icon here, reproduced from the banner, and it is decorative: the link's
 * own text says `Como chegar`.
 */
import type { CSSProperties } from 'react';

import type { EventPresentation } from '@/lib/domain/event-presentation';

import { CTA_SECONDARY } from './cta';
import { MapPinIcon } from './icons';
import { JourneyAnchor, JourneyCue, JourneyNode, JourneyRail, JourneySegment } from './journey';

export function Details({ event }: { readonly event: EventPresentation }) {
  /*
   * The facts as data rather than as markup, for one reason: each row resolves a beat after the one
   * above it as the line passes, and a beat needs an index. Built by filtering rather than by
   * counting, so a missing venue simply closes the gap instead of leaving a hole in the sequence.
   */
  const rows: readonly { term: string; value: React.ReactNode }[] = [
    { term: 'Data', value: event.longDate },
    ...(event.timeRange ? [{ term: 'Horário', value: event.timeRange }] : []),
    ...(event.venueName ? [{ term: 'Local', value: event.venueName }] : []),
    ...(event.addressLines.length > 0
      ? [
          {
            term: 'Endereço',
            value: event.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            )),
          },
        ]
      : []),
    ...(event.priceLabel
      ? [{ term: 'Inscrição', value: <span className="text-gold-400">{event.priceLabel}</span> }]
      : []),
    ...(event.includesLabel ? [{ term: 'Incluso', value: event.includesLabel }] : []),
  ];

  return (
    <section
      aria-labelledby="detalhes-titulo"
      className="relative isolate border-y border-ink-600 bg-ink-800 py-16 lg:py-24"
    >
      {/* The only section with a surface of its own, and the one that proves the stacking: the
          line crosses the `ink-800` ground and is covered by everything printed on it. */}
      <JourneySegment />

      {/*
        The journey's third node, on the page grid rather than on any one object: in the shell's own
        left margin, a few pixels outside the measure, at both compositions. Inside the column it
        would run down the first characters of the heading — a mark in the margin is where an
        editorial note belongs anyway.

        On its own rail, outside the block that reveals, for the same reason as the poster's.
      */}
      {/*
        The cue this section's content answers to (VISUAL-DIRECTION.md section 10.9). Near the top
        edge rather than on the node: the node marks the facts in the margin two thirds of the way
        down, and gating the reveal on *that* would leave a visibly empty section sitting on screen
        while the reader waited for the line to catch up.

        A direct child of the section and before the content, because the rule that reads it is a
        sibling combinator — no `:has()`, no second observer, no JavaScript of its own.
      */}
      <JourneyCue name="detalhes" className="top-[12%] left-0" />

      <JourneyRail>
        <JourneyNode className="top-[46%] left-2.5 lg:hidden" />

        {/*
          The landing point of the crossing, on the section's own top edge. The line leaves the
          poster on the right and has to arrive on the left, and this vertex is what confines that
          diagonal to the empty band between the two sections — without it the sweep resolves
          somewhere in the middle of the section and rules a line straight through the facts.
        */}
        <JourneyAnchor className="top-3 left-2 hidden lg:block" />
        <JourneyNode className="top-[64%] left-2 hidden lg:block" />
      </JourneyRail>

      {/*
        `u-arrive`, not `u-reveal`: this section is the one place where the entrance is *caused* by
        the line rather than coinciding with it. Same additive contract as the shared reveal — the
        hidden state exists only while the journey is actually running — and one extra property, so
        the terms resolve in sequence behind the line instead of all at once.
      */}
      <div className="u-shell">
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-16">
          <div className="u-arrive lg:col-span-4">
            <p className="text-micro-label text-sky-300 uppercase">Detalhes</p>
            <h2 id="detalhes-titulo" className="mt-4 text-h2 font-stretch-[105%] text-text-primary">
              Onde e quando
            </h2>
          </div>

          <div className="flex flex-col gap-8 lg:col-span-8">
            <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
              {rows.map((row, index) => (
                <Detail key={row.term} term={row.term} step={index + 1}>
                  {row.value}
                </Detail>
              ))}
            </dl>

            {event.links.map ? (
              <p className="u-arrive" style={{ '--arrive-step': rows.length + 1 } as CSSProperties}>
                <a
                  className={CTA_SECONDARY}
                  href={event.links.map}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPinIcon size={18} />
                  Como chegar
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Detail({
  term,
  step,
  children,
}: {
  term: string;
  /** Its beat in the sequence the line triggers. */
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="u-arrive flex flex-col gap-1.5 border-t border-ink-600 pt-4"
      style={{ '--arrive-step': step } as CSSProperties}
    >
      <dt className="text-micro-label text-text-muted uppercase">{term}</dt>
      {/* `anywhere` so a long street name wraps inside its column instead of widening the page. */}
      <dd className="text-body text-text-primary [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
