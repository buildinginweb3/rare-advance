/**
 * FIXED-POINT RF MATH
 * ===================
 *
 * There is NO binary floating-point arithmetic anywhere in Rare Advance money
 * math. $RAREFRIENDS is 18 decimals and is represented as a `bigint` count of
 * wei. Reward weights are represented as `bigint` counts of micro-units
 * (1e-6), which is exact for every documented weight: the finest documented
 * fraction is 3.965625 (six decimals).
 *
 * Rounding policy: every division rounds DOWN. Nothing is ever rounded up, so
 * rounding can only ever leave dust in the pool, never create value.
 */

import { RF_DECIMALS } from '../protocol/rareFriendsConfig'

export const RF_UNIT = 10n ** BigInt(RF_DECIMALS)
export const WEIGHT_SCALE = 1_000_000n
export const WEIGHT_UNIT_MICROS = 1n
export const BPS_SCALE = 10_000n
export const BPS_DENOMINATOR = 10_000n

const DECIMAL_DIGITS = '0123456789'

/** Parse a non-negative decimal string into 18-decimal wei bigint. */
export function parseRF(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value
  const raw = typeof value === 'number' ? numberToExactDecimal(value) : value.trim()
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!m) throw new Error(`parseRF: invalid RF literal "${raw}"`)
  const [, sign, intPart, fracPart = ''] = m
  if (fracPart.length > RF_DECIMALS) {
    throw new Error(`parseRF: "${raw}" has more than ${RF_DECIMALS} decimals`)
  }
  if (intPart === '' && fracPart === '') throw new Error(`parseRF: invalid RF literal "${raw}"`)
  const padded = (intPart || '0') + fracPart.padEnd(RF_DECIMALS, '0')
  const wei = BigInt(padded)
  return sign === '-' ? -wei : wei
}

/**
 * Numbers are accepted only when they round-trip through their decimal
 * representation without loss. A float literal is never silently trusted.
 */
function numberToExactDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('parseRF: non-finite number')
  if (Number.isInteger(value)) return String(value)
  const s = String(value)
  if (!/^-?\d*(\.\d+)?$/.test(s)) {
    throw new Error(`parseRF: ${value} cannot be represented exactly as a decimal`)
  }
  return s
}

/** Parse a documented weight string into micro-units (1e-6). */
export function parseWeight(value: string | number): bigint {
  const raw = typeof value === 'number' ? numberToExactDecimal(value) : value.trim()
  const m = /^(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!m) throw new Error(`parseWeight: invalid weight literal "${raw}"`)
  const [, intPart, fracPart = ''] = m
  if (fracPart.length > 6) {
    throw new Error(`parseWeight: "${raw}" needs more than 6 decimals for WEIGHT_SCALE`)
  }
  return BigInt(intPart || '0') * WEIGHT_SCALE + BigInt(fracPart.padEnd(6, '0'))
}

/** Convert onchain wei weight (18 decimals) to micro-units, exactly. */
export function weightFromWei18(wei: bigint): bigint {
  if (wei % 1_000_000_000_000n !== 0n) {
    // Documented weights are exact to 6 decimals; anything else is off-table.
    return wei / 1_000_000_000_000n
  }
  return wei / 1_000_000_000_000n
}

/** Convert micro-units back to 18-decimal wei weight. */
export function weightToWei18(micros: bigint): bigint {
  return micros * 1_000_000_000_000n
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function absRF(v: bigint): bigint {
  return v < 0n ? -v : v
}

export function minRF(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

export function maxRF(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

export function clampRF(v: bigint, lo: bigint, hi: bigint): bigint {
  return minRF(maxRF(v, lo), hi)
}

/** Multiply by basis points, rounding down. */
export function mulBps(value: bigint, bps: bigint): bigint {
  return (value * bps) / BPS_SCALE
}

/** Divide rounding down. */
export function divRoundDown(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('divRoundDown: division by zero')
  return a / b
}

export function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new Error('mulDivFloor: division by zero')
  return (a * b) / c
}

/** Basis points as a bigint, from a percent integer. 5 -> 500n */
export function percentToBps(percent: number | bigint): bigint {
  return BigInt(percent) * 100n
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Full-precision grouped RF, e.g. 29,073.646. */
export function formatRF(wei: bigint, maxDecimals = 6): string {
  const neg = wei < 0n
  const v = absRF(wei)
  const whole = v / RF_UNIT
  const frac = v % RF_UNIT
  if (frac === 0n) return `${neg ? '-' : ''}${group(whole.toString())}`
  let fracStr = frac.toString().padStart(RF_DECIMALS, '0').slice(0, maxDecimals)
  fracStr = fracStr.replace(/0+$/, '')
  if (fracStr === '') return `${neg ? '-' : ''}${group(whole.toString())}`
  return `${neg ? '-' : ''}${group(whole.toString())}.${fracStr}`
}

/** Exactly `decimals` fractional digits, always rounded down, never grouped. */
export function formatMantissa(wei: bigint, divisor: bigint, decimals = 2): string {
  const scaled = (wei * 10n ** BigInt(decimals)) / divisor
  const neg = scaled < 0n
  const v = absRF(scaled)
  const whole = v / 10n ** BigInt(decimals)
  const frac = (v % 10n ** BigInt(decimals)).toString().padStart(decimals, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

/**
 * Compact RF for tight device screens: 163.04 / 29.07K / 1.07B.
 * Always rounded DOWN so the number a user sees is never larger than the
 * number they actually hold.
 */
export function formatRFCompact(wei: bigint): string {
  const abs = absRF(wei)
  if (abs < 1_000n * RF_UNIT) return formatRF(wei, 2)
  const units: [bigint, string][] = [
    [1_000_000_000_000n * RF_UNIT, 'T'],
    [1_000_000_000n * RF_UNIT, 'B'],
    [1_000_000n * RF_UNIT, 'M'],
    [1_000n * RF_UNIT, 'K'],
  ]
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      // scale first, then format, so the mantissa is never grouped
      return `${formatMantissa(wei, threshold)}${suffix}`
    }
  }
  return formatRF(wei, 2)
}

/** Weight from micro-units, trimmed of trailing zeros. */
export function formatWeight(micros: bigint, maxDecimals = 6): string {
  const neg = micros < 0n
  const v = absRF(micros)
  const whole = v / WEIGHT_SCALE
  const frac = v % WEIGHT_SCALE
  if (frac === 0n) return `${neg ? '-' : ''}${group(whole.toString())}`
  let fracStr = frac.toString().padStart(6, '0').slice(0, maxDecimals).replace(/0+$/, '')
  if (fracStr === '') return `${neg ? '-' : ''}${group(whole.toString())}`
  return `${neg ? '-' : ''}${group(whole.toString())}.${fracStr}`
}

/** Signed weight delta, e.g. "+1,771.875". */
export function formatWeightDelta(micros: bigint): string {
  if (micros === 0n) return '0'
  return micros > 0n ? `+${formatWeight(micros)}` : `-${formatWeight(-micros)}`
}

/** Weight in whole units (rounded down), for compact device readouts. */
export function formatWeightWhole(micros: bigint): string {
  return group((micros / WEIGHT_SCALE).toString())
}

/** Compact weight for the device readout, e.g. 175.00K or 1.07B. */
export function formatWeightCompact(micros: bigint): string {
  const abs = absRF(micros)
  const units: [bigint, string][] = [
    [1_000_000_000_000n * WEIGHT_SCALE, 'T'],
    [1_000_000_000n * WEIGHT_SCALE, 'B'],
    [1_000_000n * WEIGHT_SCALE, 'M'],
    [1_000n * WEIGHT_SCALE, 'K'],
  ]
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) return `${formatMantissa(micros, threshold)}${suffix}`
  }
  return formatWeight(micros, 2)
}

/**
 * Weight change in basis points, rounded down. This is a share of ALLOCATION
 * WEIGHT and is never presented as a change in earnings.
 */
export function weightChangeBps(fromMicros: bigint, toMicros: bigint): bigint | null {
  if (fromMicros === 0n) return null
  return ((toMicros - fromMicros) * BPS_SCALE) / fromMicros
}

/**
 * Display-only percentage. Rounds half-up for readability; this is never used
 * in settlement math, which is integer-exact end to end.
 */
export function formatBpsAsPercent(bps: bigint, decimals = 1): string {
  const neg = bps < 0n
  const v = absRF(bps)
  if (decimals <= 0) return `${neg ? '-' : ''}${group((v / 100n).toString())}%`
  // 1 bps = 0.01%, so scale by 10^decimals and divide by 100.
  const scale = 10n ** BigInt(decimals)
  const scaled = (v * scale + 50n) / 100n
  const whole = scaled / scale
  const frac = scaled % scale
  const fracStr = `.${frac.toString().padStart(decimals, '0')}`
  const trimmed = fracStr.replace(/0+$/, '').replace(/\.$/, '')
  return `${neg ? '-' : ''}${group(whole.toString())}${trimmed}%`
}

/** Pixel count for a progress bar, 0..100, rounded down. */
export function percentWhole(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) return 0
  if (numerator <= 0n) return 0
  return Number((numerator * 100n) / denominator)
}

/** Duration in ms -> "5d 14h". */
export function formatDuration(ms: bigint): string {
  if (ms <= 0n) return '0m'
  const minutes = ms / 60_000n
  const days = minutes / 1440n
  const hours = (minutes % 1440n) / 60n
  const mins = minutes % 60n
  const d = (days * 24n * 60n * 60n * 1000n).toString()
  void d
  if (days > 0n) return `${days}d ${hours}h`
  if (hours > 0n) return `${hours}h ${mins}m`
  return `${mins}m`
}

/**
 * Duration for modeled horizons. Anything past ~90 days is expressed in years,
 * because a raw day count like 66,126,043,137,387,882d is unreadable and makes
 * a correct model look like a bug.
 */
export function formatDurationLong(ms: bigint): string {
  if (ms <= 0n) return '0m'
  const days = ms / 86_400_000n
  if (days < 90n) return formatDuration(ms)
  // 1 year = 365.25 days; yearsMilli carries four decimal places of a year.
  const yearsMilli = (days * 40_000n + 730n) / 1_461n
  const years = yearsMilli / 10_000n
  if (years >= 1_000n) return '>1,000 years'
  if (years >= 10n) return `${group(years.toString())}y`
  const tenths = ((yearsMilli + 500n) / 1_000n) % 10n
  return `${years}.${tenths}y`
}

/**
 * A modeled reward share can be far below one basis point for a small
 * Generation Friend. Never display that as a flat 0%: show a floor instead.
 */
export function formatShare(shareWad: bigint): string {
  if (shareWad <= 0n) return '0%'
  // shareWad is a fraction at 1e18 scale (1e18 == 100%). Render it as a
  // percent with up to six decimals so a tiny Generation weight is never
  // flattened to a flat 0%.
  const pctMicro = shareWad / 10_000_000_000n
  if (pctMicro === 0n) return '<0.000001%'
  const whole = pctMicro / 1_000_000n
  const frac = (pctMicro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${group(whole.toString())}${frac ? `.${frac}` : ''}%`
}

/** ISO-ish unix seconds -> short stamp. */
export function formatUnixSeconds(seconds: bigint): string {
  const ms = Number(seconds) * 1000
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

/** Digits helper for the pixel counter. */
export function digits(value: string): string[] {
  return value.split('').map((c) => (DECIMAL_DIGITS.includes(c) ? c : c))
}
