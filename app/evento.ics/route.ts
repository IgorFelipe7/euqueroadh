/**
 * `/evento.ics` — the calendar download offered by the confirmation panel
 * (PRODUCT-SPEC.md section 6.1).
 *
 * Derived from the same event row the page renders and cached on the same 60-second window, so the
 * two can never disagree about when the event is.
 *
 * It carries **no personal data**: the file is identical for every visitor, which is also why it can
 * be cached at all. It is offered after a confirmation, but it is not a receipt and nothing in it
 * identifies who downloaded it.
 */
import { serializeCalendar } from '@/lib/domain/calendar';
import { formatLongDate, formatTimeRange } from '@/lib/domain/format';
import { getActiveEventForDisplay } from '@/lib/data/public';
import { client as publicEnv } from '@/lib/env';

export const revalidate = 60;

export async function GET(): Promise<Response> {
  const event = await getActiveEventForDisplay();

  if (!event) {
    // Never a database sentence. The page renders its own error state; this endpoint simply has
    // nothing to serve.
    return new Response('Evento indisponível.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;
  const origin = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');

  const location = [
    event.venueName,
    event.venueAddressLine,
    event.venueDistrict,
    [event.venueCity, event.venueState].filter(Boolean).join('/'),
  ]
    .filter(Boolean)
    .join(', ');

  const body = serializeCalendar({
    uid: `${event.slug}@${new URL(origin).host}`,
    summary: [event.kicker, [event.title, event.audienceLabel].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(' — '),
    startsAt,
    endsAt,
    location: location.length > 0 ? location : null,
    description: [
      [formatLongDate(startsAt), endsAt ? formatTimeRange(startsAt, endsAt) : null]
        .filter(Boolean)
        .join(', '),
      [event.priceLabel, event.includesLabel].filter(Boolean).join('. '),
    ]
      .filter((part) => part.length > 0)
      .join('. '),
    url: `${origin}/`,
    stamp: new Date(),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="evento.ics"',
    },
  });
}
