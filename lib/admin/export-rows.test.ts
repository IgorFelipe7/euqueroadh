import { describe, expect, it } from 'vitest';

import { UTF8_BOM } from '@/lib/domain/csv';

import { buildExportCsv, exportFilename, type ExportableRegistration } from './export-rows';

/**
 * The export is the highest-risk feature in the product: it takes personal data out of the
 * controlled environment and onto a laptop, where a spreadsheet will execute what it finds. These
 * assertions are about the file being inert and readable, not about it being pretty.
 */
function row(overrides: Partial<ExportableRegistration> = {}): ExportableRegistration {
  return {
    fullName: 'Ana Paula Ribeiro',
    age: 17,
    phoneE164: '+5519991234567',
    status: 'confirmed',
    createdAt: '2026-09-09T23:14:00.000Z',
    waitlistPosition: null,
    attendedAt: null,
    certificateUrl: 'https://exemplo.test/certificado/abc',
    ...overrides,
  };
}

describe('buildExportCsv', () => {
  it('starts with the BOM, so Brazilian Excel decodes João rather than JoÃ£o', () => {
    expect(buildExportCsv([row()]).startsWith(UTF8_BOM)).toBe(true);
  });

  it('uses the semicolon delimiter and the eight specified columns', () => {
    const [header] = buildExportCsv([]).replace(UTF8_BOM, '').split('\r\n');

    expect(header).toBe(
      'Nome;Idade;Celular;Status;Inscrita em;Posição na lista;Presença;Certificado',
    );
  });

  /**
   * The certificate URL is a capability: a row that would render "não disponível" must not carry
   * one, so an organizer cannot send a link that does not work (RAFFLE-AND-CERTIFICATE-SPEC.md
   * section 4.2).
   */
  it('writes the certificate link only for someone confirmed and present', () => {
    expect(
      buildExportCsv([row({ status: 'confirmed', attendedAt: '2026-09-19T22:04:00.000Z' })]),
    ).toContain('https://exemplo.test/certificado/abc');

    expect(buildExportCsv([row({ status: 'confirmed', attendedAt: null })])).not.toContain(
      'https://exemplo.test/certificado/abc',
    );
    expect(
      buildExportCsv([row({ status: 'cancelled', attendedAt: '2026-09-19T22:04:00.000Z' })]),
    ).not.toContain('https://exemplo.test/certificado/abc');
  });

  it('writes the human phone format, which is what an organizer will dial', () => {
    expect(buildExportCsv([row()])).toContain('(19) 99123-4567');
  });

  it('localises the status and the timestamp to pt-BR', () => {
    const file = buildExportCsv([
      row({ status: 'waitlisted', waitlistPosition: 3 }),
      row({ status: 'cancelled' }),
    ]);

    expect(file).toContain('Lista de espera');
    expect(file).toContain('Cancelada');
    // São Paulo, not UTC: 23:14Z is 20:14 local, and the file must agree with the screen.
    expect(file).toContain('09/09/2026, 20:14');
  });

  it('leaves the queue position empty for anyone not waiting', () => {
    const [, line] = buildExportCsv([row()]).replace(UTF8_BOM, '').split('\r\n');
    expect(line.endsWith(';')).toBe(true);
  });

  /*
   * A participant named `=cmd|' /C calc'!A0` is otherwise a payload. The guard is applied before
   * quoting, so the apostrophe lands inside the quoted string where the spreadsheet sees it.
   */
  it('neutralises a name that a spreadsheet would execute', () => {
    const file = buildExportCsv([row({ fullName: "=cmd|' /C calc'!A0" })]);

    expect(file).toContain('"\'=cmd');
    expect(file).not.toContain(';=cmd');
  });

  it('keeps a name containing the delimiter in one cell', () => {
    const file = buildExportCsv([row({ fullName: 'Ribeiro; Ana' })]);
    expect(file).toContain('"Ribeiro; Ana"');
  });
});

describe('exportFilename', () => {
  it('is the specified shape', () => {
    expect(exportFilename('educacao-financeira-para-jovens', new Date('2026-09-12T10:00:00Z'))).toBe(
      'inscricoes-educacao-financeira-para-jovens-2026-09-12.csv',
    );
  });

  /*
   * The filename lands in a `Content-Disposition` header. A slug carrying a quote or a newline
   * would terminate the quoted string and could inject a second directive.
   */
  it('cannot break out of the Content-Disposition header', () => {
    const name = exportFilename('evil"; x=1\r\nSet-Cookie: a=b', new Date('2026-09-12T00:00:00Z'));

    expect(name).not.toContain('"');
    expect(name).not.toContain('\r');
    expect(name).not.toContain('\n');
    expect(name).toMatch(/^inscricoes-[a-zA-Z0-9-]+-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('falls back to a name rather than producing "inscricoes--date.csv"', () => {
    expect(exportFilename('', new Date('2026-09-12T00:00:00Z'))).toBe(
      'inscricoes-evento-2026-09-12.csv',
    );
  });
});
