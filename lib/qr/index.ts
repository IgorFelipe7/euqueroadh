/**
 * A QR Code encoder — byte mode, versions 1 to 10, all four error-correction levels.
 *
 * ## Why this is in the repository rather than in `package.json`
 *
 * The wall needs one thing: a short ASCII URL turned into a module matrix, server-side, with no
 * network call. An external QR generation *service* is out of the question — it would put the live
 * check-in capability into a third party's request log — and of the libraries, the maintained ones
 * carry a CLI, an argument parser and a PNG encoder to do it. This is the `D37` argument again (no
 * PDF dependency for a document the browser can already print): the specified part of QR is small,
 * it is frozen by ISO/IEC 18004, and it is *testable* — `index.test.ts` decodes every symbol this
 * module produces back to its input by re-deriving the placement independently, and verifies that
 * every Reed–Solomon syndrome is zero, which is the same check a scanner performs.
 *
 * Versions 1–10 top out at 271 bytes at level Q, which is an order of magnitude more than the
 * longest URL this product can produce (`https://` + host + `/presenca/` + a 27-character token).
 * Versions 11–40 are omitted deliberately rather than forgotten: they would add a second character-
 * count width, twenty-five more block tables and a longer alignment-pattern rule, none of which
 * could ever execute here, and untested code that cannot run is worse than absent code.
 *
 * ## What the caller gets
 *
 * A `QrSymbol`: the module count and a row-major `Uint8Array` of 0/1. Rendering is somebody else's
 * job — `components/qr-code.tsx` turns it into one SVG path — so this module has no notion of colour,
 * size, margin or DOM.
 *
 * ## Structure of the encode, in the order the spec puts it
 *
 *   1. choose the smallest version whose data capacity fits, at the requested EC level;
 *   2. build the bit stream: mode indicator, character count, the bytes, terminator, pad;
 *   3. split into blocks, compute each block's EC codewords, interleave both groups;
 *   4. draw the function patterns — finders, separators, timing, alignment, dark module;
 *   5. lay the codewords into the remaining modules in the spec's two-column zigzag;
 *   6. try all eight masks, score each, keep the best;
 *   7. write the format information (and, from version 7, the version information).
 */

import { bchRemainder, errorCorrectionCodewords } from './galois';

/**
 * The four error-correction levels, recovering roughly 7%, 15%, 25% and 30% of a damaged symbol.
 *
 * The numeric values are **not** an ordering: they are the two-bit identifiers the format information
 * carries (ISO/IEC 18004 table 12), which run L, M, Q, H as 01, 00, 11, 10.
 */
export const EC_LEVELS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 } as const;

export type EcLevel = keyof typeof EC_LEVELS;

export interface QrSymbol {
  /** Modules per side, excluding the quiet zone. `17 + 4 × version`. */
  readonly size: number;
  /** Row-major, `size × size`, one byte per module: 1 is dark. */
  readonly modules: Uint8Array;
  readonly version: number;
  readonly level: EcLevel;
  /** Which of the eight mask patterns scored best. Recorded for the tests, not for rendering. */
  readonly mask: number;
}

/** Raised for an input this encoder cannot represent. Never for a malformed *symbol*. */
export class QrCapacityError extends Error {
  constructor(bytes: number, level: EcLevel) {
    super(`${bytes} bytes do not fit in a version-10 QR symbol at level ${level}.`);
    this.name = 'QrCapacityError';
  }
}

const MIN_VERSION = 1;
const MAX_VERSION = 10;

/**
 * Total codewords — data plus error correction — per version. ISO/IEC 18004 table 1, less the
 * remainder bits, which are always zero for these ten versions.
 */
export const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346] as const;

/**
 * The block structure, from ISO/IEC 18004 table 13–22, as
 * `[ecCodewordsPerBlock, blocksInGroup1, blocksInGroup2]`, indexed by version − 1.
 *
 * Group 2's blocks each hold exactly one data codeword more than group 1's, which is a property of
 * the standard rather than of this table — so the two data lengths are *derived* below instead of
 * being listed. That removes the entire class of transcription error where a listed data length and
 * a listed EC length do not add up to the version's total, and `index.test.ts` asserts the
 * arithmetic closes for all forty combinations.
 */
const BLOCKS: Readonly<Record<EcLevel, readonly (readonly [number, number, number])[]>> = {
  L: [
    [7, 1, 0], [10, 1, 0], [15, 1, 0], [20, 1, 0], [26, 1, 0],
    [18, 2, 0], [20, 2, 0], [24, 2, 0], [30, 2, 0], [18, 2, 2],
  ],
  M: [
    [10, 1, 0], [16, 1, 0], [26, 1, 0], [18, 2, 0], [24, 2, 0],
    [16, 4, 0], [18, 4, 0], [22, 2, 2], [22, 3, 2], [26, 4, 1],
  ],
  Q: [
    [13, 1, 0], [22, 1, 0], [18, 2, 0], [26, 2, 0], [18, 2, 2],
    [24, 4, 0], [18, 2, 4], [22, 4, 2], [20, 4, 4], [24, 6, 2],
  ],
  H: [
    [17, 1, 0], [28, 1, 0], [22, 2, 0], [16, 4, 0], [22, 2, 2],
    [28, 4, 0], [26, 4, 1], [26, 4, 2], [24, 4, 4], [28, 6, 2],
  ],
};

/**
 * Alignment-pattern centre coordinates per version. ISO/IEC 18004 table E.1.
 *
 * Listed rather than computed: the general rule has an exception at version 32 and an off-by-one
 * reading that is easy to get wrong, and ten short arrays are not worth being clever about.
 */
const ALIGNMENT_CENTRES: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Byte mode. ISO/IEC 18004 table 2. */
const MODE_BYTE = 0b0100;

/** The two alternating pad codewords of § 7.4.10. Not arbitrary — the standard names them. */
const PAD_CODEWORDS = [0xec, 0x11] as const;

export interface Blocks {
  readonly ecPerBlock: number;
  readonly group1: { readonly blocks: number; readonly dataCodewords: number };
  readonly group2: { readonly blocks: number; readonly dataCodewords: number };
  readonly dataCodewords: number;
}

/**
 * Resolves a version and level into its block structure.
 *
 * Group 1's data length is the floor of the available data codewords over the block count, and
 * group 2's is one more. Both follow from the standard's own construction, so they cannot disagree
 * with `TOTAL_CODEWORDS`.
 */
export function blocksFor(version: number, level: EcLevel): Blocks {
  const [ecPerBlock, blocks1, blocks2] = BLOCKS[level][version - 1];
  const blocks = blocks1 + blocks2;
  const data = TOTAL_CODEWORDS[version - 1] - ecPerBlock * blocks;
  const short = Math.floor(data / blocks);

  return {
    ecPerBlock,
    group1: { blocks: blocks1, dataCodewords: short },
    group2: { blocks: blocks2, dataCodewords: short + 1 },
    dataCodewords: data,
  };
}

/** 8 bits for versions 1–9, 16 from version 10. ISO/IEC 18004 table 3, byte mode. */
export function characterCountBits(version: number): number {
  return version < 10 ? 8 : 16;
}

/* ------------------------------------------------------------------------------------------------
 * The bit stream
 * ---------------------------------------------------------------------------------------------- */

class BitBuffer {
  private readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  /** Pads to a whole number of bytes with zeroes and packs, most-significant bit first. */
  toCodewords(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i += 1) {
      if (this.bits[i]) bytes[i >>> 3] |= 0x80 >>> (i & 7);
    }
    return bytes;
  }
}

/**
 * The data codewords for one payload, padded to the version's exact capacity.
 *
 * The terminator is *up to* four zero bits — fewer when fewer remain, which is what the `Math.min`
 * expresses. Truncating it to the remaining space rather than always writing four is the difference
 * between a valid symbol and one that overruns its last codeword by half a byte.
 */
function dataCodewords(bytes: Uint8Array, version: number, capacity: number): Uint8Array {
  const buffer = new BitBuffer();
  buffer.push(MODE_BYTE, 4);
  buffer.push(bytes.length, characterCountBits(version));
  for (const byte of bytes) buffer.push(byte, 8);

  const capacityBits = capacity * 8;
  buffer.push(0, Math.min(4, capacityBits - buffer.length));
  // Round up to a byte boundary; `toCodewords` zero-fills, so this only has to make the count right.
  buffer.push(0, (8 - (buffer.length % 8)) % 8);

  const codewords = new Uint8Array(capacity);
  codewords.set(buffer.toCodewords());

  for (let i = buffer.length / 8, pad = 0; i < capacity; i += 1, pad += 1) {
    codewords[i] = PAD_CODEWORDS[pad % 2];
  }

  return codewords;
}

/**
 * Splits the data into blocks, computes each block's EC codewords, and interleaves.
 *
 * Interleaving is what makes a burst of damage — a thumb, a glare spot — land across many blocks
 * instead of destroying one: codeword *i* of every block is emitted before codeword *i + 1* of any.
 * Group 1's blocks are one codeword shorter, so the final data round skips them, which is the
 * `if (i < ...)` guard rather than a second loop.
 */
function interleave(data: Uint8Array, blocks: Blocks): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (const group of [blocks.group1, blocks.group2]) {
    for (let b = 0; b < group.blocks; b += 1) {
      const block = data.subarray(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(block);
      ecBlocks.push(errorCorrectionCodewords(block, blocks.ecPerBlock));
    }
  }

  const result = new Uint8Array(dataBlocks.length * blocks.ecPerBlock + data.length);
  let out = 0;

  for (let i = 0; i < blocks.group2.dataCodewords; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) result[out++] = block[i];
    }
  }
  // Every EC block is the same length, so this loop needs no guard.
  for (let i = 0; i < blocks.ecPerBlock; i += 1) {
    for (const block of ecBlocks) result[out++] = block[i];
  }

  return result;
}

/* ------------------------------------------------------------------------------------------------
 * The matrix
 * ---------------------------------------------------------------------------------------------- */

/**
 * The grid under construction.
 *
 * `reserved` marks every module that belongs to a function pattern or a metadata area. It is what
 * the codeword placement skips and what the mask must not invert, and keeping it as a separate plane
 * — rather than a tri-state value — means "is this a data module" is one array read at both sites
 * and cannot drift between them.
 */
class Grid {
  readonly size: number;
  readonly modules: Uint8Array;
  readonly reserved: Uint8Array;

  constructor(size: number) {
    this.size = size;
    this.modules = new Uint8Array(size * size);
    this.reserved = new Uint8Array(size * size);
  }

  set(row: number, col: number, dark: boolean, reserve = true): void {
    const index = row * this.size + col;
    this.modules[index] = dark ? 1 : 0;
    if (reserve) this.reserved[index] = 1;
  }

  get(row: number, col: number): number {
    return this.modules[row * this.size + col];
  }

  isReserved(row: number, col: number): boolean {
    return this.reserved[row * this.size + col] === 1;
  }
}

/** A 7×7 finder pattern with its 1-module separator, positioned by its top-left corner. */
function drawFinder(grid: Grid, top: number, left: number): void {
  // The separator is included by running one module outside the pattern on every side; the `inside`
  // test then clips whatever falls off the symbol, which is what makes one routine serve all three
  // corners without a per-corner special case.
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const row = top + dy;
      const col = left + dx;
      if (row < 0 || col < 0 || row >= grid.size || col >= grid.size) continue;

      const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      // Rings at Chebyshev distance 0–1 and 3 are dark; 2 and 4 (the separator) are light.
      grid.set(row, col, distance !== 2 && distance <= 3);
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const last = grid.size - 1;

  drawFinder(grid, 0, 0);
  drawFinder(grid, 0, last - 6);
  drawFinder(grid, last - 6, 0);

  // Timing patterns: row 6 and column 6, alternating, dark on even coordinates.
  //
  // Bounded to the span BETWEEN the separators, 8 … size−9, and that bound is load-bearing. Row 6 of
  // the top-left finder is a solid dark run, and running the alternating pattern across it would
  // punch three light modules through the finder — a symbol no scanner locates. The two ends of the
  // span are even coordinates and therefore dark, which is what makes the pattern join the finders.
  for (let i = 8; i <= grid.size - 9; i += 1) {
    grid.set(6, i, i % 2 === 0);
    grid.set(i, 6, i % 2 === 0);
  }

  // Alignment patterns: 5×5, at every pair of centres except the three that would sit on a finder.
  const centres = ALIGNMENT_CENTRES[version - 1];
  for (const row of centres) {
    for (const col of centres) {
      const onFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === last - 6) ||
        (row === last - 6 && col === 6);
      if (onFinder) continue;

      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          grid.set(row + dy, col + dx, distance !== 1);
        }
      }
    }
  }

  // The module that is always dark (§ 7.9.1). It sits inside the format-information area and is the
  // reason that area holds 31 bits rather than 32.
  grid.set(grid.size - 8, 8, true);

  // The rest of the format-information area is reserved now and written after masking, because its
  // value depends on which mask wins.
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      grid.set(8, i, false);
      grid.set(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) grid.set(8, last - i, false);
  for (let i = 0; i < 7; i += 1) grid.set(last - i, 8, false);

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const near = Math.floor(i / 3);
      const far = grid.size - 11 + (i % 3);
      grid.set(near, far, false);
      grid.set(far, near, false);
    }
  }
}

/**
 * Lays the interleaved codewords into every module the function patterns left.
 *
 * Column pairs, right to left, skipping column 6 — the vertical timing pattern — by stepping the
 * *right* index from 6 to 5, which keeps the pairs aligned for every column left of it. Inside a
 * pair the fill alternates upward and downward, which is what `(right + 1) & 2` selects.
 */
function drawCodewords(grid: Grid, codewords: Uint8Array): void {
  let bit = 0;
  const total = codewords.length * 8;

  for (let right = grid.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;

    for (let vertical = 0; vertical < grid.size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? grid.size - 1 - vertical : vertical;

        if (grid.isReserved(row, col) || bit >= total) continue;

        const dark = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
        grid.set(row, col, dark, false);
        bit += 1;
      }
    }
  }
}

/** The eight mask conditions of ISO/IEC 18004 table 10, on `row` (i) and `col` (j). */
function maskAt(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/** Inverts every data module the mask selects. Applying it twice restores the grid, which is how the
 *  eight candidates are evaluated without rebuilding the matrix eight times. */
function applyMask(grid: Grid, mask: number): void {
  for (let row = 0; row < grid.size; row += 1) {
    for (let col = 0; col < grid.size; col += 1) {
      if (grid.isReserved(row, col)) continue;
      if (maskAt(mask, row, col)) grid.modules[row * grid.size + col] ^= 1;
    }
  }
}

const PENALTY_RUN = 3;
const PENALTY_BLOCK = 3;
const PENALTY_FINDER_LIKE = 40;
const PENALTY_BALANCE = 10;

/** The 1:1:3:1:1 finder proportion with four light modules on one side (§ 7.8.3.3, feature 3). */
const FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0] as const;

/**
 * The mask evaluation score of § 7.8.3. Lower is better.
 *
 * **This affects readability, never validity.** Any of the eight masks produces a symbol a scanner
 * decodes correctly, provided the format information names the one that was applied; the score only
 * steers the choice towards a symbol with fewer large uniform areas and fewer false finder patterns.
 * That is why the implementation below favours being obviously right about the four features over
 * matching a reference implementation's traversal exactly.
 */
function penalty(grid: Grid): number {
  const { size } = grid;
  let score = 0;

  // Features 1 and 3, across rows and then columns. One pass per line, both features at once.
  for (let axis = 0; axis < 2; axis += 1) {
    for (let line = 0; line < size; line += 1) {
      const at = (i: number) => (axis === 0 ? grid.get(line, i) : grid.get(i, line));

      let run = 1;
      for (let i = 1; i < size; i += 1) {
        if (at(i) === at(i - 1)) {
          run += 1;
        } else {
          if (run >= 5) score += PENALTY_RUN + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += PENALTY_RUN + (run - 5);

      // The eleven-module pattern, in both directions. Counted for each occurrence, and a symbol
      // where it reads the same forwards and backwards earns the penalty twice, as the spec intends.
      for (let start = 0; start + FINDER_LIKE.length <= size; start += 1) {
        let forward = true;
        let backward = true;
        for (let k = 0; k < FINDER_LIKE.length; k += 1) {
          if (at(start + k) !== FINDER_LIKE[k]) forward = false;
          if (at(start + k) !== FINDER_LIKE[FINDER_LIKE.length - 1 - k]) backward = false;
        }
        if (forward) score += PENALTY_FINDER_LIKE;
        if (backward) score += PENALTY_FINDER_LIKE;
      }
    }
  }

  // Feature 2: every 2×2 block of one colour, counted with overlap.
  for (let row = 0; row + 1 < size; row += 1) {
    for (let col = 0; col + 1 < size; col += 1) {
      const first = grid.get(row, col);
      if (
        first === grid.get(row, col + 1) &&
        first === grid.get(row + 1, col) &&
        first === grid.get(row + 1, col + 1)
      ) {
        score += PENALTY_BLOCK;
      }
    }
  }

  // Feature 4: departure from an even split of dark and light, in 5% steps.
  const total = size * size;
  let dark = 0;
  for (let i = 0; i < total; i += 1) dark += grid.modules[i];
  // The smallest k ≥ 0 for which the dark proportion lies inside (45 − 5k)%…(55 + 5k)%, which is the
  // spec's "deviation from 50% in 5% steps" stated without leaving integer arithmetic. An exact
  // even split gives −1 before the clamp, and therefore no penalty.
  const steps = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, steps) * PENALTY_BALANCE;

  return score;
}

/**
 * Writes the fifteen-bit format information, twice.
 *
 * Five data bits — the EC level and the mask — protected by a BCH(15,5) code and XORed with
 * `0x5412`, which is the mask the standard applies so that an all-zero format cannot produce an
 * all-light area. Both copies carry the same bits; the second exists so a symbol with one damaged
 * corner is still readable.
 */
function drawFormatInfo(grid: Grid, level: EcLevel, mask: number): void {
  const data = (EC_LEVELS[level] << 3) | mask;
  const bits = ((data << 10) | bchRemainder(data, 0x537, 10)) ^ 0x5412;

  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const last = grid.size - 1;

  // The two copies run in OPPOSITE directions around the top-left finder, and getting that backwards
  // is a symbol whose metadata reads as a different mask — which is why the axes are spelled out
  // here rather than shared between the two loops. Copy one climbs column 8 from the top, turns the
  // corner at (8, 8), and continues leftward along row 8.
  for (let i = 0; i <= 5; i += 1) grid.set(i, 8, bit(i));
  grid.set(7, 8, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(8, 7, bit(8));
  for (let i = 9; i < 15; i += 1) grid.set(8, 14 - i, bit(i));

  // Copy two starts at the right-hand end of row 8 and runs inwards, then resumes down column 8 from
  // just below the dark module to the bottom edge.
  for (let i = 0; i < 8; i += 1) grid.set(8, last - i, bit(i));
  for (let i = 8; i < 15; i += 1) grid.set(grid.size - 15 + i, 8, bit(i));
}

/**
 * Writes the eighteen-bit version information, twice, for version 7 and above.
 *
 * Six data bits — the version number — protected by BCH(18,6). There is no XOR mask on this one.
 */
function drawVersionInfo(grid: Grid, version: number): void {
  if (version < 7) return;

  const bits = (version << 12) | bchRemainder(version, 0x1f25, 12);

  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const near = Math.floor(i / 3);
    const far = grid.size - 11 + (i % 3);
    grid.set(near, far, dark);
    grid.set(far, near, dark);
  }
}

/* ------------------------------------------------------------------------------------------------
 * The entry point
 * ---------------------------------------------------------------------------------------------- */

/**
 * Encodes `text` as a QR symbol.
 *
 * The text is encoded as UTF-8 in byte mode. Alphanumeric mode would pack an upper-case URL more
 * tightly, but a check-in token is mixed-case base64url and would fall out of its character set, so
 * the mode is fixed rather than chosen — one path, always exercised.
 *
 * `version` may be raised above the minimum that fits, which is the only reason a caller would set
 * it: a fixed version keeps the module count stable while the URL's length changes, so a projected
 * QR does not visibly re-grid when a token happens to encode a byte longer.
 */
export function encodeQr(
  text: string,
  options: { readonly level?: EcLevel; readonly version?: number } = {},
): QrSymbol {
  const level = options.level ?? 'Q';
  const bytes = new TextEncoder().encode(text);

  const minimum = smallestVersion(bytes.length, level);
  const version = Math.max(minimum, options.version ?? MIN_VERSION);

  if (version > MAX_VERSION) throw new QrCapacityError(bytes.length, level);

  const blocks = blocksFor(version, level);
  const codewords = interleave(
    dataCodewords(bytes, version, blocks.dataCodewords),
    blocks,
  );

  const grid = new Grid(17 + 4 * version);
  drawFunctionPatterns(grid, version);
  drawVersionInfo(grid, version);
  drawCodewords(grid, codewords);

  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(grid, mask);
    drawFormatInfo(grid, level, mask);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
    // Symmetric: the same XOR restores the data modules for the next candidate.
    applyMask(grid, mask);
  }

  applyMask(grid, best);
  drawFormatInfo(grid, level, best);

  return { size: grid.size, modules: grid.modules, version, level, mask: best };
}

/** The smallest version whose data capacity holds `bytes`, or `MAX_VERSION + 1` if none does. */
function smallestVersion(bytes: number, level: EcLevel): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
    const capacityBits = blocksFor(version, level).dataCodewords * 8;
    const needed = 4 + characterCountBits(version) + bytes * 8;
    if (needed <= capacityBits) return version;
  }
  return MAX_VERSION + 1;
}
