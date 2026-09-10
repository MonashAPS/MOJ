/**
 * Numeric helpers that behave like the Python/Django ones DMOJ relies on.
 *
 * `pyRound` matters because DMOJ rounds scores in several places
 * (`round(points, 1)`, `round(points, contest.points_precision)`) and Python's
 * `round` is round-half-to-even over the *exact* value of the double, not
 * round-half-away-from-zero over its decimal shorthand. `(2.5).toFixed(0)` is
 * "3" in JavaScript but `round(2.5)` is `2` in Python.
 */

const TWO = 2n;
const TEN = 10n;

interface DecomposedDouble {
  negative: boolean;
  /** Non-negative significand. */
  mantissa: bigint;
  /** Binary exponent, so |value| === mantissa * 2 ** exponent. */
  exponent: number;
}

/** Exact decomposition of a finite double into `mantissa * 2 ** exponent`. */
function decompose(value: number): DecomposedDouble {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value);
  const high = view.getUint32(0);
  const low = view.getUint32(4);

  const negative = (high & 0x80000000) !== 0;
  const biasedExponent = (high >>> 20) & 0x7ff;
  const rawMantissa = (BigInt(high & 0xfffff) << 32n) | BigInt(low);

  if (biasedExponent === 0) {
    // Subnormal (or zero): no implicit leading bit.
    return { negative, mantissa: rawMantissa, exponent: -1074 };
  }
  return {
    negative,
    mantissa: rawMantissa | (1n << 52n),
    exponent: biasedExponent - 1075,
  };
}

function pow10(digits: number): bigint {
  return TEN ** BigInt(digits);
}

/**
 * Python's `round(value, digits)` for floats: round-half-to-even applied to the
 * exact binary value, then converted back to the nearest double.
 */
export function pyRound(value: number, digits = 0): number {
  if (!Number.isFinite(value) || value === 0) return value;
  if (!Number.isInteger(digits)) throw new RangeError('digits must be an integer');

  const { negative, mantissa, exponent } = decompose(value);
  if (mantissa === 0n) return value;

  // We want round_half_even(|value| * 10 ** digits) as an integer `scaled`,
  // then |value| ~= scaled / 10 ** digits.
  //
  // |value| * 10 ** digits = mantissa * 2 ** exponent * 10 ** digits
  //                        = numerator / denominator with both integral.
  let numerator = mantissa;
  let denominator = 1n;

  if (exponent >= 0) numerator <<= BigInt(exponent);
  else denominator <<= BigInt(-exponent);

  if (digits >= 0) numerator *= pow10(digits);
  else denominator *= pow10(-digits);

  let scaled = numerator / denominator;
  const remainder = numerator - scaled * denominator;
  const twiceRemainder = remainder * TWO;
  if (twiceRemainder > denominator) {
    scaled += 1n;
  } else if (twiceRemainder === denominator) {
    // Exact tie: round half to even.
    if (scaled % TWO !== 0n) scaled += 1n;
  }

  // Build the decimal literal and let the (correctly rounded) string-to-double
  // conversion produce the result, exactly as CPython does.
  const sign = negative ? '-' : '';
  if (digits <= 0) return Number(`${sign}${scaled * pow10(-digits)}`);

  const text = scaled.toString().padStart(digits + 1, '0');
  const whole = text.slice(0, text.length - digits);
  const fraction = text.slice(text.length - digits);
  return Number(`${sign}${whole}.${fraction}`);
}

/**
 * Django's `floatformat` filter.
 *
 * A positive `arg` always shows that many decimals. A negative `arg` shows up
 * to `-arg` decimals, but nothing at all when the value is integral. Rounding
 * is half-up (Django builds a `Decimal` from `repr(value)` and quantizes with
 * `ROUND_HALF_UP`), which is *not* the same as `pyRound`; both appear in DMOJ
 * and they are kept apart here on purpose.
 */
export function floatformat(value: number, arg = -1): string {
  if (!Number.isFinite(value)) return String(value);
  const places = Math.trunc(arg);

  if (places < 0 && Number.isInteger(value)) return roundHalfUp(value, 0);
  return roundHalfUp(value, Math.abs(places));
}

/**
 * Decimal rounding of a double's shortest representation, ties away from zero,
 * rendered with exactly `places` decimals. This mirrors
 * `Decimal(repr(x)).quantize(exp, ROUND_HALF_UP)`, so 2.675 rounds to "2.68"
 * where `toFixed(2)` (which rounds the exact binary value) gives "2.67".
 */
export function roundHalfUp(value: number, places: number): string {
  const sign = value < 0 ? '-' : '';
  const plain = toPlainDecimalString(Math.abs(value));
  const dot = plain.indexOf('.');
  const whole = dot === -1 ? plain : plain.slice(0, dot);
  const fraction = dot === -1 ? '' : plain.slice(dot + 1);

  if (fraction.length <= places) {
    const padded = fraction.padEnd(places, '0');
    return sign + whole + (places > 0 ? `.${padded}` : '');
  }

  let scaled = BigInt(whole + fraction.slice(0, places));
  if (fraction.charCodeAt(places) - 48 >= 5) scaled += 1n;

  const text = scaled.toString().padStart(places + 1, '0');
  if (places === 0) return sign + text;
  return `${sign}${text.slice(0, text.length - places)}.${text.slice(text.length - places)}`;
}

/** A non-negative finite double as a plain decimal string, never exponential. */
function toPlainDecimalString(value: number): string {
  const text = value.toString();
  const exponent = text.indexOf('e');
  if (exponent === -1) return text;

  const mantissa = text.slice(0, exponent);
  const power = Number(text.slice(exponent + 1));
  const dot = mantissa.indexOf('.');
  const whole = dot === -1 ? mantissa : mantissa.slice(0, dot);
  const fraction = dot === -1 ? '' : mantissa.slice(dot + 1);
  const digits = whole + fraction;
  const pointPosition = whole.length + power;

  if (pointPosition <= 0) return `0.${'0'.repeat(-pointPosition)}${digits}`;
  if (pointPosition >= digits.length) return digits + '0'.repeat(pointPosition - digits.length);
  return `${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

/**
 * `judge/utils/timedelta.py:nice_repr(delta, 'noday')`: `HH:MM:SS` with whole
 * days folded into the hours. Input is seconds.
 */
export function niceRepr(seconds: number): string {
  const total = Math.trunc(seconds);
  const negative = total < 0;
  const magnitude = Math.abs(total);
  const hours = Math.floor(magnitude / 3600);
  const minutes = Math.floor((magnitude % 3600) / 60);
  const secs = magnitude % 60;
  return `${negative ? '-' : ''}${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
