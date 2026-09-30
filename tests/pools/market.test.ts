/**
 * THE MARKET
 * ==========
 *
 * Communal liquidity only works if the market is honest: every eligible pool is
 * shown, the comparison is factual, and nothing is ranked into a single answer.
 */

import { describe, expect, it } from 'vitest'
import { accrue, createPool, openStreamPosition } from '../../src/economy/pools/engine'
import { defaultTerms, privateAccess, publicAccess } from '../../src/economy/pools/seed'
import { growthOffers, marketSummary, streamOffers, visiblePools } from '../../src/economy/pools/market'
import type { Pool, PoolKind, PoolTerms } from '../../src/economy/pools/types'

const RF = (n: string | number): bigint => {
  if (typeof n === 'bigint') return n
  const raw = String(n)
  const m = /^(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!m) throw new Error(`bad test amount ${raw}`)
  return BigInt(m[1] || '0') * 10n ** 18n + BigInt(((m[2] ?? '').padEnd(18, '0').slice(0, 18)) || '0')
}
const DAY = 86_400_000n

/** A private pool the local user has NOT been invited to. */
const strangerAccess = () => ({ ...privateAccess(), allowlistedLps: [] })

const mul = (wei: bigint, bps: bigint) => (wei * bps) / 10_000n

function mk(
  id: string,
  over: Partial<PoolTerms> = {},
  opts: { kind?: PoolKind; capital?: bigint; access?: ReturnType<typeof publicAccess> } = {},
): Pool {
  return createPool({
    id,
    name: `Pool ${id}`,
    kind: opts.kind ?? 'both',
    creatorLpId: `lp-${id}`,
    creatorName: `LP ${id}`,
    capitalWei: opts.capital ?? RF(1_000_000),
    terms: defaultTerms(over),
    access: opts.access ?? publicAccess(),
    nowMs: 0,
  })
}

const streamReq = {
  friendKey: 'Genesis:1',
  eligibleStreamingWei: RF(1000),
  termMs: 5n * DAY,
  borrowerLpId: 'you' as const,
}

describe('streamOffers', () => {
  it('shows every eligible pool, not a winner', () => {
    const pools = [mk('a'), mk('b'), mk('c')]
    expect(streamOffers(pools, streamReq)).toHaveLength(3)
  })

  it('ranks by what the holder actually receives now', () => {
    const pools = [
      mk('expensive', { streamPremiumBps: 800n, rareAdvanceFeeBps: 200n }),
      mk('cheap', { streamPremiumBps: 100n, rareAdvanceFeeBps: 0n }),
      mk('mid', { streamPremiumBps: 400n, rareAdvanceFeeBps: 100n }),
    ]
    const offers = streamOffers(pools, streamReq)
    expect(offers.map((o) => o.poolId)).toEqual(['cheap', 'mid', 'expensive'])
    expect(offers[0]!.youGetNowWei).toBe(RF(990))
  })

  it('the arithmetic on each offer is exact', () => {
    const [offer] = streamOffers([mk('a', { streamPremiumBps: 400n, rareAdvanceFeeBps: 100n })], streamReq)
    expect(offer!.youGetNowWei + offer!.lpPremiumWei + offer!.rareAdvanceFeeWei).toBe(RF(1000))
    expect(offer!.maxCostWei).toBe(offer!.lpPremiumWei + offer!.rareAdvanceFeeWei)
    expect(offer!.settlementWei).toBe(RF(1000))
    // the holder receives strictly less than face: this is not free money
    expect(offer!.youGetNowWei).toBeLessThan(offer!.settlementWei)
  })

  it('excludes growth-only pools and pools with too little cash', () => {
    expect(streamOffers([mk('g', {}, { kind: 'growth' })], streamReq)).toHaveLength(0)
    expect(streamOffers([mk('thin', {}, { capital: RF(10) })], streamReq)).toHaveLength(0)
  })

  it('excludes pools whose maximum position is smaller than the request', () => {
    expect(streamOffers([mk('small', { maxStreamPositionWei: RF(500) })], streamReq)).toHaveLength(0)
    expect(
      streamOffers([mk('big', { maxStreamPositionWei: RF(5000) })], streamReq),
    ).toHaveLength(1)
  })

  it('hides a private pool from a borrower with no access', () => {
    const priv = mk('priv', {}, { access: strangerAccess() })
    expect(streamOffers([priv], streamReq)).toHaveLength(0)
    expect(streamOffers([priv], { ...streamReq, inviteCode: 'FRIENDS' })).toHaveLength(1)
  })

  it('marks private pools so the UI can label them', () => {
    const offers = streamOffers([mk('priv', {}, { access: strangerAccess() })], {
      ...streamReq,
      inviteCode: 'FRIENDS',
    })
    expect(offers[0]!.privatePool).toBe(true)
    expect(streamOffers([mk('pub')], streamReq)[0]!.privatePool).toBe(false)
  })

  it('is deterministic regardless of pool order', () => {
    const a = streamOffers([mk('a'), mk('b'), mk('c')], streamReq).map((o) => o.poolId)
    const b = streamOffers([mk('c'), mk('b'), mk('a')], streamReq).map((o) => o.poolId)
    expect(a).toEqual(b)
  })
})

describe('growthOffers — factual comparison, never a single best', () => {
  const req = {
    friendKey: 'Generations:1773',
    actionKind: 'upgrade' as const,
    actionCostWei: RF(10_000),
    ownerContributionWei: RF(2_500),
    generation: 3,
    borrowerLpId: 'you' as const,
    modeledWethForFriendWei: RF(1),
  }

  it('compares every eligible pool', () => {
    const pools = [mk('a', {}, { kind: 'growth' }), mk('b', {}, { kind: 'growth' }), mk('c', {}, { kind: 'growth' })]
    expect(growthOffers(pools, req)).toHaveLength(3)
  })

  it('quotes the borrower’s ACTUAL upfront, so the estimate matches the booking', () => {
    const [offer] = growthOffers([mk('a', {}, { kind: 'growth' })], req)
    expect(offer!.youPayTodayWei).toBe(RF(2_500))
    expect(offer!.poolFinancesWei).toBe(RF(7_500))
    expect(offer!.youPayTodayWei + offer!.poolFinancesWei).toBe(RF(10_000))
    expect(offer!.repaymentTargetWei).toBe(RF(7_500) + offer!.lpPremiumWei)
  })

  it('re-quotes when the borrower chooses a bigger upfront', () => {
    const pool = mk('a', {}, { kind: 'growth' })
    const [small] = growthOffers([pool], req)
    const [big] = growthOffers([pool], { ...req, ownerContributionWei: RF(6_000) })
    expect(big!.poolFinancesWei).toBeLessThan(small!.poolFinancesWei)
    expect(big!.youPayTodayWei).toBe(RF(6_000))
    expect(big!.lpPremiumWei).toBeLessThan(small!.lpPremiumWei)
  })

  it('drops pools that cannot finance the chosen split', () => {
    // 50% maximum financing: a borrower putting in 60% leaves 4000 to finance, fine
    expect(
      growthOffers([mk('a', { growthMaxFinanceBps: 5_000n }, { kind: 'growth' })], {
        ...req,
        ownerContributionWei: RF(6_000),
      }),
    ).toHaveLength(1)
    // the same pool cannot finance the 2500-upfront split, which needs 7500
    expect(
      growthOffers([mk('a', { growthMaxFinanceBps: 5_000n }, { kind: 'growth' })], req),
    ).toHaveLength(0)
  })

  it('drops pools that cannot finance anything at all', () => {
    expect(
      growthOffers([mk('a', {}, { kind: 'growth' })], { ...req, ownerContributionWei: RF(10_000) }),
    ).toHaveLength(0)
  })

  it('badges are FACTUAL, and a pool can hold several', () => {
    const pools = [
      mk('cheap', { growthPremiumBps: 100n, growthWethShareBps: 0n }, { kind: 'growth', capital: RF(9_000_000) }),
      mk('plain', { growthPremiumBps: 800n, growthWethShareBps: 1_000n }, { kind: 'growth' }),
    ]
    const offers = growthOffers(pools, req)
    const cheap = offers.find((o) => o.poolId === 'cheap')!
    expect(cheap.badges).toContain('LOWEST RF PREMIUM')
    expect(cheap.badges).toContain('MOST LIQUIDITY')
    expect(cheap.badges).toContain('LOWEST WETH SHARE')
    expect(offers.find((o) => o.poolId === 'plain')!.badges).not.toContain('LOWEST RF PREMIUM')
  })

  it('no offer is ever labelled as the best or recommended', () => {
    const offers = growthOffers(
      [mk('a', {}, { kind: 'growth' }), mk('b', {}, { kind: 'growth' })],
      req,
    )
    for (const o of offers) {
      expect(o.badges.join(' ')).not.toMatch(/best|recommend|cheapest overall|winner/i)
    }
  })

  it('separates WETH from RF: the Friend keeps the difference', () => {
    const [offer] = growthOffers(
      [mk('a', { growthWethShareBps: 2_000n }, { kind: 'growth' })],
      { ...req, modeledWethForFriendWei: RF(1) },
    )
    expect(offer!.modeledWethToPoolWei + offer!.modeledWethToOwnerWei).toBe(RF(1))
    expect(offer!.modeledWethToPoolWei).toBe(RF('0.2'))
  })

  it('keeps the underlying protocol burn separate from Rare Advance terms', () => {
    const [offer] = growthOffers([mk('a', {}, { kind: 'growth' })], req)
    // the offer speaks only in RF premium and WETH share; the protocol's own
    // burn and reward funding are never folded into the Rare Advance premium
    expect(offer!.lpPremiumWei).toBe(mul(offer!.poolFinancesWei, offer!.growthPremiumBps))
    expect(offer!.repaymentTargetWei).toBe(RF(7_500) + offer!.lpPremiumWei)
    expect(offer!.repaymentTargetWei).toBeLessThan(RF(10_000))
  })

  it('excludes pools that do not finance that action or generation', () => {
    expect(
      growthOffers([mk('a', { eligibleActions: ['hardwire'] }, { kind: 'growth' })], req),
    ).toHaveLength(0)
    expect(
      growthOffers([mk('a', { eligibleGenerations: [1, 2] }, { kind: 'growth' })], req),
    ).toHaveLength(0)
    expect(
      growthOffers([mk('a', { eligibleGenerations: [1, 2, 3] }, { kind: 'growth' })], req),
    ).toHaveLength(1)
  })
})


describe('visiblePools', () => {
  it('shows public pools to everyone and private pools only with access', () => {
    const pools = [mk('pub'), mk('priv', {}, { access: strangerAccess() })]
    expect(visiblePools(pools, 'you').map((p) => p.id)).toEqual(['pub'])
    expect(visiblePools(pools, 'you', 'FRIENDS').map((p) => p.id)).toEqual(['pub', 'priv'])
    // the creator of a private pool always sees their own
    expect(visiblePools(pools, 'lp-priv').map((p) => p.id)).toContain('priv')
  })
})

describe('marketSummary — computed over the pools the user can actually see', () => {
  it('is fed by visiblePools, so a pool you cannot see never inflates your totals', () => {
    const pools = [
      mk('pub', {}, { capital: RF(1_000_000) }),
      mk('priv', {}, { access: strangerAccess(), capital: RF(9_000_000) }),
    ]
    const s = marketSummary(visiblePools(pools, 'you'))
    expect(s.totalLiquidityWei).toBe(RF(1_000_000))
    expect(s.poolCount).toBe(1)
    // with the invite, it does count
    expect(marketSummary(visiblePools(pools, 'you', 'FRIENDS')).totalLiquidityWei).toBe(
      RF(10_000_000),
    )
  })

  it('reports available cash separately from capital deployed', () => {
    const p = openStreamPosition(mk('a', {}, { capital: RF(1_000_000) }), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 5n * DAY, nowMs: 0,
    })
    const s = marketSummary([p])
    expect(s.totalLiquidityWei).toBe(RF(1_000_000))
    expect(s.availableWei).toBe(RF(1_000_000) - RF(950))
    expect(s.deployedWei).toBe(RF(950))
    expect(s.totalLiquidityWei).toBeGreaterThan(s.availableWei)
  })

  it('counts positions, and only the ones still open', () => {
    let p = openStreamPosition(mk('a'), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 5n * DAY, nowMs: 0,
    })
    expect(marketSummary([p]).activePositions).toBe(1)
    expect(marketSummary([p]).settledPositions).toBe(0)
    p = accrue(p, 5n * DAY).pool
    expect(marketSummary([p]).activePositions).toBe(0)
    expect(marketSummary([p]).settledPositions).toBe(1)
    expect(marketSummary([p]).deployedWei).toBe(0n)
  })

  it('splits stream-capable and growth-capable pools', () => {
    const s = marketSummary([
      mk('s', {}, { kind: 'stream' }),
      mk('g', {}, { kind: 'growth' }),
      mk('b', {}, { kind: 'both' }),
    ])
    expect(s.streamPoolCount).toBe(2)
    expect(s.growthPoolCount).toBe(2)
  })
})