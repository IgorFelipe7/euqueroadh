/**
 * Canonical participant identity — the TypeScript half of `public.registration_identity_key()`.
 *
 * Two questions are decided by this normalization and by nothing else:
 *
 *   * **"Is this the same person?"** at registration time, where it is the duplicate rule
 *     (migration 16, PRODUCT-SPEC.md § 9);
 *   * **"Is this the person at the door?"** at check-in and certificate-retrieval time, where it is
 *     how a typed first name is matched against a registered one.
 *
 * **The database is the authority for both.** The unique index and the three lookup routines apply
 * the SQL implementation, and nothing in this module decides whether a guest is identified — the
 * Server Actions pass the typed values through and the RPC matches them. This exists so the browser
 * can refuse an empty field before a round trip, and so the transformations themselves can be
 * asserted against the accented, hyphenated and compound Brazilian names that break naive
 * implementations.
 *
 * **The two implementations must agree, and `identity.test.ts` is what enforces that.** If one ever
 * changes, the other is not optional: a database that thinks `José` and `Jose` are one person while
 * the browser thinks they are two produces a refusal nobody can reproduce.
 *
 * ## Deliberately not fuzzy
 *
 * No edit distance, no phonetics, no prefix match, no nickname table, no particle stripping. A
 * lookup that identifies the *wrong* participant would mark the wrong person present, or hand one
 * person another person's certificate; asking for one more field is a mild inconvenience and a human
 * at the door resolves whatever is left. Determinism is the feature.
 *
 * Pure, dependency-free, and imported by both server and client code.
 */

/**
 * The whitespace this module recognises: ASCII whitespace plus U+00A0.
 *
 * Written out rather than spelled `\s`, because `\s` in JavaScript matches the whole Unicode
 * `White_Space` property — U+2000…U+200A, U+3000 and more — while PostgreSQL's `\s` in a glibc UTF-8
 * locale matches the ASCII set only. Using `\s` here would make the browser normalize *more* than
 * the database does, and the one place that difference is not harmless is a unit test claiming the
 * two agree. U+00A0 is handled explicitly in both, because it is the one non-ASCII space that
 * actually arrives in text people paste.
 */
const WHITESPACE_RUN = /[ \t\n\r\f\v ]+/g;

/**
 * Combining marks — Unicode category `Mn`, which is what `NFD` decomposition produces.
 *
 * `\p{Mn}` rather than the broader `\p{Diacritic}`, and that is measured against the database rather
 * than chosen on taste. `\p{Diacritic}` also matches the *spacing* modifiers people type literally —
 * U+00B4 ACUTE ACCENT in `Maria d´Ávila`, U+00A8, U+02C6 — and PostgreSQL's `unaccent` dictionary
 * leaves those alone. Using the wider class here would fold `d´Ávila` to `davila` in the browser
 * while the database kept `d´avila`, and the two halves of one rule would disagree about a real
 * Brazilian surname.
 */
const COMBINING_MARKS = /\p{Mn}/gu;

/**
 * The single-character transliterations PostgreSQL's `unaccent` performs that decomposition does not.
 *
 * **Every entry here was read out of the database, not guessed.** `unaccent` is not only an accent
 * stripper: its rules file also maps typographic punctuation and a set of Latin letters that have no
 * decomposed form. `supabase/tests/node/check-in.test.mts` feeds all of these to
 * `registration_identity_key()` and asserts the two halves agree, which is how the list was found and
 * how it stays correct.
 *
 * **The one that actually matters in this product is the apostrophe.** iOS and Android both autocorrect
 * `'` to `’` (U+2019) as you type, so `D'Angelo` registered on a laptop and `D’Angelo` typed at the
 * door are routinely the same person. The database has always known that; without this map the browser
 * would not, and the half that mattered would be the half that disagreed.
 *
 * Applied AFTER lower-casing, which lets one lower-case entry cover both cases of a letter: `Ø` lowers
 * to `ø` and then maps to `o`, exactly as `unaccent` followed by `lower()` produces in SQL.
 */
const TRANSLITERATIONS: ReadonlyMap<string, string> = new Map([
  // Punctuation people's keyboards substitute for them.
  ['’', "'"], // ’ right single quotation mark — what autocorrect produces
  ['‘', "'"], // ‘ left single quotation mark
  ['ʼ', "'"], // ʼ modifier letter apostrophe
  ['“', '"'], // “
  ['”', '"'], // ”
  ['–', '-'], // – en dash
  ['—', '-'], // — em dash
  ['⁄', '/'], // ⁄ fraction slash
  // Latin letters with no decomposition. Rare in Brazilian names, common in the surnames of the
  // German, Polish and Scandinavian families who settled the south.
  ['ß', 'ss'], // ß
  ['æ', 'ae'], // æ
  ['œ', 'oe'], // œ
  ['ø', 'o'], // ø
  ['ł', 'l'], // ł
  ['ð', 'd'], // ð
  ['þ', 'th'], // þ
  ['ı', 'i'], // ı dotless i
]);

const TRANSLITERATED = new RegExp(`[${[...TRANSLITERATIONS.keys()].join('')}]`, 'gu');

/**
 * The canonical form of a full name: whitespace-collapsed, accent-folded, lower-cased.
 *
 * Mirrors, transformation for transformation and in the same order, the SQL of migration 16:
 *
 * ```sql
 * lower(immutable_unaccent(
 *   btrim(regexp_replace(replace(p_full_name, chr(160), ' '), '\s+', ' ', 'g'))))
 * ```
 *
 * Collapse-then-trim rather than trim-then-collapse, for the reason migration 16 states: PostgreSQL's
 * single-argument `btrim` removes spaces and not tabs, so the other order would leave a leading tab
 * as a leading space on the SQL side only.
 *
 * `NFD` plus a combining-mark strip is the decomposition half of `unaccent`, so `João` folds to `joao`
 * exactly as PostgreSQL's dictionary does. `TRANSLITERATIONS` is the other half — the mappings that
 * dictionary performs which decomposition cannot produce, read out of the database rather than
 * assumed. Neither needs a dependency, and the first is the same technique
 * `lib/data/admin/registrations.ts` already uses to compare a search term against `search_name`.
 *
 * `toLowerCase` rather than `toLocaleLowerCase('pt-BR')`: Portuguese has no special casing rule
 * (unlike Turkish dotless i), and a locale-sensitive fold would be a second behaviour for the
 * database's locale-insensitive `lower()` to disagree with.
 */
export function identityKey(fullName: string): string {
  return fullName
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(TRANSLITERATED, (character) => TRANSLITERATIONS.get(character) ?? character);
}

/**
 * The part of a name a guest is asked for at the door: its **first word**, canonicalised.
 *
 * `Maria da Silva` → `maria`. `'  JOÃO  PEDRO Souza '` → `joao`. An empty or whitespace-only input
 * yields `''`, which every caller reads as "not supplied yet" rather than as a match against
 * anything.
 *
 * **A hyphenated given name is one word and stays one word.** `Ana-Clara Souza` → `ana-clara`, so a
 * guest who types `Ana-Clara` is identified and a guest who types `Ana` is not. That is the correct
 * way round: the hyphen is part of how the name is written, and splitting on it would make
 * `Ana-Clara` collide with every other `Ana` on the same telephone number — which is the collision
 * the age step exists to break, not one this function should manufacture.
 *
 * **A compound given name is keyed on its first word only.** `João Pedro` and `João` both key to
 * `joao`, and so does the stored `João Pedro Souza`; the guest is asked for their first name and
 * either form of the answer works. Someone *called* by their second given name — `Pedro`, out of
 * `João Pedro Souza` — will not match, will be asked for their age, and will then be sent to the
 * team. That dead end is known, accepted and documented: the alternative is matching any word of the
 * name, which would identify the wrong sibling on a shared number.
 */
export function firstNameKey(name: string): string {
  const canonical = identityKey(name);
  const space = canonical.indexOf(' ');
  return space === -1 ? canonical : canonical.slice(0, space);
}

/**
 * Whether a typed first name identifies a registration whose canonical first word matches.
 *
 * A named function rather than `firstNameKey(a) === firstNameKey(b)` at four call sites, so that
 * "what counts as a match" has one answer — and so that an empty typed value can never match an
 * empty registered one.
 */
export function firstNameMatches(typed: string, registeredFullName: string): boolean {
  const key = firstNameKey(typed);
  return key.length > 0 && key === firstNameKey(registeredFullName);
}
