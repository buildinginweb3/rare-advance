/**
 * ADVANCE MATH TESTS
 * ==================
 *
 * The default demo terms: holder 95%, LP spread 4%, Rare Advance burn 1%.
 * Rounding must never create value.
 */

import { describe, expect, it } from 'vitest'
import { ADVANCE_MARKET_TERMS, ADVANCE_PRESETS, SIMULATED_POOL_QUOTES } from '../src/economy/rareAdvanceConfig'
import {
  AdvanceError,
  isSettled,
  quoteAdvance,
  quoteFromSimulatedPool,
  reconcileSettlement,
  remainingAt,
  selectEligible,
  selectionToWei,
  settledAt,
  splitFaceValue,
  validateSelection,
} from '../src/economy/advance'
import { BPS_SCALE, mulBps, parseRF } from '../src/math/rf'

const SEVEN_DAYS_MS = 7n * 24n * 60n * 60n * 1000n

describe('demo market terms', () => {
  it('holder 95% / LP 4% / burn 1%', () => {
    expect(ADVANCE_MARKET_TERMS.holderShareBps).toBe(9_500n)
    expect(ADVANCE_MARKET_TERMS.lpSpreadBps).toBe(400n)
    expect(ADVANCE_MARKET_TERMS.rareAdvanceBurnBps).toBe(100n)
    expect(ADVANCE_MARKET_TERMS.totalDiscountBps).toBe(500n)
    expect(
      ADVANCE_MARKET_TERMS.holderShareBps +
        ADVANCE_MARKET_TERMS.lpSpreadBps +
        ADVANCE_MARKET_TERMS.rareAdvanceBurnBps,
    ).toBe(BPS_SCALE)
  })
})

describe('1,000 RF stream at the default terms', () => {
  const face = parseRF('1000')
  const quote = quoteAdvance(face, BPS_SCALE, SEVEN_DAYS_MS)

  it('user receives 950 RF', () => {
    expect(quote.youReceiveNowWei).toBe(parseRF('950'))
  })

  it('pool principal returned is 950 RF', () => {
    expect(reconcileSettlement(quote).principalWei).toBe(parseRF('950'))
  })

  it('LP spread is 40 RF', () => {
    expect(quote.lpSpreadWei).toBe(parseRF('40'))
  })

  it('Rare Advance burn is 10 RF', () => {
    expect(quote.rareAdvanceBurnWei).toBe(parseRF('10'))
  })

  it('total settlement is 1,000 RF', () => {
    expect(quote.settlementWei).toBe(parseRF('1000'))
  })

  it('the three destinations sum back to the face value exactly', () => {
    const { principalWei, lpSpreadWei, burnWei, totalWei } = reconcileSettlement(quote)
    expect(principalWei + lpSpreadWei + burnWei).toBe(face)
    expect(totalWei).toBe(face)
  })

  it('reports a 5% discount', () => {
    expect(quote.discountBps).toBe(500n)
  })
})

describe('presets 25% / 50% / 75% / MAX', () => {
  const eligible = parseRF('1000')

  it.each([
    ['25%', 2_500n, '250', '237.5', '10', '2.5'],
    ['50%', 5_000n, '500', '475', '20', '5'],
    ['75%', 7_500n, '750', '712.5', '30', '7.5'],
    ['MAX', 10_000n, '1000', '950', '40', '10'],
  ])('%s selects the right slice and settles correctly', (_label, bps, faceS, recvS, lpS, burnS) => {
    const face = selectionToWei(eligible, bps)
    expect(face).toBe(parseRF(faceS))
    const quote = quoteAdvance(face, BPS_SCALE, SEVEN_DAYS_MS)
    expect(quote.youReceiveNowWei).toBe(parseRF(recvS))
    expect(quote.lpSpreadWei).toBe(parseRF(lpS))
    expect(quote.rareAdvanceBurnWei).toBe(parseRF(burnS))
    expect(reconcileSettlement(quote).totalWei).toBe(face)
  })

  it('the four preset buttons are 25/50/75/MAX', () => {
    expect(ADVANCE_PRESETS.map((p) => p.label)).toEqual(['25%', '50%', '75%', 'MAX'])
    expect(ADVANCE_PRESETS.map((p) => p.bps)).toEqual([2_500n, 5_000n, 7_500n, 10_000n])
  })
})

describe('validation', () => {
  const eligible = parseRF('1000')

  it('rejects a negative amount', () => {
    expect(validateSelection(-1n, eligible)).toBeInstanceOf(AdvanceError)
  })

  it('rejects zero', () => {
    expect(validateSelection(0n, eligible)).toBeInstanceOf(AdvanceError)
  })

  it('rejects more than the eligible streaming amount', () => {
    expect(validateSelection(parseRF('1000.000000000000000001'), eligible)).toBeInstanceOf(AdvanceError)
  })

  it('accepts exactly the eligible amount', () => {
    expect(validateSelection(eligible, eligible)).toBeNull()
  })

  it('rejects any selection when nothing is streaming', () => {
    expect(validateSelection(parseRF('1'), 0n)).toBeInstanceOf(AdvanceError)
  })

  it('quoteAdvance refuses a negative face value', () => {
    expect(() => quoteAdvance(-1n, BPS_SCALE, SEVEN_DAYS_MS)).toThrow(AdvanceError)
  })

  it('quoteAdvance refuses a slice above 100%', () => {
    expect(() => quoteAdvance(parseRF('1000'), BPS_SCALE + 1n, SEVEN_DAYS_MS)).toThrow(AdvanceError)
  })
})

describe('rounding never creates value', () => {
  it('a spread of awkward amounts still reconciles to the face value', () => {
    const faces = ['0.000000000000000001', '0.1', '1.6875', '3.965625', '1234.567890123456789', '999999.999']
    for (const s of faces) {
      const face = parseRF(s)
      const quote = quoteAdvance(face, BPS_SCALE, SEVEN_DAYS_MS)
      const { principalWei, lpSpreadWei, burnWei } = reconcileSettlement(quote)
      expect(principalWei + lpSpreadWei + burnWei).toBe(face)
      // the holder never receives more than 95% of the face
      expect(quote.youReceiveNowWei).toBeLessThanOrEqual(face)
      // and the discount is never negative
      expect(quote.lpSpreadWei).toBeGreaterThanOrEqual(0n)
      expect(quote.rareAdvanceBurnWei).toBeGreaterThanOrEqual(0n)
    }
  })

  it('rounds down, leaving dust in the pool rather than creating value', () => {
    // 3 wei: 4% = 0.12 -> 0, 1% = 0.03 -> 0, principal = 3
    expect(splitFaceValue(3n)).toEqual({ principalWei: 3n, lpSpreadWei: 0n, burnWei: 0n })
  })
})

describe('settlement over the slice duration', () => {
  const quote = quoteAdvance(parseRF('1000'), BPS_SCALE, SEVEN_DAYS_MS)

  it('starts at zero settled', () => {
    expect(settledAt(quote, 0n)).toBe(0n)
    expect(isSettled(quote, 0n)).toBe(false)
  })

  it('streams linearly', () => {
    const half = SEVEN_DAYS_MS / 2n
    expect(settledAt(quote, half)).toBe(parseRF('500'))
  })

  it('completes exactly at the end of the duration', () => {
    expect(settledAt(quote, SEVEN_DAYS_MS)).toBe(parseRF('1000'))
    expect(remainingAt(quote, SEVEN_DAYS_MS)).toBe(0n)
    expect(isSettled(quote, SEVEN_DAYS_MS)).toBe(true)
  })

  it('never exceeds the settlement amount past the end', () => {
    expect(settledAt(quote, SEVEN_DAYS_MS * 3n)).toBe(parseRF('1000'))
    expect(isSettled(quote, SEVEN_DAYS_MS * 3n)).toBe(true)
  })

  it('reports a plausible remaining duration for a full 7-day stream', () => {
    expect(quote.durationMs).toBe(SEVEN_DAYS_MS)
  })
})

describe('simulated pool quotes', () => {
  it('discounts are expressed in basis points of the face value', () => {
    expect(SIMULATED_POOL_QUOTES.map((q) => q.discountBps)).toEqual([600n, 500n, 400n])
    for (const q of SIMULATED_POOL_QUOTES) {
      expect(q.discountBps, `${q.label} discount must be between 0 and 100%`).toBeLessThanOrEqual(BPS_SCALE)
    }
  })

  it('each pool quote pays out face value minus its own discount', () => {
    const face = parseRF('1000')
    for (const q of SIMULATED_POOL_QUOTES) {
      const quote = quoteFromSimulatedPool(face, SEVEN_DAYS_MS, q.key)!
      // holder + LP + burn always equals the face value
      const { principalWei, lpSpreadWei, burnWei } = reconcileSettlement(quote)
      expect(principalWei + lpSpreadWei + burnWei).toBe(face)
      // the holder receives exactly 100% - discount
      expect(quote.youReceiveNowWei).toBe(face - mulBps(face, q.discountBps))
      // the Rare Advance burn is always 1% of face
      expect(quote.rareAdvanceBurnWei).toBe(mulBps(face, 100n))
      // the LP spread absorbs the rest of the discount
      expect(quote.lpSpreadWei).toBe(face - quote.youReceiveNowWei - quote.rareAdvanceBurnWei)
    }
  })

  it('the standard pool quote matches the 1,000 RF worked example exactly', () => {
    const quote = quoteFromSimulatedPool(parseRF('1000'), SEVEN_DAYS_MS, 'standard')!
    expect(quote.youReceiveNowWei).toBe(parseRF('950'))
    expect(quote.lpSpreadWei).toBe(parseRF('40'))
    expect(quote.rareAdvanceBurnWei).toBe(parseRF('10'))
    expect(quote.settlementWei).toBe(parseRF('1000'))
  })

  it('competitive beats conservative', () => {
    const face = parseRF('1000')
    const conservative = quoteFromSimulatedPool(face, SEVEN_DAYS_MS, 'conservative')!
    const competitive = quoteFromSimulatedPool(face, SEVEN_DAYS_MS, 'competitive')!
    expect(competitive.youReceiveNowWei).toBeGreaterThan(conservative.youReceiveNowWei)
    expect(competitive.youReceiveNowWei).toBe(parseRF('960'))
    expect(conservative.youReceiveNowWei).toBe(parseRF('940'))
  })
})

describe('eligibility helpers', () => {
  it('selectEligible returns the whole streaming remainder as the max face', () => {
    const eligible = parseRF('1234.5')
    expect(selectEligible(eligible)).toBe(eligible)
  })

  it('selectionToWei never exceeds the eligible amount', () => {
    const eligible = parseRF('333')
    for (const bps of [2_500n, 5_000n, 7_500n, 10_000n, 12_345n]) {
      expect(selectionToWei(eligible, bps)).toBeLessThanOrEqual(eligible)
    }
  })
})
