/**
 * The public page's view model: every display string and every outbound link, derived once from the
 * event row so that no component formats a date or assembles an address on its own.
 *
 * Pure and dependency-free on purpose. It is built by the Server Component that renders the page
 * and then handed to the Client Component that renders the outcome panel, so it may not import
 * `server-only`, the DAL or the environment. Everything in it is already public — it is the same
 * information the page prints in full.
 *
 * Nothing here is invented. Every value is either a column of the event row
 * (EVENT-SOURCE-OF-TRUTH.md) or a formatting of one.
 */
import type { PublicEvent } from '@/lib/data/public';

import {
  formatDayNumber,
  formatLongDate,
  formatMonthAbbreviation,
  formatTimeRange,
  formatWeekdayDate,
} from './format';

/**
 * The links the confirmation panel offers (PRODUCT-SPEC.md section 6.1). Separated from the rest so
 * the Client Component receives exactly these four strings and no part of the event row.
 */
export interface EventLinks {
  /** `/evento.ics` — the calendar download. */
  readonly calendar: string;
  /** A maps search for the venue, or `null` when the row carries no address. */
  readonly map: string | null;
  /** The page's own canonical URL, used by the share action. */
  readonly page: string;
  /** What a share carries as its title. */
  readonly shareTitle: string;
}

export interface EventPresentation {
  readonly title: string;
  readonly kicker: string | null;
  readonly audienceLabel: string | null;
  /** `Educação` — everything before the final word of the title, set light and lowercase. */
  readonly titleLead: string | null;
  /** `Financeira` — the final word, set at display weight. The dominant element on the page. */
  readonly titleAccent: string;
  /** `19` */
  readonly day: string;
  /** `SET` */
  readonly month: string;
  /** `19 de setembro de 2026` */
  readonly longDate: string;
  /** `sábado, 19 de setembro` */
  readonly weekdayDate: string;
  /** `19h às 21h`, or `null` when the row has no end time. */
  readonly timeRange: string | null;
  readonly venueName: string | null;
  /** `Hortolândia` — the city alone, for prose where `Cidade/UF` would read as an address. */
  readonly city: string | null;
  /** Street, district and `Cidade/UF`, in that order, with empty lines dropped. */
  readonly addressLines: readonly string[];
  readonly priceLabel: string | null;
  readonly includesLabel: string | null;
  readonly links: EventLinks;
}

/**
 * Splits the title at its final space.
 *
 * The banner sets `educação` light and `Financeira` heavy, and the weight jump between those two
 * lines *is* the identity (VISUAL-DIRECTION.md section 6.3). Deriving the split from the stored
 * title rather than hard-coding two strings means a future event with a one-word title degrades to
 * a single display line instead of rendering an empty one.
 */
function splitTitle(title: string): { lead: string | null; accent: string } {
  const trimmed = title.trim();
  const lastSpace = trimmed.lastIndexOf(' ');

  if (lastSpace <= 0) return { lead: null, accent: trimmed };
  return { lead: trimmed.slice(0, lastSpace), accent: trimmed.slice(lastSpace + 1) };
}

export function presentEvent(event: PublicEvent, siteUrl: string): EventPresentation {
  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;
  const { lead, accent } = splitTitle(event.title);

  const addressLines = [
    event.venueAddressLine,
    event.venueDistrict,
    [event.venueCity, event.venueState].filter(Boolean).join('/'),
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  const mapQuery = [event.venueName, ...addressLines].filter(Boolean).join(', ');
  const origin = siteUrl.replace(/\/$/, '');

  return {
    title: event.title,
    kicker: event.kicker,
    audienceLabel: event.audienceLabel,
    titleLead: lead,
    titleAccent: accent,
    day: formatDayNumber(startsAt),
    month: formatMonthAbbreviation(startsAt),
    longDate: formatLongDate(startsAt),
    weekdayDate: formatWeekdayDate(startsAt),
    timeRange: endsAt ? formatTimeRange(startsAt, endsAt) : null,
    venueName: event.venueName,
    city: event.venueCity,
    addressLines,
    priceLabel: event.priceLabel,
    includesLabel: event.includesLabel,
    links: {
      calendar: '/evento.ics',
      map:
        mapQuery.length > 0
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
          : null,
      page: `${origin}/`,
      // `Palestra — Educação Financeira para jovens`: the kicker is the format and reads as a
      // prefix, while the audience qualifier belongs to the title itself.
      shareTitle: [event.kicker, [event.title, event.audienceLabel].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' — '),
    },
  };
}
