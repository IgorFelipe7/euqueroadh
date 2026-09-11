/**
 * iCalendar serialisation for the event — PRODUCT-SPEC.md section 3.1.
 *
 * Hand-written rather than taken from a library, for the same reason there is no date library: this
 * is one `VEVENT` with six properties, and RFC 5545's three rules that actually matter here are
 * short enough to implement correctly and to test.
 *
 * The three rules, because every one of them is a real-world interoperability bug if skipped:
 *
 *   1. **CRLF line endings.** Some clients reject a file with bare `\n`.
 *   2. **Escaping.** `\`, `;`, `,` and newlines are escaped inside text values. An unescaped comma
 *      in `R. José Possidonio Silva, 435` would split `LOCATION` into two values.
 *   3. **Folding at 75 octets**, continued with a leading space — measured in *octets*, not
 *      characters, because `ç`, `ã` and `é` are two bytes each in UTF-8 and folding by character
 *      count can split a multi-byte sequence.
 *
 * Times are emitted as UTC (`…Z`). The event row stores `timestamptz`, so the instant is
 * unambiguous and every calendar client renders it in the reader's own zone — which is the right
 * behaviour even for a local event, because someone may add it while travelling.
 */

export interface CalendarEvent {
  /** Stable across regenerations: the event's own slug, which is unique by constraint. */
  readonly uid: string;
  readonly summary: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly location: string | null;
  readonly description: string | null;
  readonly url: string | null;
  /** When this file was produced. */
  readonly stamp: Date;
}

/** `20260919T220000Z` — RFC 5545's UTC date-time form. */
function toUtcStamp(value: Date): string {
  return `${value.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** RFC 5545 section 3.3.11. The backslash must be escaped first, or it escapes its own escapes. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds one content line to 75 octets, continuing with a single leading space.
 *
 * The width is counted in UTF-8 octets and the split never lands inside a multi-byte sequence:
 * a continuation that began mid-character would produce a file no parser can read.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let octets = 0;
  // The first line may use 75 octets; every continuation spends one on its leading space.
  let limit = 75;

  for (const character of line) {
    const width = encoder.encode(character).length;

    if (octets + width > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = 74;
    }

    current += character;
    octets += width;
  }

  parts.push(current);
  return parts.join('\r\n ');
}

export function serializeCalendar(event: CalendarEvent): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Palestra Educacao Financeira para Jovens//PT-BR//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${toUtcStamp(event.stamp)}`,
    `DTSTART:${toUtcStamp(event.startsAt)}`,
    ...(event.endsAt ? [`DTEND:${toUtcStamp(event.endsAt)}`] : []),
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // A trailing CRLF: the last line is a content line like any other and must be terminated.
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
