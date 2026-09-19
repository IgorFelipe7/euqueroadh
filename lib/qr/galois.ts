/**
 * GF(2⁸) arithmetic and Reed–Solomon error-correction codewords, for the QR encoder.
 *
 * The field is the one ISO/IEC 18004 § 7.5.2 specifies: 256 elements, primitive element 2, reduction
 * polynomial `x⁸ + x⁴ + x³ + x² + 1` (`0x11D`). Nothing here is QR-specific beyond that constant;
 * it is ordinary Reed–Solomon over a byte field.
 *
 * Pure, allocation-light and dependency-free. The two tables are built once at module load — 512
 * bytes of `Uint8Array` — because a multiplication in a log table is two array reads and an add,
 * where the shift-and-reduce loop it replaces is eight of each.
 */

/**
 * `EXP[i]` is α^i, doubled to 512 entries so `EXP[LOG[a] + LOG[b]]` needs no modulo: the sum of two
 * logarithms is at most 254 + 254 = 508.
 */
const EXP = new Uint8Array(512);

/** `LOG[α^i]` is `i`. `LOG[0]` is never read — the logarithm of zero does not exist. */
const LOG = new Uint8Array(256);

{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    // Multiply by α (= 2) and reduce when the result leaves the field.
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

/** Field multiplication. Zero is handled explicitly because it has no logarithm. */
function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/**
 * The generator polynomial for `degree` error-correction codewords: ∏(x − α^i) for i in 0…degree−1.
 *
 * Coefficients are stored **highest power first**, and the leading coefficient is always 1, which is
 * what lets the division below skip it.
 *
 * Memoised per degree: a QR symbol needs the same generator once per block, and the set of degrees
 * QR uses is tiny (7…30).
 */
const GENERATORS = new Map<number, Uint8Array>();

function generator(degree: number): Uint8Array {
  const cached = GENERATORS.get(degree);
  if (cached) return cached;

  let poly = Uint8Array.of(1);

  for (let i = 0; i < degree; i += 1) {
    // Multiply by (x + α^i). In GF(2) subtraction is addition, so the sign does not arise.
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= multiply(poly[j], EXP[i]);
    }
    poly = next;
  }

  GENERATORS.set(degree, poly);
  return poly;
}

/**
 * The `count` Reed–Solomon error-correction codewords for one block of data codewords.
 *
 * Polynomial long division of `data · x^count` by the generator, taking the remainder. The working
 * buffer holds the dividend and becomes the remainder in place, which is why it is `count` bytes
 * longer than the data and why the tail is what is returned.
 */
export function errorCorrectionCodewords(data: Uint8Array, count: number): Uint8Array {
  const gen = generator(count);
  const working = new Uint8Array(data.length + count);
  working.set(data);

  for (let i = 0; i < data.length; i += 1) {
    const factor = working[i];
    if (factor === 0) continue;
    // `j` starts at 1: the generator's leading coefficient is 1, so that term cancels the position
    // being eliminated and needs no multiplication.
    for (let j = 1; j < gen.length; j += 1) {
      working[i + j] ^= multiply(gen[j], factor);
    }
  }

  return working.subarray(data.length);
}

/**
 * The remainder of `value · x^degree` modulo `divisor`, over GF(2) — a BCH code, not a field
 * operation, so it is bitwise rather than table-driven.
 *
 * Used for the two self-correcting metadata strings QR carries: the 15-bit format information
 * (BCH(15,5), divisor `0x537`) and the 18-bit version information (BCH(18,6), divisor `0x1F25`).
 * Computing them is four lines; tabulating forty magic constants per string is not, and a mistyped
 * constant would be a symbol that scanners reject for a reason nothing in the code would explain.
 */
export function bchRemainder(value: number, divisor: number, degree: number): number {
  let remainder = value << degree;
  const divisorBits = 32 - Math.clz32(divisor);

  for (let bit = 32 - Math.clz32(remainder); bit >= divisorBits; bit = 32 - Math.clz32(remainder)) {
    remainder ^= divisor << (bit - divisorBits);
  }

  return remainder;
}
