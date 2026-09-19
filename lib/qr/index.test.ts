import { describe, expect, it } from 'vitest';

import {
  EC_LEVELS,
  QrCapacityError,
  TOTAL_CODEWORDS,
  blocksFor,
  characterCountBits,
  encodeQr,
  type EcLevel,
} from './index';

/**
 * The QR encoder, held to the only standard that matters: a scanner can read it.
 *
 * Since a scanner cannot be imported, this file contains a **decoder** — an independent
 * re-derivation of the placement rules, the mask geometry, the block interleaving and the field
 * arithmetic, written to read a symbol rather than to write one. A bug that exists in only one of
 * the two implementations fails here; a bug shared by both would have to be the same mistake made
 * twice, in opposite directions, which is what the golden fingerprints below cover.
 *
 * The three independent checks, in ascending strength:
 *
 *   1. **Structure** — the size, the finder patterns, the timing patterns, the dark module. Cheap,
 *      and it localises a fault to a few lines when one appears.
 *   2. **Reed–Solomon syndromes are zero.** Evaluating each block's codeword polynomial at α⁰…α^(n−1)
 *      must give zero at every point; that is literally the test a decoder applies before it trusts a
 *      block, and it cannot pass by accident. The field arithmetic here is written out again rather
 *      than imported from `galois.ts`, so the tables are checked too.
 *   3. **Round trip** — the format information is read back out of the symbol and used to undo the
 *      mask, exactly as a scanner does, and the payload is recovered byte for byte.
 *
 * The fingerprints in `GOLDEN` were produced by this implementation **after** its output was verified
 * module-for-module against two unrelated encoders and decoded by an unrelated decoder. They are the
 * anchor that stops a future change from moving both the encoder and this decoder together.
 */

/* ------------------------------------------------------------------------------------------------
 * An independent decoder
 * ---------------------------------------------------------------------------------------------- */

/** GF(2⁸) exponentials, rebuilt here so `galois.ts` is verified rather than trusted. */
const GF_EXP: number[] = [];
{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP.push(value);
    value = value << 1;
    if (value > 255) value ^= 0x11d;
  }
}

/** Multiplication by repeated shift-and-reduce — the definition, not the log-table shortcut. */
function gfMultiply(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) result ^= x;
    y >>= 1;
    x <<= 1;
    if (x > 255) x ^= 0x11d;
  }
  return result;
}

const ALIGNMENT_CENTRES: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/**
 * Which modules are function modules, derived from the version alone.
 *
 * Deliberately built from the geometry rather than from the encoder's own `reserved` plane, which is
 * not exported: if the encoder reserved the wrong area, the codewords it laid down would not be where
 * this map expects them and the round trip would fail.
 */
function functionMap(version: number): boolean[][] {
  const size = 17 + 4 * version;
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (row: number, col: number) => {
    if (row >= 0 && col >= 0 && row < size && col < size) map[row][col] = true;
  };

  // Finders plus separators: an 8×8 corner each.
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      mark(i, j);
      mark(i, size - 1 - j);
      mark(size - 1 - i, j);
    }
  }

  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    mark(6, i);
    mark(i, 6);
  }

  // Alignment patterns.
  const centres = ALIGNMENT_CENTRES[version - 1];
  for (const row of centres) {
    for (const col of centres) {
      const onFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === size - 7) ||
        (row === size - 7 && col === 6);
      if (onFinder) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) mark(row + dy, col + dx);
      }
    }
  }

  // Format information, both copies, and the dark module.
  for (let i = 0; i <= 8; i += 1) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i += 1) mark(8, size - 1 - i);
  for (let i = 0; i < 8; i += 1) mark(size - 1 - i, 8);

  // Version information.
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      mark(Math.floor(i / 3), size - 11 + (i % 3));
      mark(size - 11 + (i % 3), Math.floor(i / 3));
    }
  }

  return map;
}

function maskAt(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/**
 * Reads the fifteen format bits out of the symbol's first copy and recovers the EC level and mask.
 *
 * This is the step that makes the round trip a genuine decode rather than a replay: the mask is taken
 * from the symbol, never from `QrSymbol.mask`, so a symbol whose format information disagrees with
 * the mask that was actually applied fails to decode here — which is exactly how it would fail in a
 * camera.
 */
function readFormat(symbol: { size: number; modules: Uint8Array }): {
  level: EcLevel;
  mask: number;
} {
  const at = (row: number, col: number) => symbol.modules[row * symbol.size + col];

  const positions: [number, number][] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [7, 8], [8, 8], [8, 7],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];

  let bits = 0;
  positions.forEach(([row, col], index) => {
    if (at(row, col)) bits |= 1 << index;
  });

  const unmasked = bits ^ 0x5412;
  const data = unmasked >>> 10;

  const level = (Object.keys(EC_LEVELS) as EcLevel[]).find(
    (candidate) => EC_LEVELS[candidate] === (data >>> 3),
  );
  if (!level) throw new Error(`format information names no EC level: ${data.toString(2)}`);

  return { level, mask: data & 0b111 };
}

/** The interleaved codeword stream, read out of the symbol with the mask undone. */
function readCodewords(symbol: { size: number; modules: Uint8Array }, version: number, mask: number) {
  const map = functionMap(version);
  const { size } = symbol;
  const bits: number[] = [];

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (map[row][col]) continue;
        const value = symbol.modules[row * size + col];
        bits.push(maskAt(mask, row, col) ? value ^ 1 : value);
      }
    }
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length * 8; i += 1) {
    if (bits[i]) bytes[i >>> 3] |= 0x80 >>> (i & 7);
  }
  return bytes;
}

interface DecodedBlock {
  readonly data: Uint8Array;
  /** Data followed by EC — the full received polynomial, which is what a syndrome is taken over. */
  readonly received: Uint8Array;
}

/** Undoes the interleaving, returning the blocks in order. */
function deinterleave(stream: Uint8Array, version: number, level: EcLevel): DecodedBlock[] {
  const blocks = blocksFor(version, level);
  const lengths: number[] = [];
  for (let i = 0; i < blocks.group1.blocks; i += 1) lengths.push(blocks.group1.dataCodewords);
  for (let i = 0; i < blocks.group2.blocks; i += 1) lengths.push(blocks.group2.dataCodewords);

  const data = lengths.map((length) => new Uint8Array(length));
  let cursor = 0;

  for (let i = 0; i < blocks.group2.dataCodewords; i += 1) {
    for (let b = 0; b < data.length; b += 1) {
      if (i < data[b].length) data[b][i] = stream[cursor++];
    }
  }

  const ec = lengths.map(() => new Uint8Array(blocks.ecPerBlock));
  for (let i = 0; i < blocks.ecPerBlock; i += 1) {
    for (let b = 0; b < ec.length; b += 1) ec[b][i] = stream[cursor++];
  }

  return data.map((block, index) => {
    const received = new Uint8Array(block.length + blocks.ecPerBlock);
    received.set(block);
    received.set(ec[index], block.length);
    return { data: block, received };
  });
}

/**
 * Every Reed–Solomon syndrome of one block, which must all be zero for an undamaged codeword.
 *
 * S_j = Σ received[i] · (α^j)^(n−1−i), for j in 0…ecCount−1. A non-zero syndrome means the block's
 * parity does not check out: a scanner would attempt a correction, and any encoder bug — a wrong
 * generator, a misordered interleave, a truncated pad — surfaces here.
 */
function syndromes(received: Uint8Array, ecCount: number): number[] {
  const result: number[] = [];

  for (let j = 0; j < ecCount; j += 1) {
    let sum = 0;
    let power = 1;
    // Horner from the lowest-order coefficient: received is highest-order first, so walk it backwards.
    for (let i = received.length - 1; i >= 0; i -= 1) {
      sum ^= gfMultiply(received[i], power);
      power = gfMultiply(power, GF_EXP[j]);
    }
    result.push(sum);
  }

  return result;
}

/** The payload, parsed out of the concatenated data codewords. */
function readPayload(blocks: DecodedBlock[], version: number): string {
  const data = new Uint8Array(blocks.reduce((total, block) => total + block.data.length, 0));
  let offset = 0;
  for (const block of blocks) {
    data.set(block.data, offset);
    offset += block.data.length;
  }

  let bit = 0;
  const take = (count: number) => {
    let value = 0;
    for (let i = 0; i < count; i += 1, bit += 1) {
      value = (value << 1) | ((data[bit >>> 3] >>> (7 - (bit & 7))) & 1);
    }
    return value;
  };

  const mode = take(4);
  expect(mode, 'the mode indicator must be byte mode').toBe(0b0100);

  const length = take(characterCountBits(version));
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = take(8);

  return new TextDecoder().decode(bytes);
}

/** The whole decode, as a scanner would perform it. */
function decode(symbol: ReturnType<typeof encodeQr>): string {
  const format = readFormat(symbol);
  expect(format.level, 'the symbol must declare the level it was encoded at').toBe(symbol.level);
  expect(format.mask, 'the symbol must declare the mask that was applied').toBe(symbol.mask);

  const stream = readCodewords(symbol, symbol.version, format.mask);
  const blocks = deinterleave(stream, symbol.version, format.level);

  for (const [index, block] of blocks.entries()) {
    const failing = syndromes(block.received, blocksFor(symbol.version, format.level).ecPerBlock);
    expect(failing, `block ${index} must have no non-zero Reed-Solomon syndrome`).toEqual(
      failing.map(() => 0),
    );
  }

  return readPayload(blocks, symbol.version);
}

/* ------------------------------------------------------------------------------------------------
 * The tests
 * ---------------------------------------------------------------------------------------------- */

const LEVELS: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];

const CHECK_IN_URL = 'https://euqueroadh.com/presenca/AbCdEfGhIjKlMnOpQrStUvWxY-_';

describe('block tables', () => {
  it('closes arithmetically for all forty version and level combinations', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= 10; version += 1) {
        const blocks = blocksFor(version, level);
        const count = blocks.group1.blocks + blocks.group2.blocks;

        const data =
          blocks.group1.blocks * blocks.group1.dataCodewords +
          blocks.group2.blocks * blocks.group2.dataCodewords;

        expect(data, `v${version}${level} data codewords`).toBe(blocks.dataCodewords);
        expect(
          data + blocks.ecPerBlock * count,
          `v${version}${level} must fill the version exactly`,
        ).toBe(TOTAL_CODEWORDS[version - 1]);
      }
    }
  });

  it('gives group two exactly one codeword more than group one', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= 10; version += 1) {
        const blocks = blocksFor(version, level);
        expect(blocks.group2.dataCodewords - blocks.group1.dataCodewords).toBe(1);
      }
    }
  });
});

describe('structure', () => {
  it('sizes the symbol at 17 + 4 x version', () => {
    for (let version = 1; version <= 10; version += 1) {
      const symbol = encodeQr('x', { version, level: 'M' });
      expect(symbol.size).toBe(17 + 4 * version);
      expect(symbol.modules).toHaveLength(symbol.size ** 2);
    }
  });

  it('draws three finder patterns, and leaves the fourth corner to data', () => {
    const symbol = encodeQr(CHECK_IN_URL);
    const at = (row: number, col: number) => symbol.modules[row * symbol.size + col];
    const last = symbol.size - 1;

    for (const [top, left] of [
      [0, 0],
      [0, last - 6],
      [last - 6, 0],
    ]) {
      for (let dy = 0; dy < 7; dy += 1) {
        for (let dx = 0; dx < 7; dx += 1) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          expect(at(top + dy, left + dx), `finder at ${top},${left} module ${dy},${dx}`).toBe(
            ring !== 2 && ring <= 3 ? 1 : 0,
          );
        }
      }
    }
  });

  it('separates each finder from the data with a light border', () => {
    const symbol = encodeQr(CHECK_IN_URL);
    const at = (row: number, col: number) => symbol.modules[row * symbol.size + col];
    const last = symbol.size - 1;

    for (let i = 0; i < 8; i += 1) {
      expect(at(7, i), `top-left separator row, column ${i}`).toBe(0);
      expect(at(i, 7), `top-left separator column, row ${i}`).toBe(0);
      expect(at(7, last - i), 'top-right separator row').toBe(0);
      expect(at(last - i, 7), 'bottom-left separator column').toBe(0);
    }
  });

  it('runs the timing patterns between the separators without cutting the finders', () => {
    const symbol = encodeQr(CHECK_IN_URL);
    const at = (row: number, col: number) => symbol.modules[row * symbol.size + col];

    for (let i = 8; i <= symbol.size - 9; i += 1) {
      expect(at(6, i), `horizontal timing module ${i}`).toBe(i % 2 === 0 ? 1 : 0);
      expect(at(i, 6), `vertical timing module ${i}`).toBe(i % 2 === 0 ? 1 : 0);
    }

    // The regression this guards: an unbounded timing loop punches light modules through row 6 and
    // column 6 of the finders, and the symbol stops being locatable.
    for (let i = 0; i <= 6; i += 1) {
      expect(at(6, i), `finder row 6, column ${i} must stay dark`).toBe(1);
      expect(at(i, 6), `finder column 6, row ${i} must stay dark`).toBe(1);
    }
  });

  it('sets the module that is always dark', () => {
    for (let version = 1; version <= 10; version += 1) {
      const symbol = encodeQr('x', { version, level: 'M' });
      expect(symbol.modules[(symbol.size - 8) * symbol.size + 8]).toBe(1);
    }
  });
});

describe('round trip', () => {
  const payloads = [
    'A',
    'ab',
    '0123456789',
    CHECK_IN_URL,
    'https://euqueroadh.com/certificado',
    'http://127.0.0.1:3000/presenca/0123456789abcdefghijklmnopq',
    // Multi-byte UTF-8: the character count is a BYTE count, and a code point counted as one
    // character would truncate the payload.
    'Educação Financeira para Jovens — 19 SET',
    'W'.repeat(120),
  ];

  for (const level of LEVELS) {
    for (const payload of payloads) {
      it(`recovers ${JSON.stringify(payload.slice(0, 28))} at level ${level}`, () => {
        let symbol: ReturnType<typeof encodeQr>;
        try {
          symbol = encodeQr(payload, { level });
        } catch (error) {
          expect(error, 'only a capacity refusal is acceptable').toBeInstanceOf(QrCapacityError);
          return;
        }
        expect(decode(symbol)).toBe(payload);
      });
    }
  }

  it('recovers a payload at every version, including the version-information range', () => {
    for (const level of LEVELS) {
      for (let version = 1; version <= 10; version += 1) {
        const symbol = encodeQr('ok', { version, level });
        expect(symbol.version, `forced version ${version} at ${level}`).toBe(version);
        expect(decode(symbol), `forced version ${version} at ${level}`).toBe('ok');
      }
    }
  });

  it('recovers a payload that fills its version exactly', () => {
    // The boundary where a mis-sized terminator, a wrong pad count or an off-by-one in the block
    // split would show and a short payload would not.
    for (const level of LEVELS) {
      for (let version = 1; version <= 10; version += 1) {
        const capacity = blocksFor(version, level).dataCodewords;
        const bytes = capacity - (4 + characterCountBits(version)) / 8;
        const payload = 'W'.repeat(bytes);

        const symbol = encodeQr(payload, { level });
        expect(symbol.version, `${bytes} bytes at ${level} must be version ${version}`).toBe(version);
        expect(decode(symbol)).toBe(payload);
      }
    }
  });
});

describe('version selection', () => {
  it('chooses the smallest version that fits, and grows with the payload', () => {
    const short = encodeQr('x', { level: 'Q' });
    const long = encodeQr('x'.repeat(100), { level: 'Q' });

    expect(short.version).toBe(1);
    expect(long.version).toBeGreaterThan(short.version);
  });

  it('honours a version floor, so a projected symbol does not re-grid when a token changes length', () => {
    const symbol = encodeQr('x', { level: 'Q', version: 6 });
    expect(symbol.version).toBe(6);
    expect(symbol.size).toBe(41);
  });

  it('never silently truncates: an oversized payload raises', () => {
    expect(() => encodeQr('x'.repeat(400), { level: 'H' })).toThrow(QrCapacityError);
    expect(() => encodeQr('x'.repeat(4000))).toThrow(QrCapacityError);
  });

  it('encodes the real check-in URL into a symbol coarse enough to project', () => {
    const symbol = encodeQr(CHECK_IN_URL, { level: 'Q' });

    // 37 modules across a 600px projected QR is 16px per module, which is what a phone camera two
    // metres from a screen resolves. A regression that pushed this to version 9 or 10 would still
    // decode on the bench and fail in the room.
    expect(symbol.size).toBeLessThanOrEqual(41);
    expect(decode(symbol)).toBe(CHECK_IN_URL);
  });
});

describe('golden fingerprints', () => {
  /**
   * Produced by this encoder after its output was compared module-for-module against two unrelated
   * implementations and decoded by an unrelated decoder. Their only job is to fail when the encoder
   * and the decoder in this file are changed together.
   */
  const GOLDEN = [
    { text: CHECK_IN_URL, level: 'Q' as EcLevel, version: 5, size: 37, mask: 2,
      fingerprint: '991f607cfba6cc7209036d6fca1b9308' },
    { text: 'https://euqueroadh.com/certificado', level: 'M' as EcLevel, version: 3, size: 29, mask: 2,
      fingerprint: '46753366ca6544a118798717c0d8f1da' },
    { text: 'HELLO WORLD', level: 'L' as EcLevel, version: 1, size: 21, mask: 3,
      fingerprint: '59047e77ff643f4c941969a88e3ad399' },
    { text: 'Educação Financeira', level: 'H' as EcLevel, version: 3, size: 29, mask: 5,
      fingerprint: '2bd389e34dd3fed45922b1c88bbea505' },
  ];

  it.each(GOLDEN)('matches the recorded symbol for $text at level $level', async (expected) => {
    const symbol = encodeQr(expected.text, { level: expected.level });

    expect(symbol.version).toBe(expected.version);
    expect(symbol.size).toBe(expected.size);
    expect(symbol.mask).toBe(expected.mask);

    // Copied into a plain `ArrayBuffer` rather than handed straight to WebCrypto: a `Uint8Array` may
    // be backed by a `SharedArrayBuffer`, which `BufferSource` does not accept.
    const buffer = new ArrayBuffer(symbol.modules.length);
    new Uint8Array(buffer).set(symbol.modules);

    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    expect(hex).toBe(expected.fingerprint);
  });
});
