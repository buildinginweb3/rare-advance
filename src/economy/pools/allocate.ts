/**
 * COMMUNAL LIQUIDITY POOL — PRO-RATA ALLOCATION
 * ==============================================
 *
 * Two jobs, and only two jobs:
 *
 *   1. FUNDING — when a position opens, decide how much of it each LP's
 *      available RF funds. Pro-rata across available balances, deterministic,
 *      never random, never "creator first".
 *
 *   2. DISTRIBUTION — when RF or WETH is returned for a position, split it
 *      using that position's FROZEN funding snapshot.
 *
 * Both use the same primitive: a pro-rata split with an explicit rounding
 * remainder assigned deterministically. The split ALWAYS sums back exactly to
 * the input, so no RF or WETH can appear from nowhere.
 *
 * All arithmetic is bigint fixed point. No binary floats.
 */

import { BPS_SCALE } from '../../math/rf'
import type { LpAccount, LpId, PositionFunding } from './types'

export interface Share {
  lpId: LpId
  /** The exact amount this LP takes. */
  amountWei: bigint
  /** Share of the total, in basis points. */
  shareBps: bigint
}

/**
 * Split `totalWei` across `weights` proportionally.
 *
 * Deterministic behaviour:
 *   - every participant takes floor(total * weight / totalWeight)
 *   - the leftover wei (at most one per extra participant) is handed out in the
 *     fixed input order, largest weight first
 * so `sum(amounts) === totalWei` exactly, every time.
 */
export function splitProRata(
  totalWei: bigint,
  weights: { id: LpId; weightWei: bigint }[],
): Share[] {
  if (totalWei < 0n) throw new Error('splitProRata: negative total')
  if (weights.length === 0) {
    if (totalWei === 0n) return []
    throw new Error('splitProRata: cannot distribute a non-zero amount with no participants')
  }
  const positive = weights.filter((w) => w.weightWei > 0n)
  if (positive.length === 0) return []

  const totalWeight = positive.reduce((a, w) => a + w.weightWei, 0n)
  if (totalWeight <= 0n) return []

  // Fixed order: largest first, then by id, so the dust is always deterministic.
  const ordered = [...positive].sort((a, b) =>
    a.weightWei === b.weightWei ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.weightWei > b.weightWei ? -1 : 1,
  )

  const out: Share[] = ordered.map((w) => ({
    lpId: w.id,
    amountWei: (totalWei * w.weightWei) / totalWeight,
    shareBps: (w.weightWei * BPS_SCALE) / totalWeight,
  }))

  // Hand out the remainder deterministically.
  let assigned = out.reduce((a, s) => a + s.amountWei, 0n)
  let leftover = totalWei - assigned
  let i = 0
  while (leftover > 0n && out.length > 0) {
    out[i % out.length] = {
      ...out[i % out.length],
      amountWei: out[i % out.length]!.amountWei + 1n,
    }
    assigned += 1n
    leftover -= 1n
    i += 1
  }
  // The invariant that makes "no value from nowhere" testable.
  if (out.reduce((a, s) => a + s.amountWei, 0n) !== totalWei) {
    throw new Error('splitProRata: split does not reconcile to the total')
  }
  return out
}

/**
 * Build the frozen funding snapshot for a new position.
 *
 * Funding is drawn from each LP's AVAILABLE balance, pro-rata. An LP with no
 * available RF funds nothing and is therefore owed nothing from this position.
 */
export function buildFundingSnapshot(
  availableByLp: { lpId: LpId; availableWei: bigint }[],
  principalWei: bigint,
): PositionFunding[] {
  if (principalWei <= 0n) return []
  const totalAvailable = availableByLp.reduce((a, l) => a + l.availableWei, 0n)
  if (totalAvailable <= 0n) {
    throw new Error('buildFundingSnapshot: pool has no available liquidity')
  }
  const shares = splitProRata(
    principalWei,
    availableByLp.map((l) => ({ id: l.lpId, weightWei: l.availableWei })),
  )
  return shares
    .filter((s) => s.amountWei > 0n)
    .map((s) => ({ lpId: s.lpId, principalWei: s.amountWei, shareBps: s.shareBps }))
}

/** Rebuild a snapshot's shares from its principal amounts, authoritatively. */
export function recomputeFundingShares(funding: PositionFunding[]): PositionFunding[] {
  const total = funding.reduce((a, f) => a + f.principalWei, 0n)
  if (total <= 0n) return funding
  return funding.map((f) => ({ ...f, shareBps: (f.principalWei * BPS_SCALE) / total }))
}

/** True when a snapshot's stored shares match its principal amounts. */
export function fundingIsConsistent(funding: PositionFunding[]): boolean {
  if (funding.reduce((a, f) => a + f.shareBps, 0n) !== BPS_SCALE) {
    // Rounding can leave the shares a wei short of 10,000 bps; that is fine as
    // long as the authoritative amount split is exact, which splitProRata is.
    const recomputed = recomputeFundingShares(funding)
    return recomputed.every((f, i) => f.shareBps === funding[i]!.shareBps)
  }
  return true
}

/** Sum of a snapshot's principals. */
export function fundingTotal(funding: PositionFunding[]): bigint {
  return funding.reduce((a, f) => a + f.principalWei, 0n)
}

/**
 * Distribute an amount across a position's FROZEN funding snapshot.
 * This is the function that makes a late LP unable to claim old earnings.
 */
export function distributeBySnapshot(
  funding: PositionFunding[],
  amountWei: bigint,
): { shares: Share[]; funding: PositionFunding[] } {
  if (amountWei <= 0n) return { shares: [], funding }
  const shares = splitProRata(
    amountWei,
    funding.map((f) => ({ id: f.lpId, weightWei: f.principalWei })),
  )
  return { shares, funding }
}

/** LP ids present in a snapshot. */
export function snapshotLpIds(funding: PositionFunding[]): LpId[] {
  return funding.filter((f) => f.principalWei > 0n).map((f) => f.lpId)
}

/** Read one LP's account, or undefined. */
export function lpAccount(
  lps: Record<LpId, LpAccount>,
  lpId: LpId,
): LpAccount | undefined {
  return lps[lpId]
}

/** Create a zeroed LP account. */
export function newLpAccount(id: LpId, displayName: string): LpAccount {
  return {
    id,
    displayName,
    contributedWei: 0n,
    withdrawnWei: 0n,
    rfPrincipalRepaidWei: 0n,
    rfPremiumEarnedWei: 0n,
    wethEarnedWei: 0n,
  }
}
