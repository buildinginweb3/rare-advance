/**
 * COMMUNAL LIQUIDITY POOL — MARKET
 * =================================
 *
 * The borrower-facing side: which pools can fund this request, what each one
 * offers, and how to compare them without needing to understand DeFi.
 *
 * Two deliberate rules:
 *
 *  - STREAM ADVANCES are sorted by what the holder actually wants: the most RF
 *    received now. That is a single, honest objective.
 *
 *  - GROWTH FINANCING is NOT sorted into a single "best". Its offers trade off
 *    against each other (upfront RF vs premium vs WETH share vs liquidity), so
 *    the market returns descriptive factual badges instead of a ranking that
 *    would be a lie.
 */

import { BPS_SCALE, mulBps } from '../../math/rf'
import {
  canBorrow,
  lpAvailableWei,
  poolCanFundGrowth,
  poolCanFundStream,
  positionOutstandingRfWei,
  positionOutstandingWethWei,
} from './engine'
import type { LpId, Pool, Position } from './types'

export interface StreamRequest {
  friendKey: string
  eligibleStreamingWei: bigint
  termMs: bigint
  borrowerLpId: LpId
  inviteCode?: string | null
}

export interface GrowthRequest {
  friendKey: string
  actionKind: Position extends never ? never : import('../../types').GrowthActionKind
  actionCostWei: bigint
  /**
   * RF the borrower has chosen to put in today. Offers are computed against THIS
   * number, so the figure shown is the figure that will be booked.
   */
  ownerContributionWei: bigint
  generation: number
  borrowerLpId: LpId
  inviteCode?: string | null
  /** Modeled WETH the Friend would earn over the modelled financing period. */
  modeledWethForFriendWei: bigint
}

export interface StreamOffer {
  poolId: string
  poolName: string
  privatePool: boolean
  /** RF the holder receives right now. */
  youGetNowWei: bigint
  /** Maximum total cost = premium + Rare Advance fee. */
  maxCostWei: bigint
  lpPremiumWei: bigint
  rareAdvanceFeeWei: bigint
  /** What settles out of the Friend's stream. */
  settlementWei: bigint
  termMs: bigint
  availableWei: bigint
  lpPremiumBps: bigint
  rareAdvanceFeeBps: bigint
}

export interface GrowthOffer {
  poolId: string
  poolName: string
  privatePool: boolean
  /** RF the borrower pays today. */
  youPayTodayWei: bigint
  /** RF the pool finances. */
  poolFinancesWei: bigint
  /** principal + LP premium. */
  repaymentTargetWei: bigint
  lpPremiumWei: bigint
  rfRoutingBps: bigint
  wethShareBps: bigint
  /** Modeled WETH the pool would receive while financing is outstanding. */
  modeledWethToPoolWei: bigint
  /** Modeled WETH the owner would keep while financing is outstanding. */
  modeledWethToOwnerWei: bigint
  availableWei: bigint
  growthPremiumBps: bigint
  maxFinanceBps: bigint
  /** Factual, not subjective. */
  badges: string[]
}

// ---------------------------------------------------------------------------
// Stream offers
// ---------------------------------------------------------------------------

/**
 * Every pool that can fund this Stream Advance, best-for-the-holder first.
 * A private pool only appears for a borrower with access.
 */
export function streamOffers(pools: Pool[], req: StreamRequest): StreamOffer[] {
  const out: StreamOffer[] = []
  for (const pool of pools) {
    if (!canBorrow(pool, req.borrowerLpId, req.inviteCode)) continue
    if (!poolCanFundStream(pool, req.borrowerLpId, req.eligibleStreamingWei, req.inviteCode)) continue
    const t = pool.terms
    const face = req.eligibleStreamingWei
    const premium = mulBps(face, t.streamPremiumBps)
    const fee = mulBps(face, t.rareAdvanceFeeBps)
    out.push({
      poolId: pool.id,
      poolName: pool.name,
      privatePool: pool.access.visibility === 'private',
      youGetNowWei: face - premium - fee,
      maxCostWei: premium + fee,
      lpPremiumWei: premium,
      rareAdvanceFeeWei: fee,
      settlementWei: face,
      termMs: req.termMs,
      availableWei: pool.cashRfWei,
      lpPremiumBps: t.streamPremiumBps,
      rareAdvanceFeeBps: t.rareAdvanceFeeBps,
    })
  }
  // Best for the holder: most RF now. Tie-break on more liquidity, then name.
  out.sort((a, b) => {
    if (a.youGetNowWei !== b.youGetNowWei) return a.youGetNowWei > b.youGetNowWei ? -1 : 1
    if (a.availableWei !== b.availableWei) return a.availableWei > b.availableWei ? -1 : 1
    return a.poolName < b.poolName ? -1 : 1
  })
  return out
}

// ---------------------------------------------------------------------------
// Growth offers
// ---------------------------------------------------------------------------

/**
 * Pools that can finance this Growth action. Returns all of them with factual
 * comparison badges, deliberately WITHOUT a single ranked winner.
 */
export function growthOffers(pools: Pool[], req: GrowthRequest): GrowthOffer[] {
  const out: GrowthOffer[] = []
  for (const pool of pools) {
    const t = pool.terms
    // Exactly what the engine will do for the borrower's chosen upfront.
    const financed = req.actionCostWei - req.ownerContributionWei
    if (financed <= 0n) continue
    if (financed > mulBps(req.actionCostWei, t.growthMaxFinanceBps)) continue
    if (
      !poolCanFundGrowth(
        pool,
        req.borrowerLpId,
        { kind: req.actionKind, costWei: req.actionCostWei, generation: req.generation },
        req.inviteCode,
      )
    ) {
      continue
    }
    const premium = mulBps(financed, t.growthPremiumBps)
    const toPool = mulBps(req.modeledWethForFriendWei, t.growthWethShareBps)
    out.push({
      poolId: pool.id,
      poolName: pool.name,
      privatePool: pool.access.visibility === 'private',
      youPayTodayWei: req.ownerContributionWei,
      poolFinancesWei: financed,
      repaymentTargetWei: financed + premium,
      lpPremiumWei: premium,
      rfRoutingBps: t.growthRfRoutingBps,
      wethShareBps: t.growthWethShareBps,
      // WETH is separate accounting and is never turned into RF.
      modeledWethToPoolWei: toPool,
      modeledWethToOwnerWei: req.modeledWethForFriendWei - toPool,
      availableWei: pool.cashRfWei,
      growthPremiumBps: t.growthPremiumBps,
      maxFinanceBps: t.growthMaxFinanceBps,
      badges: [],
    })
  }
  if (out.length > 0) {
    // Factual comparisons only. No pool is ever declared "the best one".
    const lowestPremium = out.reduce((a, o) => (o.lpPremiumWei < a.lpPremiumWei ? o : a))
    const mostLiquidity = out.reduce((a, o) => (o.availableWei > a.availableWei ? o : a))
    const lowestWeth = out.reduce((a, o) => (o.wethShareBps < a.wethShareBps ? o : a))
    const fastestRepay = out.reduce((a, o) => (o.rfRoutingBps > a.rfRoutingBps ? o : a))
    for (const o of out) {
      const b: string[] = []
      if (o === lowestPremium) b.push('LOWEST RF PREMIUM')
      if (o === mostLiquidity) b.push('MOST LIQUIDITY')
      if (o === lowestWeth) b.push('LOWEST WETH SHARE')
      if (o === fastestRepay) b.push('FASTEST RF REPAYMENT')
      o.badges = b
    }
  }
  // Deterministic display order, no implied ranking: cheapest premium first,
  // then most liquidity, then pool name.
  out.sort((a, b) => {
    if (a.lpPremiumWei !== b.lpPremiumWei) return a.lpPremiumWei < b.lpPremiumWei ? -1 : 1
    if (a.availableWei !== b.availableWei) return a.availableWei > b.availableWei ? -1 : 1
    return a.poolName < b.poolName ? -1 : 1
  })
  return out
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Pools a given LP may SEE. Private pools are hidden from general discovery
 * unless the LP has access, so private volume is never presented as public
 * market liquidity.
 */
export function visiblePools(pools: Pool[], lpId: LpId, inviteCode?: string | null): Pool[] {
  return pools.filter((p) => canBorrow(p, lpId, inviteCode))
}

export function publicPools(pools: Pool[]): Pool[] {
  return pools.filter((p) => p.access.visibility === 'public' && p.status === 'open')
}

// ---------------------------------------------------------------------------
// Market summary
// ---------------------------------------------------------------------------

export interface MarketSummary {
  poolCount: number
  streamPoolCount: number
  growthPoolCount: number
  totalLiquidityWei: bigint
  availableWei: bigint
  deployedWei: bigint
  activePositions: number
  settledPositions: number
}

export function marketSummary(pools: Pool[]): MarketSummary {
  const live = pools.filter((p) => p.status !== 'closed')
  let total = 0n
  let available = 0n
  let deployed = 0n
  let active = 0
  let settled = 0
  for (const p of live) {
    total += Object.values(p.lps).reduce((a, l) => a + l.contributedWei - l.withdrawnWei, 0n)
    available += p.cashRfWei
    for (const pos of p.positions) {
      deployed += pos.principalWei - pos.principalRepaidWei
      if (positionOutstandingRfWei(pos) > 0n || positionOutstandingWethWei(pos) > 0n) active += 1
      else settled += 1
    }
  }
  return {
    poolCount: live.length,
    streamPoolCount: live.filter((p) => p.kind === 'stream' || p.kind === 'both').length,
    growthPoolCount: live.filter((p) => p.kind === 'growth' || p.kind === 'both').length,
    totalLiquidityWei: total,
    availableWei: available,
    deployedWei: deployed,
    activePositions: active,
    settledPositions: settled,
  }
}

/** Utilization in basis points. Factual, not a risk rating. */
export function utilizationBps(p: Pool): bigint {
  const total = Object.values(p.lps).reduce((a, l) => a + l.contributedWei - l.withdrawnWei, 0n)
  if (total <= 0n) return 0n
  return mulBps(p.cashRfWei, BPS_SCALE) / total
}

/** How much of a pool is currently spoken for. */
export function poolUtilizationBps(p: Pool): bigint {
  let total = 0n
  for (const pos of p.positions) total += pos.principalWei - pos.principalRepaidWei
  const committed = total + p.cashRfWei
  if (committed <= 0n) return 0n
  return mulBps(total, BPS_SCALE) / committed
}

/** Can this LP withdraw anything right now? */
export function withdrawableWei(pool: Pool, lpId: LpId): bigint {
  return lpAvailableWei(pool, lpId)
}
