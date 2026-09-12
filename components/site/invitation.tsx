/**
 * "O convite" — PRODUCT-SPEC.md section 4.1, VISUAL-DIRECTION.md sections 5.3 and 8.2.
 *
 * Two blocks and a deliberate asymmetry: 62ch of editorial copy on the left, the original banner
 * presented as a poster on the right, set slightly larger than its column so it overlaps the gutter.
 * Not a card grid, not two equal halves — the poster is the object and the copy is the caption.
 *
 * **The copy states only what the banner states.** Every sentence is a confirmed fact from
 * EVENT-SOURCE-OF-TRUTH.md, interpolated from the event row rather than typed out, so a change to
 * the row can never leave the prose contradicting the `<dl>` below it. There is no claim about what
 * the talk will cover, no speaker, no statistic and no promise — none of those exist in the source
 * (PRODUCT-SPEC.md section 11).
 *
 * The poster is never the LCP element: the title lockup is, and it is text. Hence `loading="lazy"`
 * and `fetchPriority="low"` — this image must not compete for the connection that renders the hero.
 */
import Image from 'next/image';

import type { EventPresentation } from '@/lib/domain/event-presentation';

import posterImage from '@/assets/event/cartaz-palestra.png';

import { JourneyAnchor, JourneyNode, JourneySegment } from './journey';

export function Invitation({ event }: { readonly event: EventPresentation }) {
  const audience = event.audienceLabel ? ` ${event.audienceLabel}` : '';

  /*
   * The poster carries information, so its alt text carries the same information (section 13,
   * item 12). A reader who cannot see it learns the date, the time, the venue and the price — not
   * that "an image of a poster" exists.
   */
  const alt =
    [
      `Cartaz do evento: ${event.kicker ? `${event.kicker} ` : ''}${event.title}${audience}`,
      [event.longDate, event.timeRange].filter(Boolean).join(', '),
      [event.venueName, event.addressLines.at(-1)].filter(Boolean).join(', '),
      [event.priceLabel, event.includesLabel].filter(Boolean).join(', '),
    ]
      .filter((part) => part.length > 0)
      .join('. ') + '.';

  return (
    <section
      aria-labelledby="convite-titulo"
      className="u-shell relative isolate py-16 lg:py-32"
    >
      {/* `isolate` is what puts the journey's slice above this section's ground and below the
          poster, so the line genuinely passes behind the object (section 10.8). */}
      <JourneySegment />

      <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
        <div className="u-reveal flex max-w-[62ch] flex-col gap-6 lg:col-span-6">
          <p className="text-micro-label text-sky-300 uppercase">O convite</p>

          <h2 id="convite-titulo" className="text-h2 font-stretch-[105%] text-text-primary">
            {`Uma noite de ${event.weekdayDate.split(',')[0]}${event.city ? `, em ${event.city}` : ''}.`}
          </h2>

          <p className="text-body text-text-secondary">
            {`Uma palestra de ${event.title.toLowerCase()}${audience}`}
            {event.timeRange ? `, das ${event.timeRange}` : ''}
            {event.venueName ? `, no ${event.venueName}` : ''}.
          </p>

          <p className="text-body text-text-secondary">
            {[event.priceLabel, event.includesLabel].filter(Boolean).join(' · ')}
            {'. Para garantir sua vaga bastam três campos: nome, idade e celular.'}
          </p>
        </div>

        {/*
          The poster sits a column wider than the copy and is pushed past its own grid track, so it
          reads as an object placed on the page rather than as an image slotted into a cell.
        */}
        {/*
          The poster overlaps the gutter (section 5.3) — but only from 1280px, where the shell is
          capped at 1200px and a gutter exists to overlap. Below that the shell already touches the
          viewport's own padding, and a viewport-relative pull put the document 17px wider than the
          screen at exactly 1024px.
        */}
        <div className="lg:col-span-5 lg:col-start-8 lg:justify-self-end min-[1280px]:-mr-10">
          {/*
            An untransformed reference box the size of the poster. The wrapper inside it is the one
            that settles, and a transform changes no layout — so the journey's points, measured
            against this box, stay pinned to where the poster ends up rather than to where it began.
          */}
          <div className="relative w-full max-w-[420px] lg:max-w-[460px]">
            <div className="u-reveal u-poster-settle">
              <Image
                src={posterImage}
                alt={alt}
                sizes="(min-width: 1024px) 460px, (min-width: 640px) 420px, 100vw"
                placeholder="blur"
                loading="lazy"
                fetchPriority="low"
                className="u-poster h-auto w-full rounded-panel border border-ink-600"
              />
            </div>

            {/*
              ≤ 1023px — the line runs in the gutter beside the copy, steps out to mark the poster,
              dips behind it and returns. One crossing is the whole gesture; the phone has no room
              for more and does not need it.
            */}
            <JourneyAnchor className="-top-8 -left-2.5 lg:hidden" />
            <JourneyNode className="top-[24%] -left-2.5 lg:hidden" />
            <JourneyAnchor className="top-[52%] left-[18%] lg:hidden" />
            <JourneyAnchor className="-bottom-8 -left-2.5 lg:hidden" />

            {/*
              ≥ 1024px — the line arrives almost vertically from the date lockup directly above,
              marks the poster's left shoulder, crosses behind it and leaves low and left, which is
              the sweep that carries it across to the details column.
            */}
            <JourneyNode className="top-[14%] -left-3.5 hidden lg:block" />
            <JourneyAnchor className="top-[46%] left-[32%] hidden lg:block" />
            <JourneyAnchor className="bottom-[7%] left-[6%] hidden lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
