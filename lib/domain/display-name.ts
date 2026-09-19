/**
 * Turning a registered name into the form that may appear on a projector.
 *
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 3.6. The raffle stage is watched by a room and may be
 * photographed, streamed or posted. The audience is `PARA JOVENS` and some of them are minors, so a
 * full name broadcast that way is an exposure that cannot be withdrawn afterwards. `Ana S.` keeps
 * every bit of the drama — the room recognises her instantly — and gives up nothing but that.
 *
 * Pure, and unit-tested, because the interesting cases are Brazilian names that break the naive
 * `split(' ')[0] + split(' ')[1][0]`: a single-word name, a name whose second word is the particle
 * `da`, and a surname carrying an apostrophe or an accent.
 *
 * This module is imported by both server and client code, so it depends on nothing.
 */

/**
 * Portuguese name particles. They are never a surname on their own: the initial of
 * `Maria da Silva` is `S`, not `D`.
 *
 * Compared after lower-casing and accent-stripping, so `Dos` and `dos` are one entry.
 */
const PARTICLES: ReadonlySet<string> = new Set([
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'del',
  'della',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'y',
]);

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Whitespace-separated words, with the empty strings that repeated spaces produce removed. */
function words(fullName: string): string[] {
  return fullName.trim().split(/\s+/u).filter(Boolean);
}

/**
 * The first given name, unabbreviated. `Maria da Silva` → `Maria`.
 *
 * Used for the certificate's greeting and for anywhere the surname would only add length.
 */
export function firstName(fullName: string): string {
  return words(fullName)[0] ?? '';
}

/**
 * The projected form: first name plus the initial of the first real surname, as `Ana S.`
 *
 * Returns the first name alone when there is no surname to abbreviate — `Carla` stays `Carla`
 * rather than becoming `Carla .`, which would read as a rendering bug on a four-metre screen.
 *
 * The initial is upper-cased but NOT accent-stripped: `Ávila` abbreviates to `Á.`, because the
 * accent is part of how the name is written and the room can read it.
 */
export function maskedName(fullName: string): string {
  const parts = words(fullName);
  if (parts.length === 0) return '';

  const given = parts[0];

  // The first word after the given name that is not a particle. `Maria da Silva` → `Silva`.
  const surname = parts.slice(1).find((part) => !PARTICLES.has(fold(part)));
  if (!surname) return given;

  // `[...surname][0]` rather than `surname[0]`: a name beginning with a character outside the
  // Basic Multilingual Plane would otherwise be cut in half and render as a replacement glyph.
  const initial = [...surname][0];
  return `${given} ${initial.toLocaleUpperCase('pt-BR')}.`;
}
