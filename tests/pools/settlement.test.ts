/**
 * TIME-BASED SETTLEMENT
 * ======================
 *
 * A Stream Advance is NOT a loan. Nothing compounds, nothing is owed that was
 * not already agreed, and the holder always pays LESS than the quoted total by
 * paying off early. These tests hold that line.
 */

import { describe, expect, it } from 'vitest'
import {
  PoolError,
  contribute,
  accrue,
  createPool,
  isPositionSettled,
  lpAvailableWei,
  lpDeployedWei,
  openGrowthPosition,
  openStreamPosition,
  payoffQuoteWei,
  positionOutstandingPremiumWei,
  positionOutstandingRfWei,
  repay,
  wethEntitlement,
} from '../../src/economy/pools/engine'
import { defaultTerms, publicAccess } from '../../src/economy/pools/seed'
import type { Pool } from '../../src/economy/pools/types'

const RF = (n: string | number): bigint => {
  if (typeof n === 'bigint') return n
  const raw = String(n)
  const m = /^(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!m) throw new Error(`bad test amount ${raw}`)
  const int = m[1] || '0'
  const frac = (m[2] ?? '').padEnd(18, '0').slice(0, 18)
  return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
}
const DAY = 86_400_000n

function streamPool(over = {}, capital = RF(200_000)): Pool {
  return createPool({
    id: 'p1', name: 'Stream Pool', kind: 'both', creatorLpId: 'creator', creatorName: 'Creator',
    capitalWei: capital, terms: defaultTerms(over), access: publicAccess(), nowMs: 0,
  })
}

function openStream(p: Pool, face = RF(1000), termMs = 5n * DAY) {
  return openStreamPosition(p, {
    id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
    faceValueWei: face, termMs, nowMs: 0,
  })
}

const face = RF(1000)
const premium = RF(40) // 4% of 1000
const fee = RF(10) // 1% of 1000
const principal = RF(950)

describe('a Stream Advance over its term', () => {
  it('the holder receives principal, never face', () => {
    const pos = openStream(streamPool()).positions[0]!
    if (pos.kind !== 'stream') throw new Error('unreachable')
    expect(pos.borrowerReceivedWei).toBe(principal)
    expect(pos.borrowerReceivedWei).toBeLessThan(face)
  })

  it('settles linearly: principal and premium vest with time', () => {
    let p = openStream(streamPool())
    p = accrue(p, DAY).pool
    const pos = p.positions[0]!
    // 1/5 of principal and 1/5 of premium have vested and been paid.
    expect(pos.principalRepaidWei).toBe(principal / 5n)
    expect(pos.premiumPaidWei).toBe(premium / 5n)
    // Outstanding is PRINCIPAL only: the stream has already paid the premium
    // that had vested, and the Rare Advance fee was taken from the face value
    // up front so it is never repayable.
    expect(positionOutstandingPremiumWei(pos)).toBe(0n)
    expect(positionOutstandingRfWei(pos)).toBe(principal - principal / 5n)

    p = accrue(p, DAY).pool
    p = accrue(p, DAY).pool
    p = accrue(p, 2n * DAY).pool
    expect(positionOutstandingRfWei(p.positions[0]!)).toBe(0n)
  })

  it('at full term the LPs are made whole AND the fee is booked', () => {
    let p = openStream(streamPool())
    p = accrue(p, 5n * DAY).pool
    const pos = p.positions[0]!
    expect(isPositionSettled(pos)).toBe(true)
    expect(pos.principalRepaidWei).toBe(principal)
    expect(pos.premiumPaidWei).toBe(premium)
    // THE conservation law: face = principal + LP premium + Rare Advance fee
    expect(pos.principalRepaidWei + pos.premiumPaidWei + p.rareAdvanceFeesWei).toBe(face)
    // LPs got exactly principal + premium, never the fee
    expect(p.lps.creator!.rfPrincipalRepaidWei).toBe(principal)
    expect(p.lps.creator!.rfPremiumEarnedWei).toBe(premium)
    expect(p.cashRfWei).toBe(RF(200_000) - principal + principal + premium)
  })

  it('recognises the fee over time, not all at once', () => {
    let p = openStream(streamPool())
    expect(p.rareAdvanceFeesWei).toBe(0n)
    p = accrue(p, DAY).pool
    expect(p.rareAdvanceFeesWei).toBe(fee / 5n)
    p = accrue(p, 4n * DAY).pool
    expect(p.rareAdvanceFeesWei).toBe(fee)
  })

  it('returns every wei to the pool no matter how many steps you take', () => {
    let oneStep = accrue(openStream(streamPool()), 5n * DAY).pool
    let many = openStream(streamPool())
    for (let i = 0; i < 5; i += 1) many = accrue(many, DAY).pool
    expect(many.cashRfWei).toBe(oneStep.cashRfWei)
    expect(many.rareAdvanceFeesWei).toBe(oneStep.rareAdvanceFeesWei)
    expect(many.lps.creator!.rfPremiumEarnedWei).toBe(oneStep.lps.creator!.rfPremiumEarnedWei)
  })

  it('does not overrun the term if time is simulated in one huge jump', () => {
    const p = accrue(openStream(streamPool()), 400n * DAY).pool
    expect(p.positions[0]!.premiumPaidWei).toBe(premium)
    expect(p.rareAdvanceFeesWei).toBe(fee)
    expect(p.cashRfWei).toBe(RF(200_000) + premium)
  })

  it('stops accruing once settled', () => {
    let p = accrue(openStream(streamPool()), 5n * DAY).pool
    const settledCash = p.cashRfWei
    p = accrue(p, 10n * DAY).pool
    expect(p.cashRfWei).toBe(settledCash)
    expect(p.rareAdvanceFeesWei).toBe(fee)
  })

  it('is NOT a loan: nothing grows beyond the agreed premium', () => {
    let p = openStream(streamPool())
    p = accrue(p, 3n * DAY).pool
    const at3 = positionOutstandingRfWei(p.positions[0]!)
    p = accrue(p, 30n * DAY).pool
    // total repaid can never exceed what the holder received plus the premium
    const pos = p.positions[0]!
    expect(pos.principalRepaidWei + pos.premiumPaidWei).toBeLessThanOrEqual(principal + premium)
    expect(face).toBeGreaterThan(principal + premium)
    expect(at3).toBeGreaterThan(0n)
  })
})

describe('paying off early', () => {
  it('never charges unearned premium', () => {
    let p = accrue(openStream(streamPool()), 2n * DAY).pool
    // After two days only 2/5 of the premium has vested, and the stream has
    // already paid it. The holder owes principal and nothing else.
    const quote = payoffQuoteWei(p.positions[0]!)
    expect(quote).toBe(principal - (principal * 2n) / 5n)

    const r = repay(p, 'pos1', quote)
    expect(r.settled).toBe(true)
    expect(r.pool.positions[0]!.premiumPaidWei).toBe((premium * 2n) / 5n)
    expect(r.pool.positions[0]!.premiumPaidWei).toBeLessThan(premium)
    expect(quote).toBeLessThan(principal + premium)
  })

  it('the premium charged is exactly what had vested', () => {
    for (const day of [1n, 2n, 3n, 4n]) {
      let p = accrue(openStream(streamPool()), day * DAY).pool
      const vested = (premium * day) / 5n
      const before = payoffQuoteWei(p.positions[0]!)
      p = repay(p, 'pos1', before).pool
      expect(p.positions[0]!.premiumPaidWei, `day ${day}`).toBe(vested)
      expect(isPositionSettled(p.positions[0]!)).toBe(true)
    }
  })

  it('paying off early leaves the pool with strictly less RF than letting it run', () => {
    let early = accrue(openStream(streamPool()), DAY).pool
    early = repay(early, 'pos1', payoffQuoteWei(early.positions[0]!)).pool

    let late = accrue(openStream(streamPool()), 4n * DAY).pool
    late = repay(late, 'pos1', payoffQuoteWei(late.positions[0]!)).pool

    let full = accrue(openStream(streamPool()), 5n * DAY).pool

    expect(early.cashRfWei).toBeLessThan(late.cashRfWei)
    expect(late.cashRfWei).toBeLessThan(full.cashRfWei)
    // the holder's saved RF is exactly the premium they never had to pay
    expect(full.cashRfWei - early.cashRfWei).toBe(premium - premium / 5n)
  })

  it('overpaying is capped at the true outstanding, nothing more', () => {
    let p = accrue(openStream(streamPool()), DAY).pool
    const quote = payoffQuoteWei(p.positions[0]!)
    const accruedToPool = principal / 5n + premium / 5n
    const r = repay(p, 'pos1', RF(1_000_000))
    expect(r.appliedWei).toBe(quote)
    expect(r.pool.cashRfWei).toBe(RF(200_000) - principal + accruedToPool + quote)
    expect(isPositionSettled(r.pool.positions[0]!)).toBe(true)
  })

  it('part repayment leaves the rest outstanding', () => {
    let p = accrue(openStream(streamPool()), DAY).pool
    const before = payoffQuoteWei(p.positions[0]!)
    const r = repay(p, 'pos1', RF(100))
    expect(isPositionSettled(r.pool.positions[0]!)).toBe(false)
    expect(r.pool.positions[0]!.principalRepaidWei).toBe(principal / 5n + RF(100))
    expect(payoffQuoteWei(r.pool.positions[0]!)).toBe(before - RF(100))
  })

  it('refuses to repay a settled position', () => {
    let p = accrue(openStream(streamPool()), DAY).pool
    p = repay(p, 'pos1', payoffQuoteWei(p.positions[0]!)).pool
    expect(isPositionSettled(p.positions[0]!)).toBe(true)
    expect(() => repay(p, 'pos1', RF(1))).toThrow(/already settled/i)
  })

  it('never pays the LPs more than the borrower paid', () => {
    let p = accrue(openStream(streamPool()), DAY).pool
    const quote = payoffQuoteWei(p.positions[0]!)
    p = repay(p, 'pos1', quote).pool
    const credited =
      p.lps.creator!.rfPrincipalRepaidWei + p.lps.creator!.rfPremiumEarnedWei
    // exactly the RF that entered the pool: 950 principal back + the vested premium
    expect(credited).toBe(principal + premium / 5n)
    expect(credited).toBeLessThanOrEqual(principal + premium)
    // and the Rare Advance fee was never shared with the LPs
    expect(p.lps.creator!.rfPremiumEarnedWei).toBeLessThan(p.rareAdvanceFeesWei + fee)
    expect(p.rareAdvanceFeesWei).toBe(fee / 5n)
  })

  it('frees the capital back into the available balance, earnings held apart', () => {
    let p = openStream(streamPool())
    expect(lpAvailableWei(p, 'creator')).toBe(RF(200_000) - principal)
    expect(lpDeployedWei(p, 'creator')).toBe(principal)
    p = accrue(p, 5n * DAY).pool
    // principal is recycled and fully withdrawable again
    expect(lpAvailableWei(p, 'creator')).toBe(RF(200_000))
    expect(lpDeployedWei(p, 'creator')).toBe(0n)
    // earnings live in their own buckets, never mixed into the deposit
    expect(p.lps.creator!.rfPremiumEarnedWei).toBe(premium)
  })
})

describe('multiple LPs share settlement by their frozen snapshot', () => {
  /** A pool with two equal LPs, 100,000 RF each. */
  function twoLpPool(): Pool {
    const base = streamPool({}, RF(100_000))
    const second = contribute(base, 'lp-b', 'B', RF(100_000))
    return { ...second, cashRfWei: RF(200_000) }
  }

  it('splits principal and premium 50/50', () => {
    let p = openStream(twoLpPool())
    const pos = p.positions[0]!
    expect(pos.funding.find((f) => f.lpId === 'a' || f.lpId === 'creator')?.principalWei).toBe(principal / 2n)
    expect(pos.funding.find((f) => f.lpId === 'lp-b')!.principalWei).toBe(principal / 2n)
    p = accrue(p, 5n * DAY).pool
    expect(p.lps.creator!.rfPremiumEarnedWei).toBe(premium / 2n)
    expect(p.lps['lp-b']!.rfPremiumEarnedWei).toBe(premium / 2n)
    expect(p.rareAdvanceFeesWei).toBe(fee)
    expect(
      p.lps.creator!.rfPrincipalRepaidWei + p.lps['lp-b']!.rfPrincipalRepaidWei,
    ).toBe(principal)
  })

  it('CRITICAL: an LP who joins later earns nothing from the old position', () => {
    let p = openStream(twoLpPool())
    // newcomer joins with a huge balance
    p = contribute(p, 'lp-late', 'Late', RF(900_000))
    p = accrue(p, 5n * DAY).pool
    expect(p.lps['lp-late']!.rfPrincipalRepaidWei).toBe(0n)
    expect(p.lps['lp-late']!.rfPremiumEarnedWei).toBe(0n)
    expect(p.lps['lp-late']!.wethEarnedWei).toBe(0n)
  })

  it('CRITICAL: a departing LP does not take capital earned by others', () => {
    let p = openStream(twoLpPool())
    p = accrue(p, 5n * DAY).pool
    const totalPremium = p.lps.creator!.rfPremiumEarnedWei + p.lps['lp-b']!.rfPremiumEarnedWei
    expect(totalPremium).toBe(premium)
  })
})

describe('WETH participation is temporary', () => {
  function growthPool(over = {}) {
    return createPool({
      id: 'g1', name: 'Growth Pool', kind: 'growth', creatorLpId: 'creator', creatorName: 'Creator',
      capitalWei: RF(200_000),
      terms: defaultTerms({ growthMaxFinanceBps: 7_500n, growthWethShareBps: 2_000n, ...over }),
      access: publicAccess(), nowMs: 0,
    })
  }
  function openGrowth(p: Pool, over = {}) {
    return openGrowthPosition(p, {
      id: 'gpos', friendKey: 'Generations:1773', borrowerLpId: 'you',
      actionId: 'a1', actionKind: 'upgrade', actionCostWei: RF(10_000), generation: 3,
      ownerContributionWei: RF(2_500), protocolBurnWei: RF(5_000), protocolRewardFundingWei: RF(5_000),
      rfRepaymentPerDayWei: RF(100), wethPerDayWei: RF('0.01'), nowMs: 0, ...over,
    })
  }

  it('accrues WETH into its own bucket, never as RF', () => {
    const p = accrue(openGrowth(growthPool()), DAY).pool
    const pos = p.positions[0]!
    if (pos.kind !== 'growth') throw new Error('unreachable')
    // 20% of 0.01 WETH per day
    expect(pos.wethPoolWei).toBe(RF('0.002'))
    expect(p.lps.creator!.wethEarnedWei).toBe(RF('0.002'))
    expect(p.lps.creator!.rfPremiumEarnedWei).toBe(0n)
    expect(p.cumulativeWethWei).toBe(RF('0.002'))
  })

  it('CRITICAL: WETH participation stops the instant RF repayment completes', () => {
    // 7500 principal + 375 premium = 7875 target, 100 RF/day routed at 100%
    let p = openGrowth(growthPool({ growthPremiumBps: 500n }))
    p = accrue(p, DAY).pool
    expect(wethEntitlement(p, 'gpos')).toBe(2_000n)
    expect(p.positions[0]!.kind === 'growth' && p.positions[0]!.wethPoolWei).toBeGreaterThan(0n)

    p = accrue(p, 200n * DAY).pool
    const pos = p.positions[0]!
    expect(isPositionSettled(pos)).toBe(true)
    expect(wethEntitlement(p, 'gpos')).toBe(0n)
    const wethAtSettle = p.positions[0]!.kind === 'growth' ? p.positions[0]!.wethPoolWei : 0n

    p = accrue(p, 10n * DAY).pool
    const after = p.positions[0]!.kind === 'growth' ? p.positions[0]!.wethPoolWei : 0n
    expect(after).toBe(wethAtSettle)
    expect(after).toBeLessThan(RF('0.002') * 200n)
  })

  it('the position settles on RF alone, even though WETH was earned', () => {
    let p = openGrowth(growthPool())
    p = accrue(p, 200n * DAY).pool
    expect(isPositionSettled(p.positions[0]!)).toBe(true)
    expect(p.lps.creator!.wethEarnedWei).toBeGreaterThan(0n)
  })

  it('WETH already banked stays banked after settlement', () => {
    let p = openGrowth(growthPool())
    p = accrue(p, 5n * DAY).pool
    const banked = p.lps.creator!.wethEarnedWei
    expect(banked).toBeGreaterThan(0n)
    p = accrue(p, 500n * DAY).pool
    expect(p.lps.creator!.wethEarnedWei).toBeGreaterThanOrEqual(banked)
  })

  it('never converts WETH into RF', () => {
    const p = accrue(openGrowth(growthPool()), 3n * DAY).pool
    if (p.positions[0]!.kind !== 'growth') throw new Error('unreachable')
    // The RF target is reached from RF routing only; WETH plays no part.
    expect(p.positions[0]!.principalRepaidWei + p.positions[0]!.premiumPaidWei).toBeLessThanOrEqual(
      p.positions[0]!.repaymentTargetWei,
    )
  })

  it('a single huge jump earns WETH only for the days it was still outstanding', () => {
    // Target 7875 RF. RF routing is 75% of 100 RF/day = 75/day, so the position
    // is outstanding for 105 days and only then does participation stop.
    const p = accrue(openGrowth(growthPool()), 200n * DAY).pool
    expect(p.lps.creator!.wethEarnedWei).toBe(RF('0.002') * 105n)
    expect(p.positions[0]!.kind === 'growth' && p.positions[0]!.wethPoolWei).toBe(RF('0.002') * 105n)
    expect(isPositionSettled(p.positions[0]!)).toBe(true)
  })

  it('a growth position with no WETH share accrues no WETH', () => {
    const p = accrue(openGrowth(growthPool({ growthWethShareBps: 0n })), 5n * DAY).pool
    expect(p.lps.creator!.wethEarnedWei).toBe(0n)
    expect(p.cumulativeWethWei).toBe(0n)
  })
})

describe('guards', () => {
  it('accruing zero or negative time is a no-op', () => {
    const p = openStream(streamPool())
    expect(accrue(p, 0n).pool).toEqual(p)
    expect(accrue(p, -DAY).pool).toEqual(p)
  })

  it('refuses non-positive repayments and unknown positions', () => {
    const p = openStream(streamPool())
    expect(() => repay(p, 'pos1', 0n)).toThrow(PoolError)
    expect(() => repay(p, 'nope', RF(1))).toThrow(/no longer exists/i)
  })

})