/**
 * COMMUNAL LIQUIDITY POOL — DOMAIN TYPES
 * ========================================
 *
 * A pool is NOT "one lender making one loan".
 *
 * A pool is:
 *   ONE SET OF TERMS
 *   + RF CONTRIBUTED BY MULTIPLE LIQUIDITY PROVIDERS (LPs)
 *   + MULTIPLE FINANCING POSITIONS
 *
 * The single most important structural rule in this file is the POSITION
 * FUNDING SNAPSHOT. When a position opens, the RF each LP put into THAT
 * position is recorded on the position itself. Every later distribution for
 * that position — principal returned, RF premium, WETH participation — is
 * split using that frozen snapshot, never the pool's current membership.
 *
 * Without that rule a pool could be drained: join after the fact, then claim a
 * share of earnings that were produced by other people's capital.
 *
 * Everything here is SIMULATED. No real RF, no real WETH, no transfers, no
 * approvals, no contracts.
 */

import type { GrowthActionKind } from '../../types'

/** Stable identifier for a liquidity provider inside the simulated market. */
export type LpId = string

// ---------------------------------------------------------------------------
// Pool shape
// ---------------------------------------------------------------------------

/** Which Rare Advance product a pool's capital may fund. */
export type PoolKind = 'stream' | 'growth' | 'both'

export type PoolVisibility = 'public' | 'private'

export type PoolStatus = 'open' | 'winding-down' | 'closed'

/** Who may supply liquidity to a private pool. */
export type PrivateLiquidityAccess = 'creator-only' | 'invited'

/** Who may borrow from a private pool. */
export type PrivateBorrowerAccess = 'invited' | 'anyone-with-link'

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/**
 * Every economic term a creator sets. Terms become IMMUTABLE once any external
 * LP has contributed or any position has opened — see `Pool.termsLocked`.
 */
export interface PoolTerms {
  /** MARKET A · Stream Advances */
  /** LP premium as a share of the settled face value. */
  streamPremiumBps: bigint
  /** Rare Advance economic fee / RF burn, share of the settled face value. */
  rareAdvanceFeeBps: bigint
  /** Largest slice of an eligible stream this pool will advance. */
  maxAdvanceShareBps: bigint
  /** Largest single Stream Advance this pool will open. */
  maxStreamPositionWei: bigint

  /** MARKET B · Growth Financing */
  /** LP premium on the financed principal. */
  growthPremiumBps: bigint
  /** Largest share of an action cost this pool will finance. */
  growthMaxFinanceBps: bigint
  /** Share of future RF rewards routed to repayment while outstanding. */
  growthRfRoutingBps: bigint
  /** Share of future WETH rewards routed to this pool while outstanding. */
  growthWethShareBps: bigint
  /** Largest single Growth financing this pool will open. */
  growthMaxPositionWei: bigint

  /** Which Rare Friends economic actions this pool will finance. */
  eligibleActions: GrowthActionKind[]
  /** Generations this pool will finance. `null` means every generation. */
  eligibleGenerations: number[] | null
}

export interface PoolAccess {
  visibility: PoolVisibility
  /** Simulated invite code for a private pool. */
  inviteCode: string | null
  privateLiquidityAccess: PrivateLiquidityAccess
  privateBorrowerAccess: PrivateBorrowerAccess
  /** LP ids explicitly invited to a private pool. */
  allowlistedLps: LpId[]
}

// ---------------------------------------------------------------------------
// Liquidity providers
// ---------------------------------------------------------------------------

/**
 * Per-LP accounting. `deployedWei` and `availableWei` are DERIVED from the
 * pool's open positions and cash, never stored independently, so the books
 * cannot silently drift apart.
 */
export interface LpAccount {
  id: LpId
  displayName: string
  /** Lifetime RF contributed. */
  contributedWei: bigint
  /** Lifetime RF withdrawn. */
  withdrawnWei: bigint
  /** Lifetime RF principal returned to this LP. */
  rfPrincipalRepaidWei: bigint
  /** Lifetime RF LP premium earned. */
  rfPremiumEarnedWei: bigint
  /** Lifetime WETH participation earned. SEPARATE from RF, never converted. */
  wethEarnedWei: bigint
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/**
 * The frozen record of WHICH LP capital funded a position.
 * `shareBps` is derived from `principalWei` and is always validated against the
 * position total; it is stored only so the UI never recomputes it.
 */
export interface PositionFunding {
  lpId: LpId
  principalWei: bigint
  shareBps: bigint
}

interface PositionBase {
  id: string
  poolId: string
  kind: 'stream' | 'growth'
  friendKey: string
  borrowerLpId: LpId
  createdAtMs: number
  elapsedMs: bigint
  termMs: bigint
  /** RF the pool put in. */
  principalWei: bigint
  /** Maximum LP premium = principal * premium bps. Accrues with time, capped. */
  maxLpPremiumWei: bigint
  /** RF already returned to the pool's LPs as principal. */
  principalRepaidWei: bigint
  /** RF LP premium already distributed to LPs. */
  premiumPaidWei: bigint
  /** Frozen LP funding snapshot. THE core accounting rule. */
  funding: PositionFunding[]
}

/** MARKET A — a discounted sale of an already-streaming RF receivable. */
export interface StreamPosition extends PositionBase {
  kind: 'stream'
  /** Total RF that settles out of the Friend's reward stream. */
  faceValueWei: bigint
  /** RF handed to the holder now. faceValue - maxPremium - fee. */
  borrowerReceivedWei: bigint
  /** Rare Advance fee, taken from the face value at settlement. */
  rareAdvanceFeeWei: bigint
  /** How much of rareAdvanceFeeWei has vested into the pool's fee bucket. */
  feeRecognisedWei: bigint
  streamPremiumBps: bigint
}

/** MARKET B — financing a Rare Friends economic action, repaid from rewards. */
export interface GrowthPosition extends PositionBase {
  kind: 'growth'
  actionId: string
  actionKind: GrowthActionKind
  /** Full protocol action cost. */
  actionCostWei: bigint
  generation: number
  /** RF the borrower paid today. */
  ownerContributionWei: bigint
  /** LP premium on the financed principal. */
  growthPremiumBps: bigint
  /** principal + maxLpPremium. */
  repaymentTargetWei: bigint
  /** Share of future RF rewards routed to repayment. */
  rfRoutingBps: bigint
  /** Share of future WETH rewards routed to this pool. SEPARATE from RF. */
  wethShareBps: bigint
  /** Modeled RF routed to repayment per day while outstanding. */
  rfRepaymentPerDayWei: bigint
  /** Modeled WETH routed to the pool per day while outstanding. */
  wethPerDayWei: bigint
  /**
   * Cumulative WETH participation this position has earned for its funding LPs.
   * Credited to LPs at the instant it accrues, so nothing is ever "pending":
   * a position is held open by its RF repayment target ALONE.
   */
  wethPoolWei: bigint
  /** Underlying Rare Friends economics, shown separately from Rare Advance. */
  protocolBurnWei: bigint
  protocolRewardFundingWei: bigint
}

export type Position = StreamPosition | GrowthPosition

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

export interface Pool {
  id: string
  name: string
  kind: PoolKind
  creatorLpId: LpId
  status: PoolStatus
  terms: PoolTerms
  access: PoolAccess
  /** termsLocked is sticky: once true it never returns to false. */
  termsLocked: boolean
  lps: Record<LpId, LpAccount>
  /** RF the pool has taken in and not yet distributed as earnings. */
  cashRfWei: bigint
  /** Cumulative Rare Advance fees collected (RF burn bucket). */
  rareAdvanceFeesWei: bigint
  /** Cumulative WETH participation credited to LPs across all positions. */
  cumulativeWethWei: bigint
  positions: Position[]
  /** True for the pools seeded into Demo Mode. */
  seeded: boolean
  createdAtMs: number
}

/** Aggregate figures for the market summary. */
export interface MarketSummary {
  poolCount: number
  streamPoolCount: number
  growthPoolCount: number
  totalLiquidityWei: bigint
  availableWei: bigint
  deployedWei: bigint
  activePositions: number
  completedPositions: number
}

export const LP_KIND_LABEL: Record<'stream' | 'growth', string> = {
  stream: 'Stream Advance',
  growth: 'Growth Financing',
}
