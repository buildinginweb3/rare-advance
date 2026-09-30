/**
 * COMMUNAL LIQUIDITY POOL — ENGINE
 * =================================
 *
 * Pure functions. No React, no storage, no network, no timers. Every value here
 * is SIMULATED: no real RF, no real WETH, no transfers, no approvals.
 *
 * The accounting invariants this module guarantees, each asserted by a unit test:
 *
 *   I1   pool.cashRfWei is never negative
 *   I2   funding snapshot principals sum EXACTLY to position.principalWei
 *   I3   position.principalRepaidWei <= position.principalWei
 *   I4   position.premiumPaidWei  <= position.maxLpPremiumWei
 *   I5   every distribution splits EXACTLY (no RF or WETH from nowhere)
 *   I6   WETH lives in its own bucket and is never converted to or from RF
 *   I7   a settled position has zero outstanding RF and zero WETH entitlement
 *   I8   early payoff never charges unearned future premium
 *   I9   a late LP never receives earnings from a position it did not fund
 */

import { BPS_SCALE, mulBps } from '../../math/rf'
import {
  buildFundingSnapshot,
  distributeBySnapshot,
  newLpAccount,
  recomputeFundingShares,
  fundingTotal,
} from './allocate'
import { MAX_POSITION_RF_WEI, MAX_TOTAL_WETH_PARTICIPATION_BPS } from '../marketLimits'
import { validateTerms } from './terms'
import type {
  GrowthPosition,
  LpAccount,
  LpId,
  Pool,
  PoolAccess,
  PoolKind,
  PoolTerms,
  Position,
  PositionFunding,
  StreamPosition,
} from './types'

export class PoolError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PoolError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Creation and terms lifecycle
// ---------------------------------------------------------------------------

export interface CreatePoolInput {
  id: string
  name: string
  kind: PoolKind
  creatorLpId: LpId
  creatorName: string
  capitalWei: bigint
  terms: PoolTerms
  access: PoolAccess
  nowMs: number
  seeded?: boolean
}

/**
 * Throwing guard around the pure validator, so the engine enforces the same
 * invariants as the UI. A caller cannot build a mathematically broken pool by
 * skipping the wizard.
 */
function assertValidTerms(terms: PoolTerms): void {
  const result = validateTerms(terms)
  if (!result.ok) throw new PoolError('terms', result.errors[0] ?? 'Those terms are not valid.')
}

export function createPool(input: CreatePoolInput): Pool {
  if (input.capitalWei <= 0n) {
    throw new PoolError('capital', 'A pool needs some capital to be useful.')
  }
  assertValidTerms(input.terms)
  const creator: LpAccount = newLpAccount(input.creatorLpId, input.creatorName)
  creator.contributedWei = input.capitalWei
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    creatorLpId: input.creatorLpId,
    status: 'open',
    terms: input.terms,
    access: input.access,
    termsLocked: false,
    lps: { [input.creatorLpId]: creator },
    cashRfWei: input.capitalWei,
    rareAdvanceFeesWei: 0n,
    cumulativeWethWei: 0n,
    positions: [],
    seeded: input.seeded ?? false,
    createdAtMs: input.nowMs,
  }
}

/** Terms are mutable only while the creator is the only LP and nothing is open. */
export function termsAreMutable(pool: Pool): boolean {
  return !pool.termsLocked && pool.status === 'open' && pool.positions.length === 0
}

export function updateTerms(pool: Pool, terms: PoolTerms): Pool {
  if (!termsAreMutable(pool)) {
    throw new PoolError(
      'terms-locked',
      'TERMS LOCKED. This pool has other contributors or open financing. Clone it with new terms instead.',
    )
  }
  assertValidTerms(terms)
  return { ...pool, terms }
}

export function clonePoolWithNewTerms(
  pool: Pool,
  newId: string,
  creatorLpId: LpId,
  creatorName: string,
  capitalWei: bigint,
  terms: PoolTerms,
  access: PoolAccess,
  nowMs: number,
): Pool {
  assertValidTerms(terms)
  return createPool({
    id: newId,
    name: `${pool.name} (copy)`,
    kind: pool.kind,
    creatorLpId,
    creatorName,
    capitalWei,
    terms,
    access,
    nowMs,
  })
}

export function pauseNewFinancing(pool: Pool): Pool {
  return pool.status === 'closed' ? pool : { ...pool, status: 'winding-down' }
}

// ---------------------------------------------------------------------------
// Derived balances — derived, never stored, so they cannot drift
// ---------------------------------------------------------------------------

export function positionOutstandingPrincipalWei(p: Position): bigint {
  const v = p.principalWei - p.principalRepaidWei
  return v > 0n ? v : 0n
}

/**
 * Premium that has VESTED but has not been paid.
 *
 * This is the heart of "not a loan". A Stream Advance's premium accrues with
 * elapsed time and is capped at the quoted maximum, so a holder who pays off
 * early never pays the unearned part. Growth is different on purpose: its
 * premium is part of a fixed repayment target, so the whole target is owed.
 */
export function positionOutstandingPremiumWei(p: Position): bigint {
  const vested =
    p.kind === 'stream' ? mulBps(p.maxLpPremiumWei, elapsedBps(p)) : p.maxLpPremiumWei
  const outstanding = vested - p.premiumPaidWei
  return outstanding > 0n ? outstanding : 0n
}

/** Elapsed time as basis points of the term, clamped to [0, BPS_SCALE]. */
function elapsedBps(p: Position): bigint {
  const denom = p.termMs > 0n ? p.termMs : 1n
  const clamped = p.elapsedMs > denom ? denom : p.elapsedMs
  return (clamped * BPS_SCALE) / denom
}

export function positionOutstandingRfWei(p: Position): bigint {
  return positionOutstandingPrincipalWei(p) + positionOutstandingPremiumWei(p)
}

export function positionOutstandingWethWei(_p: Position): bigint {
  return 0n
}

/**
 * A position is settled when its RF repayment target is met. WETH never keeps a
 * position open: participation is a temporary term that ends with RF.
 */
export function isPositionSettled(p: Position): boolean {
  return positionOutstandingRfWei(p) <= 0n
}

/** RF this LP currently has inside open positions. */
export function lpDeployedWei(pool: Pool, lpId: LpId): bigint {
  let total = 0n
  for (const p of pool.positions) {
    const outstanding = positionOutstandingPrincipalWei(p)
    if (outstanding <= 0n) continue
    const totalFunding = fundingTotal(p.funding)
    if (totalFunding <= 0n) continue
    const f = p.funding.find((x) => x.lpId === lpId)
    if (!f) continue
    total += (outstanding * f.principalWei) / totalFunding
  }
  return total
}

/** RF this LP can withdraw, or have funded into a new position. */
export function lpAvailableWei(pool: Pool, lpId: LpId): bigint {
  const acct = pool.lps[lpId]
  if (!acct) return 0n
  const v = acct.contributedWei - acct.withdrawnWei - lpDeployedWei(pool, lpId)
  return v > 0n ? v : 0n
}

export function poolAvailableWei(pool: Pool): bigint {
  return pool.cashRfWei
}

export function poolDeployedWei(pool: Pool): bigint {
  return pool.positions.reduce((a, p) => a + positionOutstandingPrincipalWei(p), 0n)
}

export function poolTotalLiquidityWei(pool: Pool): bigint {
  return Object.values(pool.lps).reduce((a, l) => a + l.contributedWei - l.withdrawnWei, 0n)
}

export function openPositions(pool: Pool): Position[] {
  return pool.positions.filter((p) => !isPositionSettled(p))
}

export function settledPositions(pool: Pool): Position[] {
  return pool.positions.filter(isPositionSettled)
}

export function lpCount(pool: Pool): number {
  return Object.keys(pool.lps).length
}

// ---------------------------------------------------------------------------
// Contributions and withdrawals
// ---------------------------------------------------------------------------

export function contribute(pool: Pool, lpId: LpId, displayName: string, amountWei: bigint): Pool {
  if (pool.status === 'closed') throw new PoolError('closed', 'This pool is closed.')
  if (pool.status === 'winding-down') throw new PoolError('winding-down', 'This pool is closed to new deposits.')
  if (amountWei <= 0n) throw new PoolError('amount', 'Deposit must be above zero.')

  const acct = pool.lps[lpId] ?? newLpAccount(lpId, displayName)
  const others = Object.values(pool.lps).filter((l) => l.id !== lpId).length
  const isExternalWithOthers = lpId !== pool.creatorLpId && others > 0

  return {
    ...pool,
    lps: { ...pool.lps, [lpId]: { ...acct, contributedWei: acct.contributedWei + amountWei } },
    cashRfWei: pool.cashRfWei + amountWei,
    // Terms lock the moment somebody other than the creator joins.
    termsLocked: pool.termsLocked || isExternalWithOthers,
  }
}

/** Withdraw AVAILABLE RF only. Deployed capital is untouchable until settlement. */
export function withdraw(pool: Pool, lpId: LpId, amountWei: bigint): Pool {
  const available = lpAvailableWei(pool, lpId)
  if (amountWei <= 0n) throw new PoolError('amount', 'Withdrawal must be above zero.')
  if (amountWei > available) {
    throw new PoolError(
      'insufficient',
      `You can withdraw at most ${available} RF. Capital funded into an open position stays deployed until it settles.`,
    )
  }
  const acct = pool.lps[lpId]
  if (!acct) throw new PoolError('unknown-lp', 'Unknown liquidity provider.')
  return {
    ...pool,
    lps: { ...pool.lps, [lpId]: { ...acct, withdrawnWei: acct.withdrawnWei + amountWei } },
    cashRfWei: pool.cashRfWei - amountWei,
  }
}

// ---------------------------------------------------------------------------
// Opening positions
// ---------------------------------------------------------------------------

export interface OpenStreamPositionInput {
  id: string
  friendKey: string
  borrowerLpId: LpId
  faceValueWei: bigint
  termMs: bigint
  nowMs: number
}

export function openStreamPosition(pool: Pool, input: OpenStreamPositionInput): Pool {
  if (pool.status !== 'open') throw new PoolError('not-open', 'This pool is not taking new financing.')
  if (pool.kind === 'growth') throw new PoolError('kind', 'This pool only finances Friend growth.')
  if (input.faceValueWei <= 0n) throw new PoolError('amount', 'Advance must be above zero.')
  if (input.faceValueWei > pool.terms.maxStreamPositionWei) {
    throw new PoolError('max-position', "That advance is larger than this pool's maximum position size.")
  }
  if (input.faceValueWei > MAX_POSITION_RF_WEI) {
    throw new PoolError('demo-limit', 'That advance is larger than this demo allows.')
  }

  const t = pool.terms
  const premium = mulBps(input.faceValueWei, t.streamPremiumBps)
  const fee = mulBps(input.faceValueWei, t.rareAdvanceFeeBps)
  const principal = input.faceValueWei - premium - fee
  if (principal <= 0n) throw new PoolError('terms', 'These terms would leave the holder nothing.')
  // A pool may never fund more RF than it actually holds.
  if (principal > pool.cashRfWei) {
    throw new PoolError(
      'liquidity',
      'Not enough available liquidity in this pool. Choose a smaller amount or another pool.',
    )
  }

  const funding = buildFundingSnapshot(availableByLp(pool), principal)
  if (fundingTotal(funding) !== principal) throw new PoolError('funding', 'Funding snapshot does not reconcile.')

  const position: StreamPosition = {
    id: input.id,
    poolId: pool.id,
    kind: 'stream',
    friendKey: input.friendKey,
    borrowerLpId: input.borrowerLpId,
    createdAtMs: input.nowMs,
    elapsedMs: 0n,
    termMs: input.termMs > 0n ? input.termMs : 1n,
    principalWei: principal,
    maxLpPremiumWei: premium,
    principalRepaidWei: 0n,
    premiumPaidWei: 0n,
    funding: recomputeFundingShares(funding),
    faceValueWei: input.faceValueWei,
    borrowerReceivedWei: principal,
    rareAdvanceFeeWei: fee,
    feeRecognisedWei: 0n,
    streamPremiumBps: t.streamPremiumBps,
  }

  return {
    ...pool,
    termsLocked: true,
    cashRfWei: pool.cashRfWei - principal,
    positions: [position, ...pool.positions],
  }
}

export interface OpenGrowthPositionInput {
  id: string
  friendKey: string
  borrowerLpId: LpId
  actionId: string
  actionKind: GrowthPosition['actionKind']
  actionCostWei: bigint
  generation: number
  protocolBurnWei: bigint
  protocolRewardFundingWei: bigint
  ownerContributionWei: bigint
  rfRepaymentPerDayWei: bigint
  wethPerDayWei: bigint
  nowMs: number
}

export function openGrowthPosition(pool: Pool, input: OpenGrowthPositionInput): Pool {
  if (pool.status !== 'open') throw new PoolError('not-open', 'This pool is not taking new financing.')
  if (pool.kind === 'stream') throw new PoolError('kind', 'This pool only funds Stream Advances.')
  if (!pool.terms.eligibleActions.includes(input.actionKind)) {
    throw new PoolError('action', 'This pool does not finance that action.')
  }
  if (
    pool.terms.eligibleGenerations !== null &&
    !pool.terms.eligibleGenerations.includes(input.generation)
  ) {
    throw new PoolError('generation', 'This pool does not finance that generation.')
  }

  const t = pool.terms
  const financed = input.actionCostWei - input.ownerContributionWei
  if (financed <= 0n) throw new PoolError('amount', 'Nothing left to finance.')
  if (financed > mulBps(input.actionCostWei, t.growthMaxFinanceBps)) {
    throw new PoolError(
      'max-finance',
      "The borrower must contribute more than this pool is willing to finance.",
    )
  }
  if (financed > t.growthMaxPositionWei) {
    throw new PoolError('max-position', "That financing is larger than this pool's maximum position size.")
  }
  if (financed > MAX_POSITION_RF_WEI) {
    throw new PoolError('demo-limit', 'That financing is larger than this demo allows.')
  }
  if (financed > pool.cashRfWei) {
    throw new PoolError('liquidity', 'Not enough available liquidity in this pool.')
  }

  // Product cap: concurrent WETH participation for one Friend can never exceed
  // the total limit, so no arrangement of pools can over-collect WETH.
  const concurrent = pool.positions
    .filter((p) => p.kind === 'growth' && p.friendKey === input.friendKey)
    .reduce((a, p) => a + (p.kind === 'growth' ? p.wethShareBps : 0n), 0n)
  if (concurrent + t.growthWethShareBps > MAX_TOTAL_WETH_PARTICIPATION_BPS) {
    throw new PoolError(
      'weth-cap',
      "This pool's WETH share would exceed the total WETH participation limit for one Friend.",
    )
  }

  const premium = mulBps(financed, t.growthPremiumBps)
  const funding = buildFundingSnapshot(availableByLp(pool), financed)
  if (fundingTotal(funding) !== financed) throw new PoolError('funding', 'Funding snapshot does not reconcile.')

  const position: GrowthPosition = {
    id: input.id,
    poolId: pool.id,
    kind: 'growth',
    friendKey: input.friendKey,
    borrowerLpId: input.borrowerLpId,
    createdAtMs: input.nowMs,
    elapsedMs: 0n,
    termMs: 0n,
    principalWei: financed,
    maxLpPremiumWei: premium,
    principalRepaidWei: 0n,
    premiumPaidWei: 0n,
    funding: recomputeFundingShares(funding),
    actionId: input.actionId,
    actionKind: input.actionKind,
    actionCostWei: input.actionCostWei,
    generation: input.generation,
    ownerContributionWei: input.ownerContributionWei,
    growthPremiumBps: t.growthPremiumBps,
    repaymentTargetWei: financed + premium,
    rfRoutingBps: t.growthRfRoutingBps,
    wethShareBps: t.growthWethShareBps,
    rfRepaymentPerDayWei: input.rfRepaymentPerDayWei,
    wethPerDayWei: input.wethPerDayWei,
    wethPoolWei: 0n,
    protocolBurnWei: input.protocolBurnWei,
    protocolRewardFundingWei: input.protocolRewardFundingWei,
  }

  return {
    ...pool,
    termsLocked: true,
    cashRfWei: pool.cashRfWei - financed,
    positions: [position, ...pool.positions],
  }
}

function availableByLp(pool: Pool): { lpId: LpId; availableWei: bigint }[] {
  return Object.values(pool.lps).map((l) => ({ lpId: l.id, availableWei: lpAvailableWei(pool, l.id) }))
}

// ---------------------------------------------------------------------------
// Time: modelled reward servicing
// ---------------------------------------------------------------------------

export interface AccrueEvent {
  positionId: string
  rfSettledWei: bigint
  premiumSettledWei: bigint
  wethAccruedWei: bigint
  settled: boolean
}

export interface AccrueResult {
  pool: Pool
  events: AccrueEvent[]
}

/**
 * Credit a payment back to the funding LPs using the FROZEN snapshot.
 * The split is exact: every wei of `paymentWei` is accounted for.
 */
function creditLps(
  lps: Record<LpId, LpAccount>,
  funding: PositionFunding[],
  paymentWei: bigint,
  toPrincipalWei: bigint,
  toPremiumWei: bigint,
  wethWei: bigint,
): void {
  if (paymentWei <= 0n && wethWei <= 0n) return
  if (paymentWei > 0n) {
    // splitProRata already made these shares sum EXACTLY to paymentWei, and it
    // orders them largest-first, so handing the rounding remainder to the first
    // share makes principal attribution exact instead of dusty.
    const { shares } = distributeBySnapshot(funding, paymentWei)
    let pLeft = toPrincipalWei
    let rLeft = toPremiumWei
    shares.forEach((s, i) => {
      const last = i === shares.length - 1
      const principal = last ? pLeft : (toPrincipalWei * s.amountWei) / paymentWei
      const premium = last ? rLeft : (toPremiumWei * s.amountWei) / paymentWei
      pLeft -= principal
      rLeft -= premium
      const cur = lps[s.lpId] ?? newLpAccount(s.lpId, s.lpId)
      lps[s.lpId] = {
        ...cur,
        rfPrincipalRepaidWei: cur.rfPrincipalRepaidWei + principal,
        rfPremiumEarnedWei: cur.rfPremiumEarnedWei + premium,
      }
    })
  }
  if (wethWei > 0n) {
    const { shares } = distributeBySnapshot(funding, wethWei)
    for (const s of shares) {
      const cur = lps[s.lpId] ?? newLpAccount(s.lpId, s.lpId)
      lps[s.lpId] = { ...cur, wethEarnedWei: cur.wethEarnedWei + s.amountWei }
    }
  }
}

/**
 * Apply a settlement payment (principal + premium) to a position.
 * Principal is taken first; anything above the remaining principal is premium.
 */
function applyPayment(p: Position, amountWei: bigint): { next: Position; principal: bigint; premium: bigint } {
  const principalDue = positionOutstandingPrincipalWei(p)
  const principal = amountWei < principalDue ? amountWei : principalDue
  const premium = amountWei - principal
  return {
    next: applyKnownSplit(p, principal, premium),
    principal,
    premium,
  }
}

/**
 * Apply an ALREADY-DECIDED principal/premium split.
 *
 * Modelled settlement must use this, not applyPayment: the engine already knows
 * from the elapsed time how much of each has vested. Re-deriving the split
 * "principal first" would charge every wei to principal and only bill the
 * premium in one lump at the end, which is not how the stream actually runs.
 */
function applyKnownSplit(p: Position, principal: bigint, premium: bigint): Position {
  return {
    ...p,
    principalRepaidWei: p.principalRepaidWei + principal,
    premiumPaidWei: p.premiumPaidWei + premium,
  }
}

/**
 * Advance modelled time on every open position.
 *
 * STREAM: the Friend's reward stream vests linearly over the term. Both
 * principal and LP premium settle with it, and premium is CAPPED at the quoted
 * maximum — so paying off early genuinely saves the holder the unearned part.
 *
 * GROWTH: a share of modelled RF rewards is routed to repayment until the target
 * is met. A SEPARATE share of modelled WETH rewards accrues to the pool in its
 * own bucket. The two are never converted into each other.
 */
export function accrue(pool: Pool, deltaMs: bigint): AccrueResult {
  if (deltaMs <= 0n) return { pool, events: [] }

  const lps: Record<LpId, LpAccount> = { ...pool.lps }
  let cashRfWei = pool.cashRfWei
  // RF that has left the Friend's stream but does NOT belong to the LPs: the
  // fixed Rare Advance fee, vested over the term. Booked, never paid out.
  let rareAdvanceFeesWei = pool.rareAdvanceFeesWei
  let cumulativeWethWei = pool.cumulativeWethWei
  const events: AccrueEvent[] = []

  const positions = pool.positions.map((p): Position => {
    const elapsedMs = p.elapsedMs + deltaMs
    if (isPositionSettled(p)) return { ...p, elapsedMs }

    if (p.kind === 'stream') {
      const denom = p.termMs > 0n ? p.termMs : 1n
      const clamped = elapsedMs > denom ? denom : elapsedMs

      // Principal streams at face-minus-premium-minus-fee; premium accrues with
      // time and is capped, which is what makes an early payoff worthwhile.
      const faceSettled = (p.faceValueWei * clamped) / denom
      const premiumSettled =
        p.maxLpPremiumWei > (p.maxLpPremiumWei * clamped) / denom
          ? (p.maxLpPremiumWei * clamped) / denom
          : p.maxLpPremiumWei
      const feeSettled = (p.rareAdvanceFeeWei * clamped) / denom
      const principalTarget = faceSettled - premiumSettled - feeSettled
      const principalTargetCapped =
        principalTarget > p.principalWei ? p.principalWei : (principalTarget > 0n ? principalTarget : 0n)

      const payPrincipal = principalTargetCapped - p.principalRepaidWei
      const payPremium = premiumSettled - p.premiumPaidWei
      const payTotal = (payPrincipal > 0n ? payPrincipal : 0n) + (payPremium > 0n ? payPremium : 0n)
      if (payTotal <= 0n) return { ...p, elapsedMs }

      const principal = payPrincipal > 0n ? payPrincipal : 0n
      const premium = payPremium > 0n ? payPremium : 0n
      let next = applyKnownSplit(p, principal, premium) as StreamPosition
      creditLps(lps, p.funding, payTotal, principal, premium, 0n)
      cashRfWei += payTotal
      // The fee was taken out of the holder up front, so it is recognised as it
      // vests. principal + LP premium + fee is exactly the face value.
      const feeRecognised = feeSettled - p.feeRecognisedWei
      if (feeRecognised > 0n) {
        rareAdvanceFeesWei += feeRecognised
        next = { ...next, feeRecognisedWei: feeSettled }
      }
      events.push({
        positionId: p.id,
        rfSettledWei: payTotal,
        premiumSettledWei: premium,
        wethAccruedWei: 0n,
        settled: isPositionSettled(next),
      })
      return { ...next, elapsedMs }
    }

    // ---- growth ----
    const growth: GrowthPosition = p
    const days = deltaMs / 86_400_000n
    if (days <= 0n) return { ...p, elapsedMs }

    const outstandingBefore = positionOutstandingRfWei(growth)
    // Modelled RF routed to repayment = daily total * routing share.
    const routed = mulBps(growth.rfRepaymentPerDayWei, growth.rfRoutingBps) * days
    const applyRf = routed > outstandingBefore ? outstandingBefore : routed

    let next: GrowthPosition = growth
    let toPrincipal = 0n
    let toPremium = 0n
    if (applyRf > 0n) {
      const r = applyPayment(growth, applyRf)
      next = r.next as GrowthPosition
      toPrincipal = r.principal
      toPremium = r.premium
      creditLps(lps, growth.funding, applyRf, toPrincipal, toPremium, 0n)
      cashRfWei += applyRf
    }

    // Modelled WETH participation, its own bucket, never converted to RF.
    //
    // Participation lasts exactly as long as the RF repayment target does, so
    // in one big time jump the position only earns WETH for the days it was
    // still outstanding — the remainder of the jump earns nothing.
    const perDayRf = mulBps(growth.rfRepaymentPerDayWei, growth.rfRoutingBps)
    const daysOutstanding =
      perDayRf > 0n ? (outstandingBefore + perDayRf - 1n) / perDayRf : days
    const wethDays = days < daysOutstanding ? days : daysOutstanding
    const wethIn = mulBps(growth.wethPerDayWei, growth.wethShareBps) * wethDays
    let wethAccrued = 0n
    if (wethIn > 0n) {
      wethAccrued = wethIn
      next = { ...next, wethPoolWei: next.wethPoolWei + wethIn }
      creditLps(lps, growth.funding, 0n, 0n, 0n, wethIn)
      cumulativeWethWei += wethIn
    }

    events.push({
      positionId: growth.id,
      rfSettledWei: applyRf,
      premiumSettledWei: toPremium,
      wethAccruedWei: wethAccrued,
      settled: isPositionSettled(next),
    })
    return { ...next, elapsedMs }
  })

  return {
    pool: { ...pool, lps, cashRfWei, rareAdvanceFeesWei, cumulativeWethWei, positions },
    events,
  }
}

// ---------------------------------------------------------------------------
// Manual repayment / early payoff
// ---------------------------------------------------------------------------

export interface RepayResult {
  pool: Pool
  appliedWei: bigint
  settled: boolean
  /** What a full payoff costs right now. */
  payoffQuoteWei: bigint
}

/** Principal still owed plus premium accrued SO FAR. Unearned premium is free. */
export function payoffQuoteWei(p: Position): bigint {
  return positionOutstandingRfWei(p)
}

/**
 * Manual RF repayment, including a full early payoff.
 *
 * Because premium accrues with time and is capped, paying off early stops
 * future accrual: the holder never pays premium they did not earn. The RF paid
 * returns to the pool immediately and is credited to the funding LPs by the
 * frozen snapshot, so capital is recycled straight away.
 */
export function repay(pool: Pool, positionId: string, amountWei: bigint): RepayResult {
  if (amountWei <= 0n) throw new PoolError('amount', 'Repayment must be above zero.')
  const target = pool.positions.find((p) => p.id === positionId)
  if (!target) throw new PoolError('unknown-position', 'That position no longer exists.')
  if (isPositionSettled(target)) throw new PoolError('settled', 'This position is already settled.')

  const outstanding = positionOutstandingRfWei(target)
  const applied = amountWei > outstanding ? outstanding : amountWei
  const { next, principal, premium } = applyPayment(target, applied)

  const lps: Record<LpId, LpAccount> = { ...pool.lps }
  creditLps(lps, target.funding, applied, principal, premium, 0n)

  return {
    pool: {
      ...pool,
      lps,
      cashRfWei: pool.cashRfWei + applied,
      positions: pool.positions.map((p) => (p.id === positionId ? next : p)),
    },
    appliedWei: applied,
    settled: isPositionSettled(next),
    payoffQuoteWei: outstanding,
  }
}

/**
 * WETH participation is a TEMPORARY term. Once RF repayment completes, the LP's
 * WETH entitlement is zero from that instant. WETH already banked stays earned;
 * only FUTURE participation stops.
 */
export function wethEntitlement(pool: Pool, positionId: string): bigint {
  const p = pool.positions.find((x) => x.id === positionId)
  if (!p) return 0n
  if (p.kind !== 'growth') return 0n
  if (isPositionSettled(p)) return 0n
  return p.wethShareBps
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export function canView(pool: Pool): boolean {
  return pool.access.visibility === 'public'
}

export function hasAccess(pool: Pool, lpId: LpId, inviteCode?: string | null): boolean {
  if (pool.access.visibility === 'public') return true
  if (lpId === pool.creatorLpId) return true
  if (inviteCode && pool.access.inviteCode && inviteCode === pool.access.inviteCode) return true
  return pool.access.allowlistedLps.includes(lpId)
}

export function canContribute(pool: Pool, lpId: LpId, inviteCode?: string | null): boolean {
  if (pool.access.visibility === 'public') return true
  if (lpId === pool.creatorLpId) return true
  if (pool.access.privateLiquidityAccess === 'creator-only') return false
  return hasAccess(pool, lpId, inviteCode)
}

export function canBorrow(pool: Pool, lpId: LpId, inviteCode?: string | null): boolean {
  if (pool.access.visibility === 'public') return true
  if (lpId === pool.creatorLpId) return true
  if (pool.access.privateBorrowerAccess === 'anyone-with-link') {
    return Boolean(inviteCode && pool.access.inviteCode === inviteCode)
  }
  return hasAccess(pool, lpId, inviteCode)
}

export function poolCanFundStream(
  pool: Pool,
  lpId: LpId,
  faceWei: bigint,
  inviteCode?: string | null,
): boolean {
  if (pool.status !== 'open') return false
  if (pool.kind === 'growth') return false
  if (!canBorrow(pool, lpId, inviteCode)) return false
  if (faceWei <= 0n) return false
  if (faceWei > pool.terms.maxStreamPositionWei) return false
  if (faceWei > pool.cashRfWei) return false
  const premium = mulBps(faceWei, pool.terms.streamPremiumBps)
  const fee = mulBps(faceWei, pool.terms.rareAdvanceFeeBps)
  return faceWei - premium - fee > 0n
}

export function poolCanFundGrowth(
  pool: Pool,
  lpId: LpId,
  action: { kind: GrowthPosition['actionKind']; costWei: bigint; generation: number },
  inviteCode?: string | null,
): boolean {
  if (pool.status !== 'open') return false
  if (pool.kind === 'stream') return false
  if (!canBorrow(pool, lpId, inviteCode)) return false
  if (!pool.terms.eligibleActions.includes(action.kind)) return false
  if (
    pool.terms.eligibleGenerations !== null &&
    !pool.terms.eligibleGenerations.includes(action.generation)
  ) {
    return false
  }
  const financed = mulBps(action.costWei, pool.terms.growthMaxFinanceBps)
  if (financed <= 0n) return false
  if (financed > pool.terms.growthMaxPositionWei) return false
  if (financed > pool.cashRfWei) return false
  return true
}
