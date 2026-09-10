import { describe, expect, it } from 'vitest';

import {
  EVENT_TIME_ZONE,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatTime,
  formatTimeRange,
  formatWeekdayDate,
} from './format';

/**
 * The confirmed event, EVENT-SOURCE-OF-TRUTH.md section 2. Written with the `-03:00` offset
 * exactly as the seed does; Brazil has not observed daylight saving since 2019, so the offset on
 * this date is stable.
 */
const EVENT_START = new Date('2026-09-19T19:00:00-03:00');
const EVENT_END = new Date('2026-09-19T21:00:00-03:00');

describe('the confirmed event fixture', () => {
  it('formats the public display forms from EVENT-SOURCE-OF-TRUTH', () => {
    expect(formatLongDate(EVENT_START)).toBe('19 de setembro de 2026');
    expect(formatWeekdayDate(EVENT_START)).toBe('sábado, 19 de setembro');
    expect(formatTimeRange(EVENT_START, EVENT_END)).toBe('19h às 21h');
  });

  it('formats the short forms', () => {
    expect(formatDate(EVENT_START)).toBe('19/09/2026');
    expect(formatTime(EVENT_START)).toBe('19:00');
    expect(formatTime(EVENT_END)).toBe('21:00');
  });
});

describe('the America/Sao_Paulo binding', () => {
  it('is the documented time zone', () => {
    expect(EVENT_TIME_ZONE).toBe('America/Sao_Paulo');
  });

  it('formats a UTC instant in São Paulo time, not in UTC', () => {
    // 22:00 UTC on the 19th is 19:00 in São Paulo on the same day.
    expect(formatDateTime(new Date('2026-09-19T22:00:00Z'))).toBe('19/09/2026, 19:00');
  });

  it('keeps an instant late in the UTC day on the correct São Paulo date', () => {
    // 01:30 UTC on the 20th is still 22:30 on the 19th in São Paulo. A formatter bound to the
    // machine's zone would move this registration to the wrong day in the admin list.
    expect(formatDateTime(new Date('2026-09-20T01:30:00Z'))).toBe('19/09/2026, 22:30');
  });

  it('uses the stable -03:00 offset, because Brazil no longer observes daylight saving', () => {
    // Mid-summer in the southern hemisphere: before 2019 this would have been -02:00.
    expect(formatDateTime(new Date('2027-01-15T15:00:00Z'))).toBe('15/01/2027, 12:00');
  });

  it('handles midnight without rolling the date', () => {
    expect(formatDateTime(new Date('2026-09-19T03:00:00Z'))).toBe('19/09/2026, 00:00');
  });
});

describe('formatTimeRange', () => {
  it('drops the minutes on a whole hour', () => {
    expect(
      formatTimeRange(new Date('2026-09-19T14:00:00-03:00'), new Date('2026-09-19T16:00:00-03:00')),
    ).toBe('14h às 16h');
  });

  it('keeps the minutes when there are any', () => {
    expect(
      formatTimeRange(new Date('2026-09-19T19:30:00-03:00'), new Date('2026-09-19T21:15:00-03:00')),
    ).toBe('19h30 às 21h15');
  });

  it('does not pad the hour', () => {
    expect(
      formatTimeRange(new Date('2026-09-19T09:00:00-03:00'), new Date('2026-09-19T11:00:00-03:00')),
    ).toBe('9h às 11h');
  });
});

describe('pt-BR conventions', () => {
  it('writes the date day-first', () => {
    expect(formatDate(new Date('2026-03-04T12:00:00-03:00'))).toBe('04/03/2026');
  });

  it('names the month in Portuguese', () => {
    expect(formatLongDate(new Date('2026-08-01T12:00:00-03:00'))).toBe('1 de agosto de 2026');
  });

  it('writes the weekday in lower case, as Portuguese does', () => {
    expect(formatWeekdayDate(new Date('2026-09-21T12:00:00-03:00'))).toBe(
      'segunda-feira, 21 de setembro',
    );
  });

  it('uses a 24-hour clock with no meridiem', () => {
    const formatted = formatTime(new Date('2026-09-19T20:05:00-03:00'));

    expect(formatted).toBe('20:05');
    expect(formatted).not.toMatch(/[ap]\.?m\.?/i);
  });
});
