/**
 * pt-BR date and time formatting — EVENT-SOURCE-OF-TRUTH.md section 2.
 *
 * Every function here is bound to `America/Sao_Paulo` rather than to the reader's machine. An
 * organizer opening the admin from another time zone must still see the times the participants
 * were told, and a server rendering in UTC must not shift the event by three hours.
 *
 * `Intl` is used directly. A date library would add weight for behaviour the platform already has.
 */

export const EVENT_TIME_ZONE = 'America/Sao_Paulo';
const LOCALE = 'pt-BR';

/**
 * Formatters are constructed once. Building an `Intl.DateTimeFormat` is comparatively expensive,
 * and the admin list formats one date per row.
 */
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EVENT_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EVENT_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EVENT_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const weekdayDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EVENT_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EVENT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/** `19/09/2026` — the admin table and any dense listing. */
export function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

/** `19/09/2026, 19:00` — a registration timestamp. */
export function formatDateTime(value: Date): string {
  return dateTimeFormatter.format(value);
}

/** `19 de setembro de 2026` — the public event details. */
export function formatLongDate(value: Date): string {
  return longDateFormatter.format(value);
}

/**
 * `sábado, 19 de setembro` — the confirmation panel.
 *
 * `Intl` renders the weekday in lower case in pt-BR, which is correct Portuguese; capitalisation,
 * where a sentence needs it, is a CSS or copy decision at the point of use.
 */
export function formatWeekdayDate(value: Date): string {
  return weekdayDateFormatter.format(value);
}

/** `19:00`. */
export function formatTime(value: Date): string {
  return timeFormatter.format(value);
}

/**
 * `19h às 21h` — how a Brazilian reader expects an event window, and how the banner writes it.
 *
 * A time with minutes keeps them (`19h30`); a time on the hour drops the `00`, because `19h00 às
 * 21h00` reads as a timetable rather than as an invitation.
 */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatHourLabel(start)} às ${formatHourLabel(end)}`;
}

function formatHourLabel(value: Date): string {
  const [hour, minute] = formatTime(value).split(':');

  return minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}
