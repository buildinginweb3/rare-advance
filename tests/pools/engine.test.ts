/**
 * COMMUNAL POOL ENGINE — the accounting invariants
 * ===================================================
 *
 * Every rule in the module docstring gets a test here.
 */

import { describe, expect, it } from 'vitest'
import {
  PoolError,
  accrue,
  canBorrow,
  canContribute,
  clonePoolWithNewTerms,
  contribute,
  createPool,
  isPositionSettled,
  lpAvailableWei,
  lpCount,
  lpDeployedWei,
  openGrowthPosition,
  openStreamPosition,
  poolCanFundGrowth,
  poolCanFundStream,
  termsAreMutable,
  updateTerms,
  updateTerms as setTerms,
  withdraw,
} from '../../src/economy/pools/engine'
import { defaultTerms, privateAccess, publicAccess } from '../../src/economy/pools/seed'
import { fundingTotal } from '../../src/economy/pools/allocate'
import type { Pool, PoolTerms } from '../../src/economy/pools/types'

/** Exact decimal -> wei. Never goes through a float. */
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

function makePool(overrides: Partial<PoolTerms> = {}, opts: { kind?: Pool['kind']; capital?: bigint } = {}): Pool {
  return createPool({
    id: 'p1',
    name: 'Test Pool',
    kind: opts.kind ?? 'both',
    creatorLpId: 'creator',
    creatorName: 'Creator',
    capitalWei: opts.capital ?? RF(100_000),
    terms: defaultTerms(overrides),
    access: publicAccess(),
    nowMs: 0,
  })
}

describe('pool creation', () => {
  it('starts with the creator as the only LP and the cash they put in', () => {
    const p = makePool()
    expect(lpCount(p)).toBe(1)
    expect(p.cashRfWei).toBe(RF(100_000))
    expect(lpAvailableWei(p, 'creator')).toBe(RF(100_000))
    expect(p.termsLocked).toBe(false)
  })

  it('refuses a pool with no capital', () => {
    expect(() =>
      createPool({
        id: 'x', name: 'x', kind: 'stream', creatorLpId: 'a', creatorName: 'A',
        capitalWei: 0n, terms: defaultTerms(), access: publicAccess(), nowMs: 0,
      }),
    ).toThrow(PoolError)
  })
})

describe('contributions', () => {
  it('adds cash and LP lifetime contribution', () => {
    let p = makePool()
    p = contribute(p, 'lp2', 'LP 2', RF(50_000))
    expect(p.cashRfWei).toBe(RF(150_000))
    expect(p.lps.lp2!.contributedWei).toBe(RF(50_000))
    expect(lpCount(p)).toBe(2)
  })

  it('locks the terms the moment another LP joins', () => {
    let p = makePool()
    p = contribute(p, 'lp2', 'LP 2', RF(50_000))
    expect(p.termsLocked).toBe(true)
    expect(termsAreMutable(p)).toBe(false)
  })

  it('does not lock when the creator tops up their own pool', () => {
    let p = makePool()
    p = contribute(p, 'creator', 'Creator', RF(10_000))
    expect(p.termsLocked).toBe(false)
    expect(termsAreMutable(p)).toBe(true)
  })

  it('refuses non-positive and closed-pool deposits', () => {
    const p = makePool()
    expect(() => contribute(p, 'lp2', 'LP 2', 0n)).toThrow()
    const closed = { ...p, status: 'winding-down' as const }
    expect(() => contribute(closed, 'lp2', 'LP 2', RF(1))).toThrow(/closed to new deposits/i)
  })
})

describe('terms lock — no bait and switch', () => {
  it('the creator may edit terms while alone', () => {
    const p = makePool()
    const next = setTerms(p, defaultTerms({ streamPremiumBps: 300n }))
    expect(next.terms.streamPremiumBps).toBe(300n)
  })

  it('after another LP contributes, terms are locked and editing throws', () => {
    let p = contribute(makePool(), 'lp2', 'LP 2', RF(1_000))
    expect(() => updateTerms(p, defaultTerms({ streamPremiumBps: 300n }))).toThrow(/TERMS LOCKED/)
  })

  it('after a position opens, terms are locked even with no external LP', () => {
    const p = openStreamPosition(makePool(), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 5n * DAY, nowMs: 0,
    })
    expect(p.termsLocked).toBe(true)
    expect(() => updateTerms(p, defaultTerms({ streamPremiumBps: 300n }))).toThrow(/TERMS LOCKED/)
  })

  it('a locked pool can only change via a clone, which starts clean', () => {
    let p = contribute(makePool(), 'lp2', 'LP 2', RF(1_000))
    const clone = clonePoolWithNewTerms(
      p, 'p2', 'you', 'You', RF(500), defaultTerms({ streamPremiumBps: 250n }), publicAccess(), 0,
    )
    expect(clone.id).toBe('p2')
    expect(clone.terms.streamPremiumBps).toBe(250n)
    expect(clone.termsLocked).toBe(false)
    expect(clone.lps.lp2).toBeUndefined()
    expect(clone.cashRfWei).toBe(RF(500))
  })
})

describe('withdrawals — available only', () => {
  it('withdraws available cash', () => {
    let p = makePool()
    p = withdraw(p, 'creator', RF(30_000))
    expect(p.cashRfWei).toBe(RF(70_000))
    expect(p.lps.creator!.withdrawnWei).toBe(RF(30_000))
  })

  it('refuses to withdraw capital deployed into an open position', () => {
    const p = openStreamPosition(makePool(), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 5n * DAY, nowMs: 0,
    })
    // principal 950 was drawn from the creator's available balance
    expect(lpDeployedWei(p, 'creator')).toBe(RF(950))
    expect(lpAvailableWei(p, 'creator')).toBe(RF(100_000) - RF(950))
    expect(() => withdraw(p, 'creator', RF(100_000))).toThrow(/at most/i)
    expect(() => withdraw(p, 'creator', RF(99_051))).toThrow(/at most/i)
    // Withdrawing everything available leaves the pool's cash at zero, because
    // the 950 RF deployed into the position is NOT withdrawable.
    const after = withdraw(p, 'creator', RF(99_050))
    expect(after.cashRfWei).toBe(0n)
    expect(lpDeployedWei(after, 'creator')).toBe(RF(950))
    expect(lpAvailableWei(after, 'creator')).toBe(0n)
  })

  it('frees capital again once the position settles', () => {
    let p = openStreamPosition(makePool(), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 5n * DAY, nowMs: 0,
    })
    p = accrue(p, 5n * DAY).pool
    expect(isPositionSettled(p.positions[0]!)).toBe(true)
    expect(lpDeployedWei(p, 'creator')).toBe(0n)
    expect(lpAvailableWei(p, 'creator')).toBe(RF(100_000))
  })
})

describe('opening a Stream Advance', () => {
  it('splits the face value into principal, premium and fee', () => {
    const p = openStreamPosition(makePool({ streamPremiumBps: 400n, rareAdvanceFeeBps: 100n }), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 5n * DAY, nowMs: 0,
    })
    const pos = p.positions[0]!
    expect(pos.kind).toBe('stream')
    if (pos.kind !== 'stream') throw new Error('unreachable')
    expect(pos.faceValueWei).toBe(RF(1000))
    expect(pos.maxLpPremiumWei).toBe(RF(40))
    expect(pos.rareAdvanceFeeWei).toBe(RF(10))
    expect(pos.principalWei).toBe(RF(950))
    expect(pos.borrowerReceivedWei).toBe(RF(950))
    // I2: the funding snapshot sums EXACTLY to the principal
    expect(fundingTotal(pos.funding)).toBe(pos.principalWei)
    // I1: the pool's cash fell by exactly the principal
    expect(p.cashRfWei).toBe(RF(100_000) - RF(950))
  })

  it('funds pro-rata across multiple LPs and freezes that split', () => {
    let p = makePool()
    p = contribute(p, 'lp2', 'LP 2', RF(100_000))
    p = openStreamPosition(p, {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(2000), termMs: 5n * DAY, nowMs: 0,
    })
    const pos = p.positions[0]!
    // creator 100k / total 200k = 50%
    expect(pos.funding.find((f) => f.lpId === 'creator')!.principalWei).toBe(RF(950))
    expect(pos.funding.find((f) => f.lpId === 'lp2')!.principalWei).toBe(RF(950))

    // a third LP joins AFTER the position opened
    p = contribute(p, 'lp3', 'LP 3', RF(500_000))
    expect(pos.funding.find((f) => f.lpId === 'lp3')).toBeUndefined()
  })

  it('refuses a Stream Advance on a growth-only pool and vice versa', () => {
    const growthOnly = makePool({}, { kind: 'growth' })
    expect(() =>
      openStreamPosition(growthOnly, { id: 'p', friendKey: 'f', borrowerLpId: 'you', faceValueWei: RF(100), termMs: DAY, nowMs: 0 }),
    ).toThrow(/only finances Friend growth/i)

    const streamOnly = makePool({}, { kind: 'stream' })
    expect(() =>
      openGrowthPosition(streamOnly, {
        id: 'p', friendKey: 'f', borrowerLpId: 'you', actionId: 'a', actionKind: 'upgrade',
        actionCostWei: RF(1000), generation: 3, ownerContributionWei: RF(250),
        protocolBurnWei: 0n, protocolRewardFundingWei: 0n,
        rfRepaymentPerDayWei: RF(1), wethPerDayWei: 0n, nowMs: 0,
      }),
    ).toThrow(/only funds Stream Advances/i)
  })

  it('refuses more than the pool can fund', () => {
    const p = makePool({ maxStreamPositionWei: RF(500) })
    expect(() =>
      openStreamPosition(p, { id: 'p', friendKey: 'f', borrowerLpId: 'you', faceValueWei: RF(600), termMs: DAY, nowMs: 0 }),
    ).toThrow(/larger than this pool's maximum/i)

    const thin = makePool({ maxStreamPositionWei: RF(100_000) }, { capital: RF(1_000) })
    expect(() =>
      openStreamPosition(thin, { id: 'p', friendKey: 'f', borrowerLpId: 'you', faceValueWei: RF(2000), termMs: DAY, nowMs: 0 }),
    ).toThrow(/available liquidity/i)
  })

  it('refuses to even create terms that leave the holder nothing', () => {
    // premium + fee together may never consume the whole face value
    expect(() => makePool({ streamPremiumBps: 10_000n, rareAdvanceFeeBps: 100n })).toThrow(
      /leave the holder something/i,
    )
    // a punitive premium on its own is allowed: the market rejects it, not the app
    expect(() => makePool({ streamPremiumBps: 9_900n, rareAdvanceFeeBps: 0n })).not.toThrow()
    expect(() => makePool({ maxAdvanceShareBps: 0n })).toThrow(/maximum advance/i)
  })
})

describe('opening Growth financing', () => {
  const growth = (over: Partial<PoolTerms> = {}, capital?: bigint) =>
    makePool({ growthMaxFinanceBps: 7_500n, growthPremiumBps: 500n, ...over }, { kind: 'growth', capital })

  const open = (p: Pool, over: Partial<Parameters<typeof openGrowthPosition>[1]> = {}) =>
    openGrowthPosition(p, {
      id: 'pos1', friendKey: 'Generations:1773', borrowerLpId: 'you',
      actionId: 'a1', actionKind: 'upgrade', actionCostWei: RF(10_000), generation: 3,
      ownerContributionWei: RF(2_500),
      protocolBurnWei: RF(5_000), protocolRewardFundingWei: RF(5_000),
      rfRepaymentPerDayWei: RF(100), wethPerDayWei: 0n, nowMs: 0, ...over,
    })

  it('finances the action and sets a repayment target of principal plus premium', () => {
    const pos = open(growth()).positions[0]!
    expect(pos.kind).toBe('growth')
    if (pos.kind !== 'growth') throw new Error('unreachable')
    expect(pos.principalWei).toBe(RF(7_500))
    expect(pos.maxLpPremiumWei).toBe(RF(375))
    expect(pos.repaymentTargetWei).toBe(RF(7_875))
    expect(fundingTotal(pos.funding)).toBe(pos.principalWei)
  })

  it('keeps the underlying protocol burn and funding separate from Rare Advance terms', () => {
    const pos = open(growth()).positions[0]!
    if (pos.kind !== 'growth') throw new Error('unreachable')
    expect(pos.protocolBurnWei).toBe(RF(5_000))
    expect(pos.protocolRewardFundingWei).toBe(RF(5_000))
    // Neither equals the LP premium, which is a different quantity.
    expect(pos.maxLpPremiumWei).not.toBe(pos.protocolBurnWei)
  })

  it('a pool with no financing cap funds the whole action cost', () => {
    const q = growth({ growthMaxFinanceBps: 10_000n })
    const pos = open(q, { ownerContributionWei: 0n }).positions[0]!
    if (pos.kind !== 'growth') throw new Error('unreachable')
    // the borrower contributed nothing, so the pool covers all 10,000 RF
    expect(pos.principalWei).toBe(RF(10_000))
    expect(pos.ownerContributionWei).toBe(0n)
  })

  it('still refuses to finance nothing at all', () => {
    const p = growth({ growthMaxFinanceBps: 10_000n })
    expect(() => open(p, { ownerContributionWei: RF(10_000) })).toThrow(/nothing left to finance/i)
  })

  it('enforces eligible actions', () => {
    const p = growth({ eligibleActions: ['hardwire'] })
    expect(() => open(p, { actionKind: 'upgrade' })).toThrow(/does not finance that action/i)
    expect(open(p, { actionKind: 'hardwire' }).positions[0]).toBeTruthy()
  })

  it('enforces generation eligibility when set', () => {
    const p = growth({ eligibleGenerations: [1, 2] })
    expect(() => open(p, { generation: 3 })).toThrow(/does not finance that generation/i)
    expect(open(p, { generation: 2 }).positions[0]).toBeTruthy()
  })

  it('refuses to finance more than the pool has available', () => {
    const p = growth({}, RF(1_000))
    expect(() => open(p, { actionCostWei: RF(10_000) })).toThrow(/available liquidity/i)
  })

  it('allows a 100% WETH share, and still refuses to stack two of them', () => {
    let p = open(growth({ growthWethShareBps: 10_000n }), { actionKind: 'hardwire' })
    expect(p.positions).toHaveLength(1)
    // a second concurrent position would take more than the whole stream
    expect(() => open(p, { actionKind: 'hardwire' })).toThrow(/weth share would exceed/i)
  })

  it('two half shares may together take the whole stream, but not more', () => {
    let p = open(growth({ growthWethShareBps: 5_000n }), { actionKind: 'hardwire' })
    p = open(p, { actionKind: 'hardwire', id: 'pos2' })
    expect(p.positions).toHaveLength(2)
    // a third would exceed the cap
    expect(() => open(p, { actionKind: 'hardwire', id: 'pos3' })).toThrow(/weth share would exceed/i)
  })
})

describe('access control', () => {
  it('a public pool is visible and usable by anyone', () => {
    const p = makePool()
    expect(canContribute(p, 'stranger')).toBe(true)
    expect(canBorrow(p, 'stranger')).toBe(true)
  })

  it('a private pool is not publicly usable', () => {
    const p = { ...makePool(), access: privateAccess() }
    expect(canContribute(p, 'stranger')).toBe(false)
    expect(canBorrow(p, 'stranger')).toBe(false)
  })

  it('the private creator always has access', () => {
    const p: Pool = { ...makePool(), access: privateAccess() }
    expect(canContribute(p, 'creator')).toBe(true)
    expect(canBorrow(p, 'creator')).toBe(true)
  })

  it('an invite code grants access', () => {
    const p = { ...makePool(), access: privateAccess() }
    expect(canContribute(p, 'stranger', 'FRIENDS')).toBe(true)
    expect(canContribute(p, 'stranger', 'WRONG')).toBe(false)
  })

  it('a creator-only private pool refuses every other LP, even invited', () => {
    const p = { ...makePool(), access: { ...privateAccess(), privateLiquidityAccess: 'creator-only' as const } }
    expect(canContribute(p, 'stranger')).toBe(false)
    expect(canContribute(p, 'stranger', 'FRIENDS')).toBe(false)
    expect(canContribute(p, 'creator')).toBe(true)
  })

  it('anyone-with-link lets a borrower in with the code even if not allowlisted', () => {
    const p = {
      ...makePool(),
      access: { ...privateAccess(), privateBorrowerAccess: 'anyone-with-link' as const },
    }
    expect(canBorrow(p, 'stranger', 'FRIENDS')).toBe(true)
    // but funding still follows the liquidity rule
    expect(canContribute(p, 'stranger', 'FRIENDS')).toBe(true)
    const strict = { ...p, access: { ...p.access, privateLiquidityAccess: 'creator-only' as const } }
    expect(canContribute(strict, 'stranger', 'FRIENDS')).toBe(false)
  })

  it('an allowlisted LP can contribute to a private pool', () => {
    const p = { ...makePool(), access: { ...privateAccess(), allowlistedLps: ['friend'] } }
    expect(canContribute(p, 'friend')).toBe(true)
    expect(canContribute(p, 'other')).toBe(false)
  })
})

describe('eligibility helpers', () => {
  it('poolCanFundStream respects kind, size and liquidity', () => {
    const p = makePool({ maxStreamPositionWei: RF(1000) })
    expect(poolCanFundStream(p, 'you', RF(900))).toBe(true)
    expect(poolCanFundStream(p, 'you', RF(1100))).toBe(false)
    const thin = makePool({}, { capital: RF(100) })
    expect(poolCanFundStream(thin, 'you', RF(1000))).toBe(false)
    const growthOnly = makePool({}, { kind: 'growth' })
    expect(poolCanFundStream(growthOnly, 'you', RF(1000))).toBe(false)
  })

  it('poolCanFundGrowth respects kind, actions and liquidity', () => {
    const p = makePool({ growthMaxFinanceBps: 7_500n }, { kind: 'growth' })
    expect(poolCanFundGrowth(p, 'you', { kind: 'upgrade', costWei: RF(10_000), generation: 3 })).toBe(true)
    expect(poolCanFundGrowth(p, 'you', { kind: 'upgrade', costWei: RF(10_000), generation: 1 })).toBe(true)
    expect(
      poolCanFundGrowth(p, 'you', { kind: 'promote', costWei: RF(10_000), generation: 3 }, null),
    ).toBe(true)
    const noUpgrade = makePool({ eligibleActions: ['hardwire'] }, { kind: 'growth' })
    expect(poolCanFundGrowth(noUpgrade, 'you', { kind: 'upgrade', costWei: RF(1000), generation: 3 })).toBe(false)
  })
})
