import { describe, expect, it } from 'vitest';

import {
  CSV_DELIMITER,
  EXPORT_COLUMNS,
  escapeCsvCell,
  isFormulaTrigger,
  serializeCsv,
  serializeCsvRow,
  UTF8_BOM,
} from './csv';

describe('escapeCsvCell', () => {
  it.each([
    ['Maria Silva', 'Maria Silva'],
    ['João Gonçalves', 'João Gonçalves'],
    ['José Antônio de Souza Júnior', 'José Antônio de Souza Júnior'],
    ['Ana d’Ávila', 'Ana d’Ávila'],
    ['19', '19'],
    ['', ''],
  ])('leaves the ordinary value %s alone', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('renders null and undefined as an empty cell', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('renders a number without quoting it', () => {
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(0)).toBe('0');
  });

  it('quotes a value containing the semicolon delimiter', () => {
    expect(escapeCsvCell('Silva; Maria')).toBe('"Silva; Maria"');
  });

  it('does not quote a comma, which is not the delimiter here', () => {
    expect(escapeCsvCell('Silva, Maria')).toBe('Silva, Maria');
  });

  it('doubles an embedded quote and wraps the cell', () => {
    expect(escapeCsvCell('Maria "Bibi" Silva')).toBe('"Maria ""Bibi"" Silva"');
    expect(escapeCsvCell('"')).toBe('""""');
  });

  it('quotes an embedded line break so it cannot break the row', () => {
    expect(escapeCsvCell('Maria\nSilva')).toBe('"Maria\nSilva"');
    expect(escapeCsvCell('Maria\r\nSilva')).toBe('"Maria\r\nSilva"');
  });
});

describe('the formula-injection guard', () => {
  it.each([
    ['=cmd|\' /C calc\'!A0', '"\'=cmd|\' /C calc\'!A0"'],
    ['=1+1', '"\'=1+1"'],
    ['+1', '"\'+1"'],
    ['-1', '"\'-1"'],
    ['@SUM(A1)', '"\'@SUM(A1)"'],
    ['\t=cmd', '"\'\t=cmd"'],
    ['\r=cmd', '"\'\r=cmd"'],
  ])('neutralises %j', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('always quotes a guarded cell, so the apostrophe cannot be dropped by the parser', () => {
    const escaped = escapeCsvCell('=1+1');
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
    // The guard is inside the quotes, which is what makes the spreadsheet see it.
    expect(escaped).toContain('"\'=');
  });

  it('applies the guard before quoting, never after', () => {
    // A cell that needs both treatments: the apostrophe precedes the payload, and the embedded
    // quote is still doubled.
    expect(escapeCsvCell('="a"')).toBe('"\'=""a"""');
  });

  it('only looks at the first character', () => {
    expect(escapeCsvCell('1+1')).toBe('1+1');
    expect(escapeCsvCell('a=b')).toBe('a=b');
    expect(escapeCsvCell('e-mail@exemplo.com')).toBe('e-mail@exemplo.com');
  });

  it('does not treat a leading space as safe cover for a trigger', () => {
    // A leading space is not stripped by the spreadsheet parser, so ` =1+1` is inert text and is
    // left as it is. The tab and carriage return, which ARE stripped, are guarded above.
    expect(isFormulaTrigger(' =1+1')).toBe(false);
    expect(isFormulaTrigger('\t=1+1')).toBe(true);
    expect(isFormulaTrigger('\r=1+1')).toBe(true);
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])('recognises %j as a trigger', (trigger) => {
    expect(isFormulaTrigger(trigger)).toBe(true);
  });

  it('recognises nothing else as a trigger', () => {
    for (const value of ['', 'a', '1', ' ', '\n', "'", '"', 'João']) {
      expect(isFormulaTrigger(value)).toBe(false);
    }
  });
});

describe('serializeCsvRow', () => {
  it('joins cells with the semicolon delimiter', () => {
    expect(serializeCsvRow(['João', 19, '(19) 99123-4567'])).toBe('João;19;(19) 99123-4567');
  });

  it('guards a canonical phone number, which begins with a formula trigger', () => {
    // `+5519991234567` starts with `+`. Left alone, Excel evaluates it and shows 5519991234567 —
    // the guard keeps it text, which is both safe and correct.
    expect(serializeCsvRow(['+5519991234567'])).toBe('"\'+5519991234567"');
  });

  it('uses the exported delimiter', () => {
    expect(CSV_DELIMITER).toBe(';');
  });
});

describe('serializeCsv', () => {
  it('starts with the UTF-8 BOM so Brazilian Excel decodes the accents', () => {
    const csv = serializeCsv(['Nome'], [['João Gonçalves']]);

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.codePointAt(0)).toBe(0xfeff);
    expect(csv).toContain('João Gonçalves');
  });

  it('round-trips an accented name through the BOM unchanged', () => {
    const csv = serializeCsv(['Nome'], [['João Gonçalves']]);
    const body = csv.slice(UTF8_BOM.length);

    expect(body.split('\r\n')[1]).toBe('João Gonçalves');
  });

  it('separates rows with CRLF and terminates the last one', () => {
    const csv = serializeCsv(['Nome', 'Idade'], [
      ['Maria', 19],
      ['João', 21],
    ]);

    expect(csv).toBe(`${UTF8_BOM}Nome;Idade\r\nMaria;19\r\nJoão;21\r\n`);
  });

  it('writes a header-only file when there is nothing to export', () => {
    expect(serializeCsv(['Nome'], [])).toBe(`${UTF8_BOM}Nome\r\n`);
  });

  it('keeps a cell containing a newline inside its own row', () => {
    const csv = serializeCsv(['Nome'], [['Maria\nSilva']]);

    // Three physical lines, but the quoted cell means only two records.
    expect(csv).toBe(`${UTF8_BOM}Nome\r\n"Maria\nSilva"\r\n`);
  });

  it('escapes every cell, including the header', () => {
    expect(serializeCsv(['=Nome'], [['=1+1']])).toBe(`${UTF8_BOM}"'=Nome"\r\n"'=1+1"\r\n`);
  });
});

describe('EXPORT_COLUMNS', () => {
  it('is the documented column set, without the internal id', () => {
    expect(EXPORT_COLUMNS).toEqual([
      'Nome',
      'Idade',
      'Celular',
      'Status',
      'Inscrita em',
      'Posição na lista',
    ]);
  });
});
