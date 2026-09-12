import { describe, expect, it } from 'vitest';

import {
  AGE_BELOW_MINIMUM_MESSAGE,
  ORGANIZATION_EMAIL,
  PUBLIC_AGE_MIN,
  adminAgeSchema,
  ageSchema,
  fieldErrors,
  inviteInputSchema,
  nameSchema,
  normalizeName,
  phoneSchema,
  registrationInputSchema,
  settingsInputSchema,
} from './schemas';

function messageFor(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) {
  const result = schema.safeParse(value) as
    | { success: true }
    | { success: false; error: { issues: { message: string }[] } };
  if (result.success) throw new Error('expected the parse to fail');
  return result.error.issues[0].message;
}

describe('normalizeName', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeName('  João   da   Silva  ')).toBe('João da Silva');
  });

  it('never changes the letter case', () => {
    expect(normalizeName('de Souza')).toBe('de Souza');
    expect(normalizeName("d'Ávila")).toBe("d'Ávila");
    expect(normalizeName('McCarthy')).toBe('McCarthy');
  });
});

describe('nameSchema', () => {
  it.each([
    ['João Gonçalves', 'João Gonçalves'],
    ['Maria', 'Maria'],
    ['Ana Beatriz d’Ávila', 'Ana Beatriz d’Ávila'],
    ['José Antônio de Souza Júnior', 'José Antônio de Souza Júnior'],
    ['  Luís   Inácio  ', 'Luís Inácio'],
    ['O’Brien', 'O’Brien'],
    ['Ana', 'Ana'],
  ])('accepts %s', (input, expected) => {
    expect(nameSchema.parse(input)).toBe(expected);
  });

  it('accepts a single-word name, because many people have one', () => {
    expect(nameSchema.parse('Madonna')).toBe('Madonna');
  });

  it('accepts exactly 120 characters and rejects 121', () => {
    expect(nameSchema.parse('a'.repeat(120))).toHaveLength(120);
    expect(messageFor(nameSchema, 'a'.repeat(121))).toBe('Informe seu nome completo.');
  });

  it('rejects an empty name', () => {
    expect(messageFor(nameSchema, '')).toBe('Informe seu nome.');
  });

  it('rejects a whitespace-only name as empty, not as too short', () => {
    expect(messageFor(nameSchema, '     ')).toBe('Informe seu nome.');
    expect(messageFor(nameSchema, '\t\n ')).toBe('Informe seu nome.');
  });

  it('rejects a one-character name with the "nome completo" message', () => {
    expect(messageFor(nameSchema, 'A')).toBe('Informe seu nome completo.');
  });

  it('rejects a missing value', () => {
    expect(messageFor(nameSchema, undefined)).toBe('Informe seu nome.');
  });
});

describe('ageSchema', () => {
  it.each([
    ['12', 12],
    ['18', 18],
    ['120', 120],
    [' 25 ', 25],
    [17, 17],
  ])('accepts %s', (input, expected) => {
    expect(ageSchema.parse(input)).toBe(expected);
  });

  it('rejects 0 and 121, the boundaries just outside the technical range', () => {
    expect(messageFor(ageSchema, '0')).toBe('Informe uma idade válida.');
    expect(messageFor(ageSchema, '121')).toBe('Informe uma idade válida.');
  });

  /*
   * The online eligibility policy. A typo and an ineligible age are deliberately different
   * messages: one is a correction, the other is a redirection to a human channel.
   */
  it('accepts exactly the minimum: the floor is inclusive', () => {
    expect(ageSchema.parse(String(PUBLIC_AGE_MIN))).toBe(PUBLIC_AGE_MIN);
  });

  it.each(['11', '9', '1'])('sends %s to the organization rather than calling it invalid', (input) => {
    expect(messageFor(ageSchema, input)).toBe(AGE_BELOW_MINIMUM_MESSAGE);
  });

  it('names the contact address in the under-age message, so there is somewhere to go', () => {
    expect(AGE_BELOW_MINIMUM_MESSAGE).toContain(ORGANIZATION_EMAIL);
    expect(AGE_BELOW_MINIMUM_MESSAGE).toContain(String(PUBLIC_AGE_MIN));
  });

  it('applies the floor inside the whole-form parse, not only field by field', () => {
    const result = registrationInputSchema.safeParse({
      name: 'Ana Souza',
      age: '11',
      phone: '(19) 99123-4567',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).age).toBe(AGE_BELOW_MINIMUM_MESSAGE);
    }
  });

  it('rejects an empty value with the "informe" message', () => {
    expect(messageFor(ageSchema, '')).toBe('Informe sua idade.');
    expect(messageFor(ageSchema, '   ')).toBe('Informe sua idade.');
    expect(messageFor(ageSchema, undefined)).toBe('Informe sua idade.');
  });

  it.each(['18a', 'dezoito', '1.5', '1e2', '-5', '+18'])(
    'rejects the malformed value %s',
    (input) => {
      expect(messageFor(ageSchema, input)).toBe('Informe uma idade válida.');
    },
  );

  it('rejects digits that are not ASCII digits', () => {
    // Arabic-Indic digits pass Number() but are not what the numeric keypad produces.
    expect(messageFor(ageSchema, '١٨')).toBe('Informe uma idade válida.');
  });
});

/*
 * An administrator's correction is held to the technical bounds, not the online floor: fixing `81`
 * typed as `18` is recording what is true, and an existing record is not a new online registration.
 * `edit_registration()` applies the identical 1-120 range server-side.
 */
describe('adminAgeSchema', () => {
  it.each([
    ['1', 1],
    ['11', 11],
    ['120', 120],
  ])('accepts %s, below the public floor', (input, expected) => {
    expect(adminAgeSchema.parse(input)).toBe(expected);
  });

  it('still refuses values outside the technical bounds', () => {
    expect(messageFor(adminAgeSchema, '0')).toBe('Informe uma idade válida.');
    expect(messageFor(adminAgeSchema, '121')).toBe('Informe uma idade válida.');
  });

  it('asks for the value when it is missing', () => {
    expect(messageFor(adminAgeSchema, '')).toBe('Informe a idade.');
  });
});

describe('phoneSchema', () => {
  it('produces the canonical value, never the masked one', () => {
    expect(phoneSchema.parse('(19) 99123-4567')).toBe('+5519991234567');
    expect(phoneSchema.parse('5519991234567')).toBe('+5519991234567');
  });

  it('gives a landline its own message', () => {
    expect(messageFor(phoneSchema, '(19) 3199-1234')).toBe(
      'Esse número parece ser um telefone fixo. Informe um celular com 9 dígitos.',
    );
  });

  it('gives an empty value the "informe" message', () => {
    expect(messageFor(phoneSchema, '')).toBe('Informe seu celular.');
    expect(messageFor(phoneSchema, undefined)).toBe('Informe seu celular.');
  });

  it('gives everything else the generic message with an example', () => {
    expect(messageFor(phoneSchema, '(10) 99123-4567')).toBe(
      'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    );
    expect(messageFor(phoneSchema, '11111111111')).toBe(
      'Informe um celular válido com DDD. Ex.: (19) 99999-9999.',
    );
  });
});

describe('registrationInputSchema', () => {
  it('returns the values that will be stored', () => {
    expect(
      registrationInputSchema.parse({
        name: '  João   Gonçalves ',
        age: '19',
        phone: '+55 (19) 99123-4567',
      }),
    ).toEqual({ name: 'João Gonçalves', age: 19, phone: '+5519991234567' });
  });

  it('reports every bad field at once, one message each', () => {
    const result = registrationInputSchema.safeParse({ name: '', age: '0', phone: '' });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(fieldErrors(result.error)).toEqual({
      name: 'Informe seu nome.',
      age: 'Informe uma idade válida.',
      phone: 'Informe seu celular.',
    });
  });
});

describe('settingsInputSchema', () => {
  const base = {
    capacity: '80',
    waitlistEnabled: true,
    registrationState: 'open' as const,
    settingsVersion: 3,
  };

  it('accepts a well-formed change', () => {
    expect(settingsInputSchema.parse(base)).toEqual({
      capacity: 80,
      waitlistEnabled: true,
      registrationState: 'open',
      settingsVersion: 3,
    });
  });

  it('refuses to open registrations with capacity 0', () => {
    const result = settingsInputSchema.safeParse({ ...base, capacity: '0' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      capacity: 'Defina a capacidade antes de abrir as inscrições.',
    });
  });

  it('allows capacity 0 while registrations are closed', () => {
    expect(
      settingsInputSchema.parse({ ...base, capacity: '0', registrationState: 'closed' }).capacity,
    ).toBe(0);
  });

  it('rejects a malformed capacity', () => {
    expect(messageFor(settingsInputSchema, { ...base, capacity: '-1' })).toBe(
      'Informe uma capacidade válida.',
    );
    expect(messageFor(settingsInputSchema, { ...base, capacity: 'muitas' })).toBe(
      'Informe uma capacidade válida.',
    );
  });

  it('requires the settings version, the conflict token', () => {
    const result = settingsInputSchema.safeParse({ ...base, settingsVersion: undefined });
    expect(result.success).toBe(false);
  });
});

describe('inviteInputSchema', () => {
  it('normalizes the address', () => {
    expect(inviteInputSchema.parse({ email: '  Marina@Exemplo.COM ' })).toEqual({
      email: 'marina@exemplo.com',
    });
  });

  it.each(['marina', 'marina@', '@exemplo.com', 'marina exemplo.com'])('rejects %s', (email) => {
    expect(messageFor(inviteInputSchema, { email })).toBe('Informe um e-mail válido.');
  });

  it('rejects an empty address', () => {
    expect(messageFor(inviteInputSchema, { email: '' })).toBe('Informe um e-mail válido.');
  });

  it('rejects a missing address', () => {
    expect(messageFor(inviteInputSchema, {})).toBe('Informe o e-mail.');
  });
});
