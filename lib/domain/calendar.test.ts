/**
 * The three iCalendar rules that are interoperability bugs when skipped — `lib/domain/calendar.ts`.
 *
 * Every assertion here is about a file another program has to parse, which is exactly the kind of
 * output that looks right in a code review and fails in someone's calendar app.
 */
import { describe, expect, it } from 'vitest';

import { serializeCalendar, type CalendarEvent } from './calendar';

const BASE: CalendarEvent = {
  uid: 'educacao-financeira-para-jovens@exemplo.com.br',
  summary: 'Palestra — Educação Financeira para jovens',
  // 19:00 in São Paulo on the event date.
  startsAt: new Date('2026-09-19T19:00:00-03:00'),
  endsAt: new Date('2026-09-19T21:00:00-03:00'),
  location: null,
  description: null,
  url: null,
  stamp: new Date('2026-09-11T12:00:00Z'),
};

/** Content lines, unfolded — how a parser sees the file. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

describe('serializeCalendar', () => {
  it('terminates every line with CRLF, including the last', () => {
    const ics = serializeCalendar(BASE);

    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    // No bare newline anywhere: some clients reject the whole file over one.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes times as UTC, so a timezone-less client still shows the right hour', () => {
    const lines = unfold(serializeCalendar(BASE));

    // 19:00−03:00 is 22:00Z on the day; 21:00−03:00 crosses midnight into the 20th.
    expect(lines).toContain('DTSTART:20260919T220000Z');
    expect(lines).toContain('DTEND:20260920T000000Z');
    expect(lines).toContain('DTSTAMP:20260911T120000Z');
  });

  it('omits DTEND rather than inventing one when the event has no end', () => {
    const lines = unfold(serializeCalendar({ ...BASE, endsAt: null }));

    expect(lines.some((line) => line.startsWith('DTEND'))).toBe(false);
    expect(lines).toContain('DTSTART:20260919T220000Z');
  });

  it('escapes the commas in a street address instead of splitting the value', () => {
    const location = 'Espaço Cezanne Eventos, R. José Possidonio Silva, 435, Hortolândia/SP';
    const lines = unfold(serializeCalendar({ ...BASE, location }));
    const written = lines.find((line) => line.startsWith('LOCATION:'));

    expect(written).toBeDefined();
    // Every comma is escaped, so the property carries one value and not four.
    expect(written).toContain('Eventos\\, R. José Possidonio Silva\\, 435');
    expect(written?.replace(/\\,/g, '')).not.toContain(',');
  });

  it('escapes backslashes, semicolons and newlines', () => {
    const description = 'a\\b; c\nd';
    const written = unfold(serializeCalendar({ ...BASE, description })).find((line) =>
      line.startsWith('DESCRIPTION:'),
    );

    expect(written).toBe('DESCRIPTION:a\\\\b\\; c\\nd');
  });

  it('folds long lines at 75 octets and continues them with one space', () => {
    const description = 'Inscrições gratuitas e coffee break incluso. '.repeat(6);
    const ics = serializeCalendar({ ...BASE, description });

    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }

    // And it still reads back as the value that went in.
    const written = unfold(ics).find((line) => line.startsWith('DESCRIPTION:'));
    expect(written).toBe(`DESCRIPTION:${description}`);
  });

  it('never splits a multi-byte character across a fold', () => {
    // Every character is two octets, so a fold measured in characters would land mid-sequence.
    const description = 'ãçéõâàê'.repeat(20);
    const ics = serializeCalendar({ ...BASE, description });

    // A broken sequence survives the round trip as U+FFFD; an intact one does not.
    const bytes = new TextEncoder().encode(ics);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(ics);
    expect(ics).not.toContain('�');
    expect(unfold(ics).find((line) => line.startsWith('DESCRIPTION:'))).toBe(
      `DESCRIPTION:${description}`,
    );
  });
});
