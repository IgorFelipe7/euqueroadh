/**
 * CSV serialisation for the participant export — DATABASE-SECURITY.md section 10.
 *
 * The export is the single highest-risk feature in the admin: it takes personal data out of the
 * controlled environment and onto an organizer's laptop, where a spreadsheet will happily execute
 * what it finds. Everything here exists to make that file inert.
 *
 * Pure functions only. Authorization, auditing and the response headers belong to the Route
 * Handler that calls this module.
 */

/**
 * Semicolon, not comma. Brazilian Excel reads `;` as the field separator by default; a comma-
 * delimited file opens as a single column.
 */
export const CSV_DELIMITER = ';';

/**
 * Excel and LibreOffice split on CRLF; a bare LF is read inconsistently across locales.
 */
const CSV_ROW_SEPARATOR = '\r\n';

/**
 * U+FEFF. Without it Excel decodes the file as the system code page and `João Gonçalves` opens as
 * `JoÃ£o GonÃ§alves`.
 */
export const UTF8_BOM = '﻿';

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than as text.
 *
 * `=` and `@` start a formula outright; `+` and `-` start one in Excel; a leading tab or carriage
 * return is stripped by the parser before the check, so `\t=cmd` becomes `=cmd` and executes.
 * A participant named `=cmd|' /C calc'!A0` is otherwise a payload.
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'] as const;

/** True when a spreadsheet would try to evaluate this value. */
export function isFormulaTrigger(value: string): boolean {
  return FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger));
}

/**
 * Escapes one cell.
 *
 * The order matters and is the order in DATABASE-SECURITY.md section 10.3: the formula guard is
 * applied **before** quoting, so the leading apostrophe ends up inside the quoted string where the
 * spreadsheet will see it, rather than outside where the parser would discard it.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  let cell = typeof value === 'number' ? String(value) : value;

  // A leading apostrophe tells Excel and Google Sheets "this is text". It is displayed as part of
  // the cell in some viewers; that is the accepted cost of not executing it.
  if (isFormulaTrigger(cell)) {
    cell = `'${cell}`;
  }

  // Quote whenever the value could otherwise break the row or the column: the delimiter, either
  // line-break character, a quote, or the apostrophe the guard just added (which would look like
  // stray text in an unquoted cell).
  const needsQuotes =
    cell.includes(CSV_DELIMITER) ||
    cell.includes('"') ||
    cell.includes('\n') ||
    cell.includes('\r') ||
    cell.startsWith("'");

  if (!needsQuotes) return cell;

  // A literal quote is escaped by doubling it — RFC 4180.
  return `"${cell.replace(/"/g, '""')}"`;
}

/** Joins one already-typed row. */
export function serializeCsvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(CSV_DELIMITER);
}

/**
 * Builds the complete file: BOM, header row, data rows, CRLF-separated, with a trailing separator
 * so the last row is terminated like every other one.
 */
export function serializeCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [serializeCsvRow(header), ...rows.map(serializeCsvRow)];

  return UTF8_BOM + lines.join(CSV_ROW_SEPARATOR) + CSV_ROW_SEPARATOR;
}

/**
 * The export columns (section 10.8). `id` is omitted: it has no meaning outside the system, and
 * every field in the file is one more thing to lose.
 */
export const EXPORT_COLUMNS = [
  'Nome',
  'Idade',
  'Celular',
  'Status',
  'Inscrita em',
  'Posição na lista',
] as const;
