import { describe, expect, it } from 'vitest';

import { firstNameKey, firstNameMatches, identityKey } from './identity';

/**
 * The identity normalization, held to the cases that actually occur in Brazilian names.
 *
 * The table below doubles as the specification of the rule, and `supabase/tests/node/identity.test.mts`
 * feeds the same inputs to `public.registration_identity_key()` and asserts the two agree — which is
 * the assertion that matters, since the database is the authority.
 */

describe('identityKey', () => {
  it.each([
    ['Ana Souza', 'ana souza'],
    ['ana souza', 'ana souza'],
    ['ANA SOUZA', 'ana souza'],
    ['AnA sOuZa', 'ana souza'],
  ])('folds case: %s', (input, expected) => {
    expect(identityKey(input)).toBe(expected);
  });

  it.each([
    ['João', 'joao'],
    ['JOÃO', 'joao'],
    ['joão', 'joao'],
    ['José Ávila', 'jose avila'],
    ['Conceição', 'conceicao'],
    ['Müller', 'muller'],
    ['Antônio Nuñez', 'antonio nunez'],
    ['Thaís Sá', 'thais sa'],
  ])('folds accents: %s', (input, expected) => {
    expect(identityKey(input)).toBe(expected);
  });

  it.each([
    ['  Ana Souza  ', 'ana souza'],
    ['Ana   Souza', 'ana souza'],
    ['\tAna\tSouza\t', 'ana souza'],
    ['\n Ana \n Souza \n', 'ana souza'],
    ['Ana Souza', 'ana souza'],
    [' Ana Souza ', 'ana souza'],
  ])('collapses and trims whitespace: %j', (input, expected) => {
    expect(identityKey(input)).toBe(expected);
  });

  it('preserves the characters that are part of how a name is written', () => {
    // An apostrophe and a hyphen are not noise and are never stripped: `d'Ávila` is not `davila`,
    // and treating them as separators would merge distinct people.
    expect(identityKey("Maria d'Ávila")).toBe("maria d'avila");
    expect(identityKey('Ana-Clara Souza')).toBe('ana-clara souza');

    // A STANDALONE acute accent — the one people type instead of an apostrophe — survives, because
    // PostgreSQL's `unaccent` leaves it alone and the two implementations must agree. Only combining
    // marks are folded.
    expect(identityKey('Maria d´Ávila')).toBe('maria d´avila');
  });

  it('folds the apostrophe both mobile keyboards autocorrect to', () => {
    // The single most load-bearing entry in the transliteration table. iOS and Android both replace
    // `'` with `’` as you type, so `D'Angelo` registered on a laptop and `D’Angelo` typed at the door
    // are routinely the same person — and PostgreSQL's `unaccent` has always known that.
    expect(identityKey("D'Angelo")).toBe("d'angelo");
    expect(identityKey('D’Angelo')).toBe("d'angelo");
    expect(identityKey('D‘Angelo')).toBe("d'angelo");
    expect(identityKey('DʼAngelo')).toBe("d'angelo");
  });

  it.each([
    ['Straßer', 'strasser'],
    ['Ægir Sousa', 'aegir sousa'],
    ['Sørensen', 'sorensen'],
    ['Kowalłczyk', 'kowallczyk'],
    ['Œuvres', 'oeuvres'],
    ['Anne-Marie – Souza', 'anne-marie - souza'],
    ['Ana “Nina” Souza', 'ana "nina" souza'],
  ])('performs the transliterations unaccent does: %j', (input, expected) => {
    // Read out of the database rather than assumed — `supabase/tests/node/check-in.test.mts` feeds
    // every one of these to `registration_identity_key()` and asserts the two halves agree.
    expect(identityKey(input)).toBe(expected);
  });

  it('folds a decomposed accent identically to a precomposed one', () => {
    // `Á` may arrive as U+00C1 or as `A` + U+0301 depending on the keyboard, the phone and the
    // clipboard. Both are the same person.
    expect(identityKey('Mária')).toBe('maria');
    expect(identityKey('Mária')).toBe('maria');
    expect(identityKey('Thaís Sá')).toBe('thais sa');
  });

  it('does not title-case, abbreviate or reorder', () => {
    expect(identityKey('de Souza e Silva')).toBe('de souza e silva');
    expect(identityKey('Souza, Ana')).toBe('souza, ana');
  });

  it('is idempotent', () => {
    for (const name of ['João Pedro Souza', '  ANA-CLARA  d´Ávila ', 'x']) {
      expect(identityKey(identityKey(name))).toBe(identityKey(name));
    }
  });

  it('is empty only for an empty or whitespace-only name', () => {
    expect(identityKey('')).toBe('');
    expect(identityKey('   ')).toBe('');
    expect(identityKey('\t\n ')).toBe('');
    expect(identityKey('a')).toBe('a');
  });
});

describe('firstNameKey', () => {
  it.each([
    ['Ana Souza', 'ana'],
    ['Maria da Silva', 'maria'],
    ['João Pedro Souza', 'joao'],
    ['  JOÃO  PEDRO  Souza ', 'joao'],
    ['Carla', 'carla'],
  ])('takes the first word of %j', (input, expected) => {
    expect(firstNameKey(input)).toBe(expected);
  });

  it('keeps a hyphenated given name whole', () => {
    // The age step exists to break a collision between two people; splitting on the hyphen would
    // manufacture one, by making `Ana-Clara` indistinguishable from every other `Ana`.
    expect(firstNameKey('Ana-Clara Souza')).toBe('ana-clara');
    expect(firstNameKey('Ana-Clara')).toBe('ana-clara');
    expect(firstNameKey('Ana Clara Souza')).toBe('ana');
  });

  it('accepts either form of a compound given name', () => {
    // A guest who types their full given name and one who types only its first word are both
    // identified, because the stored name reduces to the same key.
    expect(firstNameKey('João Pedro')).toBe(firstNameKey('João'));
    expect(firstNameKey('João Pedro')).toBe(firstNameKey('João Pedro Souza'));
  });

  it('is empty for an empty or whitespace-only input', () => {
    expect(firstNameKey('')).toBe('');
    expect(firstNameKey('   \t')).toBe('');
    expect(firstNameKey(' ')).toBe('');
  });
});

describe('firstNameMatches', () => {
  it.each([
    ['Ana', 'Ana Souza'],
    ['ana', 'Ana Souza'],
    ['ANA', 'ANA SOUZA'],
    ['  ana  ', 'Ana Souza'],
    ['joao', 'João Pedro Souza'],
    ['JOÃO', 'joao pedro souza'],
    ['João Pedro', 'João Pedro Souza'],
    ['Maria', 'Maria da Silva'],
  ])('matches %j against %j', (typed, registered) => {
    expect(firstNameMatches(typed, registered)).toBe(true);
  });

  it.each([
    ['Bruno', 'Ana Souza'],
    ['Souza', 'Ana Souza'],
    ['Ana', 'Ana-Clara Souza'],
    ['An', 'Ana Souza'],
    ['Anaa', 'Ana Souza'],
    // The documented dead end: a person called by their SECOND given name is not identified by it,
    // and is sent to the team rather than being confused with a sibling.
    ['Pedro', 'João Pedro Souza'],
  ])('refuses %j against %j', (typed, registered) => {
    expect(firstNameMatches(typed, registered)).toBe(false);
  });

  it('never matches on an empty typed value, whatever is registered', () => {
    expect(firstNameMatches('', 'Ana Souza')).toBe(false);
    expect(firstNameMatches('   ', 'Ana Souza')).toBe(false);
    // Including against a registration whose name is itself unusable — the guard is on the typed
    // side, so no amount of bad stored data turns an empty field into an identification.
    expect(firstNameMatches('', '')).toBe(false);
    expect(firstNameMatches('  ', '   ')).toBe(false);
  });
});
