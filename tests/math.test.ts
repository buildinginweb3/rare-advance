/**
 * FIXED-POINT MATH + POOL TESTS
 * =============================
 */

import { describe, expect, it } from 'vitest'
import {
  BPS_SCALE,
  divRoundDown,
  formatDurationLong,
  formatRFCompact,
  formatShare,
  formatWeightCompact,
  formatBpsAsPercent,
  formatDuration,
  formatRF,
  formatWeight,
  formatWeightDelta,
  mulBps,
  parseRF,
  parseWeight,
  percentWhole,
  weightChangeBps,
  weightFromWei18,
  weightToWei18,
} from '../src/math/rf'
import { addDeposit, buildPool, canFill, poolAvailable, poolUtilizationBps } from '../src/economy/pool'
import { DEMO_POOL_SEED_WEI } from '../src/session/demoData'

describe('parseRF', () => {
  it('parses integers, decimals and wei exactly', () => {
    expect(parseRF('0')).toBe(0n)
    expect(parseRF('1')).toBe(10n ** 18n)
    expect(parseRF('0.1')).toBe(100_000_000_000_000_000n)
    expect(parseRF('168750')).toBe(168_750n * 10n ** 18n)
    expect(parseRF('3.965625')).toBe(3_965_625_000_000_000_000n)
    expect(parseRF('1234.567890123456789')).toBe(1_234_567_890_123_456_789_000n)
  })

  it('pads short fractions to 18 decimals', () => {
    expect(parseRF('1.5')).toBe(15n * 10n ** 17n)
  })

  it('rejects more than 18 decimals', () => {
    expect(() => parseRF('0.0000000000000000001')).toThrow()
  })

  it('rejects nonsense', () => {
    expect(() => parseRF('abc')).toThrow()
    expect(() => parseRF('')).toThrow()
  })

  it('accepts bigint passthrough', () => {
    expect(parseRF(42n)).toBe(42n)
  })
})

describe('parseWeight', () => {
  it('handles every documented decimal precision', () => {
    expect(parseWeight('175000')).toBe(175_000_000_000n)
    expect(parseWeight('1.1')).toBe(1_100_000n)
    expect(parseWeight('3.965625')).toBe(3_965_625n)
    expect(parseWeight('987187.5')).toBe(987_187_500_000n)
    expect(parseWeight('43.03125')).toBe(43_031_250n)
  })

  it('rejects more than 6 decimals', () => {
    expect(() => parseWeight('1.1234567')).toThrow()
  })
})

describe('weight <-> wei18 round trip', () => {
  it('is exact for every documented weight', () => {
    const values = ['175000', '987187.5', '3.965625', '6.075', '1.1', '5146.875', '86062.5']
    for (const v of values) {
      const micros = parseWeight(v)
      expect(weightFromWei18(weightToWei18(micros))).toBe(micros)
    }
  })

  it('matches the verified onchain Genesis weight of 2,000,000e18', () => {
    expect(weightToWei18(parseWeight('2000000'))).toBe(2_000_000n * 10n ** 18n)
    expect(weightFromWei18(2_000_000n * 10n ** 18n)).toBe(parseWeight('2000000'))
  })
})

describe('basis point arithmetic rounds down', () => {
  it('mulBps floors', () => {
    expect(mulBps(10_000n, 2_500n)).toBe(2_500n)
    expect(mulBps(3n, 5_000n)).toBe(1n)
    expect(mulBps(1n, 9_999n)).toBe(0n)
  })

  it('divRoundDown floors', () => {
    expect(divRoundDown(7n, 2n)).toBe(3n)
    expect(divRoundDown(6n, 3n)).toBe(2n)
    expect(() => divRoundDown(1n, 0n)).toThrow()
  })

  it('never rounds up past the original value', () => {
    for (let i = 0n; i < 40n; i += 1n) {
      for (const bps of [1n, 33n, 500n, 7_777n, 10_000n]) {
        expect(mulBps(i, bps)).toBeLessThanOrEqual(i)
      }
    }
  })
})

describe('formatting', () => {
  it('formats RF with grouping and trimmed fractions', () => {
    expect(formatRF(0n)).toBe('0')
    expect(formatRF(1_000n * 10n ** 18n)).toBe('1,000')
    expect(formatRF(parseRF('0.5'))).toBe('0.5')
    expect(formatRF(parseRF('29073.646055'))).toBe('29,073.646055')
    expect(formatRF(parseRF('1234567.89'))).toBe('1,234,567.89')
  })

  it('formats weight and deltas', () => {
    expect(formatWeight(parseWeight('175000'))).toBe('175,000')
    expect(formatWeight(parseWeight('3.965625'))).toBe('3.965625')
    expect(formatWeightDelta(parseWeight('5146.875') - parseWeight('3375'))).toBe('+1,771.875')
    expect(formatWeightDelta(-parseWeight('100'))).toBe('-100')
    expect(formatWeightDelta(0n)).toBe('0')
  })

  it('formats basis points as percentages', () => {
    expect(formatBpsAsPercent(500n)).toBe('5%')
    expect(formatBpsAsPercent(5_249n, 2)).toBe('52.49%')
    expect(formatBpsAsPercent(5_249n, 1)).toBe('52.5%')
    expect(formatBpsAsPercent(3_390n, 0)).toBe('33%')
    expect(formatBpsAsPercent(3_390n, 1)).toBe('33.9%')
    expect(formatBpsAsPercent(7_500n, 0)).toBe('75%')
  })

  it('formats durations', () => {
    expect(formatDuration(0n)).toBe('0m')
    expect(formatDuration(5n * 86_400_000n + 14n * 3_600_000n)).toBe('5d 14h')
    expect(formatDuration(4n * 3_600_000n + 18n * 60_000n)).toBe('4h 18m')
  })

  it('computes whole percentages for progress bars', () => {
    expect(percentWhole(0n, 100n)).toBe(0)
    expect(percentWhole(50n, 100n)).toBe(50)
    expect(percentWhole(100n, 100n)).toBe(100)
    expect(percentWhole(5n, 0n)).toBe(0)
  })

  it('computes weight change in bps, null from zero', () => {
    expect(weightChangeBps(parseWeight('1000'), parseWeight('1500'))).toBe(5_000n)
    expect(weightChangeBps(0n, parseWeight('1500'))).toBeNull()
  })

  it('formats compact RF for the device readout', () => {
    expect(formatRFCompact(0n)).toBe('0')
    expect(formatRFCompact(parseRF('0.5'))).toBe('0.5')
    expect(formatRFCompact(parseRF('163.04'))).toBe('163.04')
    expect(formatRFCompact(parseRF('999.9'))).toBe('999.9')
    expect(formatRFCompact(parseRF('1000'))).toBe('1.00K')
    expect(formatRFCompact(parseRF('29073.646055'))).toBe('29.07K')
    expect(formatRFCompact(parseRF('1234567'))).toBe('1.23M')
    expect(formatRFCompact(parseRF('4692104.14'))).toBe('4.69M')
    expect(formatRFCompact(parseRF('240000'))).toBe('240.00K')
  })

  it('compact RF never overstates the amount held', () => {
    const suffixScale: Record<string, bigint> = { K: 1_000n, M: 1_000_000n, B: 1_000_000_000n, T: 1_000_000_000_000n }
    for (const s of ['1.999', '999.999', '1999.999', '999999.999', '1', '0.001']) {
      const compact = formatRFCompact(parseRF(s))
      const m = /^([\d,]+(?:\.\d+)?)([KMBT])?$/.exec(compact)
      expect(m, `unparsable compact output: ${compact}`).toBeTruthy()
      const mantissa = parseRF((m![1] ?? '0').replace(/,/g, '')) * (suffixScale[m![2] ?? ''] ?? 1n)
      expect(mantissa, `${s} -> ${compact}`).toBeLessThanOrEqual(parseRF(s))
    }
  })

  it('formats compact weight for the device readout', () => {
    expect(formatWeightCompact(2_000_000n * 1_000_000n)).toBe('2.00M')
    expect(formatWeightCompact(175_000n * 1_000_000n)).toBe('175.00K')
    // rounds down, so it never overstates the network's total weight
    expect(formatWeightCompact(1_068_353_624_531_250n)).toBe('1.06B')
    expect(formatWeightCompact(12n * 1_000_000n)).toBe('12')
  })

  it('keeps BPS_SCALE at 10,000', () => {
    expect(BPS_SCALE).toBe(10_000n)
  })

  it('formats long modeled horizons readably instead of as a raw day count', () => {
    expect(formatDurationLong(0n)).toBe('0m')
    expect(formatDurationLong(5n * 86_400_000n)).toBe('5d 0h')
    expect(formatDurationLong(400n * 86_400_000n)).toBe('1.1y')
    expect(formatDurationLong(6_612_604_313_738_788_200n)).toBe('>1,000 years')
  })

  it('never displays a sub-basis-point share as a flat 0%', () => {
    expect(formatShare(0n)).toBe('0%')
    expect(formatShare(1n)).toBe('<0.000001%')
    // 0.5% == 5e15 at 1e18 scale
    // 5e15 / 1e18 = 0.005 of the pool = 0.5%
    expect(formatShare(5_000_000_000_000_000n)).toBe('0.5%')
    expect(formatShare(10n ** 17n)).toBe('10%')
    expect(formatShare(10n ** 18n)).toBe('100%')
    expect(formatShare(200_000_000_000_000n)).toBe('0.02%')
  })
})

describe('simulated liquidity pool', () => {
  const pool = buildPool(DEMO_POOL_SEED_WEI)

  it('matches the documented demo dashboard', () => {
    expect(formatRF(pool.totalLiquidityWei, 0)).toBe('240,000')
    expect(formatRF(pool.advancesOutstandingWei, 0)).toBe('81,400')
    expect(formatRF(poolAvailable(pool), 0)).toBe('158,600')
    expect(formatBpsAsPercent(poolUtilizationBps(pool), 1)).toBe('33.9%')
    expect(formatRF(pool.lpSpreadEarnedWei, 0)).toBe('3,820')
    expect(formatRF(pool.rareAdvanceBurnedWei, 0)).toBe('955')
  })

  it('utilization is advances outstanding over total liquidity', () => {
    expect(poolUtilizationBps(pool)).toBe((pool.advancesOutstandingWei * 10_000n) / pool.totalLiquidityWei)
  })

  it('a deposit raises total liquidity and the depositor share', () => {
    const after = addDeposit(pool, parseRF('10000'))
    expect(after.totalLiquidityWei).toBe(pool.totalLiquidityWei + parseRF('10000'))
    expect(after.userDepositWei).toBe(parseRF('10000'))
    expect(after.userDepositShareBps).toBe((parseRF('10000') * BPS_SCALE) / after.totalLiquidityWei)
    expect(after.advancesOutstandingWei).toBe(pool.advancesOutstandingWei)
  })

  it('rejects a zero deposit and an over-advanced pool', () => {
    expect(() => addDeposit(pool, 0n)).toThrow()
    expect(() =>
      buildPool({
        totalLiquidityWei: 100n,
        advancesOutstandingWei: 200n,
        lpSpreadEarnedWei: 0n,
        rareAdvanceBurnedWei: 0n,
        advancesIssuedWei: 0n,
        rfFinancedIntoActionsWei: 0n,
        userDepositWei: 0n,
      }),
    ).toThrow()
  })

  it('refuses a quote the pool cannot fill', () => {
    expect(canFill(pool, parseRF('1000'))).toBe(true)
    expect(canFill(pool, parseRF('999999'))).toBe(false)
  })
})
