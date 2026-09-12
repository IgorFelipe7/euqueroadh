/**
 * "Realização e apoio" — PRODUCT-SPEC.md section 4.1, VISUAL-DIRECTION.md sections 5.3 and 8.3.
 *
 * A single `blue-500` panel holding the four marks reversed in white, in two labelled groups
 * separated by a vertical rule. That is not borrowed styling: it is a deliberate reproduction of the
 * banner's own footer bar, which uses exactly this structure and exactly these two labels.
 *
 * It is **not** a social-proof logo row. These are factual credits, so there is no
 * `TRUSTED BY`-style claim above them, no grayscale-to-colour hover, and nothing implying
 * endorsement beyond what the banner itself prints (section 2.3).
 *
 * ---
 *
 * **The marks are set as type, and that is a decision rather than a gap.**
 * EVENT-SOURCE-OF-TRUTH.md section 10 records that no vector logo has been supplied and offers two
 * fallbacks: crop the banner at 3×, or render the name as text. Both were considered:
 *
 *   * The banner is 1080 px wide and its logo bar is roughly 100 px tall, so a 3× crop would be an
 *     upscale of a ~90 px source — visibly soft on any laptop, and section 8.3 flags it as such.
 *   * Written permission to display the `Sicredi` mark on the web is still outstanding, and
 *     section 10 names "render `Apoio: Sicredi` as text only" as the answer while it is.
 *
 * So all four are typographic, which is crisp at every size, needs no image rights, invents no
 * artwork, and keeps the group visually consistent instead of mixing one text credit with three
 * blurry crops. The tower-and-flame marks are not redrawn: inventing a logo would be worse than
 * omitting one. When real SVGs and the Sicredi permission arrive, this component is where they go.
 *
 * The yellow the banner carries inside two of these marks is deliberately **not** reproduced here.
 * Section 8.3 retains it "where it is part of the mark" — in a typographic credit it would read as
 * a fourth use of the action colour rather than as part of a logo, and section 3.4 rations gold to
 * three places.
 */

import { JourneyAnchor, JourneyNode, JourneySegment } from './journey';

interface Organization {
  readonly name: string;
  /** The mark's own line breaks, as the banner sets them. */
  readonly lines: readonly string[];
}

/** In banner order, and spelled as the banner spells them (EVENT-SOURCE-OF-TRUTH.md section 5). */
const ORGANIZERS: readonly Organization[] = [
  { name: 'Marcados pela Graça', lines: ['Marcados', 'pela Graça'] },
  { name: 'Ministério Teen', lines: ['Ministério', 'Teen'] },
  {
    name: 'Assembleia de Deus — Ministério do Belém em Hortolândia',
    lines: ['Assembleia de Deus', 'Ministério do Belém', 'em Hortolândia'],
  },
];

const SUPPORTERS: readonly Organization[] = [{ name: 'Sicredi', lines: ['Sicredi'] }];

export function Credits() {
  return (
    // Deliberately the tightest section on the page (section 4.2). Uniform section padding is what
    // makes a page read as a template; the credits bar is a footer device and earns less air than
    // the sections that carry the event.
    <section aria-labelledby="apoio-titulo" className="u-shell relative isolate py-12 lg:py-16">
      {/*
        Where the journey resolves (section 10.8). The line comes down, flattens into a short
        horizontal run and stops on a node a few pixels above the panel's shoulder — a chart that
        has arrived rather than one that was cut off. One ending, one node, and deliberately no ring:
        the two rings on the page belong to the origin and to the action, and a third here would
        make an ending look like something to do.

        Both points sit outside the block that reveals, so the panel's 12px entrance cannot drag the
        line's last vertex with it.
      */}
      <JourneySegment />

      <h2 id="apoio-titulo" className="sr-only">
        Realização e apoio
      </h2>

      <div className="relative">
        <JourneyAnchor className="-top-3.5 left-8 lg:left-16" />
        <JourneyNode className="-top-3.5 left-[36%] lg:left-[26%]" />

        <div className="u-reveal rounded-panel bg-blue-500 px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
            <Group label="Realização" organizations={ORGANIZERS} className="lg:flex-1" />

            {/* The vertical rule the banner uses between the two groups; a horizontal one when the
                panel stacks. */}
            <div
              aria-hidden="true"
              className="h-px w-full bg-white/25 lg:h-auto lg:min-h-28 lg:w-px lg:self-stretch"
            />

            <Group label="Apoio" organizations={SUPPORTERS} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Group({
  label,
  organizations,
  className,
}: {
  readonly label: string;
  readonly organizations: readonly Organization[];
  readonly className?: string;
}) {
  return (
    <div className={`flex flex-col gap-6 ${className ?? ''}`}>
      {/*
        A wide-tracked caps micro-label, exactly as the banner labels the same two groups — and in
        solid white, as the banner also sets them. White at 75% measured 4.42:1 on `blue-500`, which
        fails AA for 12px bold, and an opacity-tinted text colour is what section 3.3 forbids in the
        first place. The hierarchy here comes from size and tracking, not from a dimmer white.
      */}
      <p className="text-micro-label text-white uppercase">{label}</p>

      <ul className="flex flex-wrap items-start gap-x-10 gap-y-6">
        {organizations.map((organization) => (
          <li key={organization.name}>
            {/*
              Optically normalised rather than mathematically equal: a three-line mark and a
              one-word wordmark set to the same pixel height look wrong (section 8.3). The
              accessible text is the organization's full name; the line breaks are presentational.
            */}
            <span className="sr-only">{organization.name}</span>
            <span
              aria-hidden="true"
              className="block text-h3 font-stretch-[95%] leading-[1.2] font-extrabold text-white uppercase tracking-[0.03em]"
            >
              {organization.lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
