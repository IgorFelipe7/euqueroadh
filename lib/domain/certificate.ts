/**
 * The certificate's own words and lines — RAFFLE-AND-CERTIFICATE-SPEC.md § 4.5.
 *
 * Pure, and kept apart from the three surfaces that render it (the HTML page, the A4 image and the
 * story image), because those must not be able to disagree. A certificate that says "das 19h às 21h"
 * on screen and "das 19h" in the downloaded file is a defect nobody would notice until it had been
 * printed.
 *
 * Every fact comes from the event row, which was seeded from EVENT-SOURCE-OF-TRUTH.md. Nothing here
 * invents a duration, a city or a title.
 */

import type { Certificate } from '@/lib/data/public';

import { formatLongDate, formatTimeRange } from './format';
import { firstName } from './display-name';

export interface CertificateView {
  /** `CERTIFICADO DE PARTICIPAÇÃO` — the tracked-caps kicker. */
  readonly kicker: string;
  readonly fullName: string;
  /** The given name, for the page's greeting and the download file name. */
  readonly firstName: string;
  /** The recipient's name split for the two-tone display treatment. */
  readonly given: string;
  readonly family: string;
  /** The body sentence, already assembled: "participou da palestra …, realizada em …". */
  readonly statement: string;
  /** `19 de setembro de 2026` */
  readonly dateLabel: string;
  /** `19h às 21h`, or `null` when the event has no end time. */
  readonly timeLabel: string | null;
  /** `Espaço Cezanne Eventos · Hortolândia/SP`, or as much of it as exists. */
  readonly venueLabel: string | null;
  /** The event's own name, without the `Palestra` kicker. */
  readonly eventName: string;
  /** A safe, descriptive download file name. */
  readonly fileName: string;
}

/**
 * Splits a name for the display treatment, at the **first** space.
 *
 * Deliberately different from `maskedName`'s rule, which skips particles to find a surname to
 * abbreviate. Here nothing is abbreviated: everything after the given name stays, whole, in the
 * second colour, so `Maria da Silva` reads `Maria` / `da Silva` rather than losing the particle.
 */
function splitForDisplay(fullName: string): { given: string; family: string } {
  const trimmed = fullName.trim().replace(/\s+/gu, ' ');
  const space = trimmed.indexOf(' ');
  if (space === -1) return { given: trimmed, family: '' };
  return { given: trimmed.slice(0, space), family: trimmed.slice(space + 1) };
}

/**
 * A file name with no accent, no space and no separator a filesystem or a Content-Disposition header
 * would have to escape.
 */
function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60);
}

export function presentCertificate(certificate: Certificate): CertificateView {
  const start = new Date(certificate.startsAt);
  const end = certificate.endsAt ? new Date(certificate.endsAt) : null;

  const dateLabel = formatLongDate(start);
  const timeLabel = end ? formatTimeRange(start, end) : null;

  const venueParts: string[] = [];
  if (certificate.venueName) venueParts.push(certificate.venueName);

  const cityState =
    certificate.venueCity && certificate.venueState
      ? `${certificate.venueCity}/${certificate.venueState}`
      : (certificate.venueCity ?? null);
  if (cityState) venueParts.push(cityState);

  const venueLabel = venueParts.length > 0 ? venueParts.join(' · ') : null;

  /*
   * The sentence, assembled from the parts that exist. The clauses are appended rather than
   * interpolated into one template so that an event with no end time or no venue still produces a
   * grammatical sentence instead of one with a gap or a stray comma in it.
   */
  const clauses = [`participou da palestra ${certificate.eventTitle}`];
  clauses.push(`realizada em ${dateLabel}`);
  if (timeLabel) clauses.push(`das ${timeLabel.replace(' às ', ' às ')}`);

  let statement = clauses.join(', ');
  if (venueLabel) {
    const place = certificate.venueName
      ? `no ${certificate.venueName}${cityState ? `, em ${cityState}` : ''}`
      : `em ${cityState}`;
    statement = `${statement}, ${place}`;
  }
  statement = `${statement}.`;

  const { given, family } = splitForDisplay(certificate.fullName);

  return {
    kicker: 'CERTIFICADO DE PARTICIPAÇÃO',
    fullName: certificate.fullName,
    firstName: firstName(certificate.fullName),
    given,
    family,
    statement,
    dateLabel,
    timeLabel,
    venueLabel,
    eventName: certificate.eventTitle,
    // A name that reduces to nothing cannot reach here — the column requires two characters — but
    // the fallback keeps a downloaded file from ever being called `certificado-`.
    fileName: ((name) => (name ? `certificado-${name}` : 'certificado'))(slug(certificate.fullName)),
  };
}
