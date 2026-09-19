import { describe, expect, it } from 'vitest';

import { firstName, maskedName } from './display-name';

/**
 * RAFFLE-AND-CERTIFICATE-SPEC.md § 3.6. This function decides what a room of people sees on a
 * four-metre screen, so its failure modes are visible to everyone at once: a name cut in half, a
 * stray full stop, or — the one that matters — a full surname that was supposed to be abbreviated.
 */
describe('maskedName', () => {
  it('abbreviates the surname', () => {
    expect(maskedName('Ana Beatriz Souza')).toBe('Ana B.');
    expect(maskedName('Lucas Martins')).toBe('Lucas M.');
  });

  it('skips Portuguese particles, which are never a surname on their own', () => {
    expect(maskedName('Maria da Silva')).toBe('Maria S.');
    expect(maskedName('Pedro dos Santos')).toBe('Pedro S.');
    expect(maskedName('Ana de Oliveira')).toBe('Ana O.');
    expect(maskedName('Rafael e Costa')).toBe('Rafael C.');
  });

  it('keeps the accent on an abbreviated surname', () => {
    expect(maskedName("João D'Ávila")).toBe('João D.');
    expect(maskedName('Bruna Ávila')).toBe('Bruna Á.');
  });

  it('returns a single-word name unchanged, with no dangling full stop', () => {
    expect(maskedName('Carla')).toBe('Carla');
    expect(maskedName('  Carla  ')).toBe('Carla');
  });

  it('returns the given name when every later word is a particle', () => {
    expect(maskedName('Ana de')).toBe('Ana');
  });

  it('survives repeated whitespace and the empty string', () => {
    expect(maskedName('Ana    Beatriz   Souza')).toBe('Ana B.');
    expect(maskedName('')).toBe('');
    expect(maskedName('   ')).toBe('');
  });

  it('upper-cases a lower-cased surname', () => {
    expect(maskedName('ana souza')).toBe('ana S.');
  });
});

describe('firstName', () => {
  it('takes the given name alone', () => {
    expect(firstName('Ana Beatriz Souza')).toBe('Ana');
    expect(firstName('Carla')).toBe('Carla');
    expect(firstName('')).toBe('');
  });
});
