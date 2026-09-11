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
import type { EventPresentation } from '@/lib/domain/event-presentation';

import { CTA_SECONDARY } from './cta';
import { MapPinIcon } from './icons';

export function Details({ event }: { readonly event: EventPresentation }) {
  return (
    <section
      aria-labelledby="detalhes-titulo"
      className="border-y border-ink-600 bg-ink-800 py-16 lg:py-24"
    >
      <div className="u-shell u-reveal">
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-16">
          <div className="lg:col-span-4">
            <p className="text-micro-label text-sky-300 uppercase">Detalhes</p>
            <h2 id="detalhes-titulo" className="mt-4 text-h2 font-stretch-[105%] text-text-primary">
              Onde e quando
            </h2>
          </div>

          <div className="flex flex-col gap-8 lg:col-span-8">
            <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
              <Detail term="Data">{event.longDate}</Detail>
              {event.timeRange ? <Detail term="Horário">{event.timeRange}</Detail> : null}
              {event.venueName ? <Detail term="Local">{event.venueName}</Detail> : null}

              {event.addressLines.length > 0 ? (
                <Detail term="Endereço">
                  {event.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </Detail>
              ) : null}

              {event.priceLabel ? (
                <Detail term="Inscrição">
                  <span className="text-gold-400">{event.priceLabel}</span>
                </Detail>
              ) : null}

              {event.includesLabel ? <Detail term="Incluso">{event.includesLabel}</Detail> : null}
            </dl>

            {event.links.map ? (
              <p>
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

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-ink-600 pt-4">
      <dt className="text-micro-label text-text-muted uppercase">{term}</dt>
      {/* `anywhere` so a long street name wraps inside its column instead of widening the page. */}
      <dd className="text-body text-text-primary [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
