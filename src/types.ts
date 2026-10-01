/**
 * EXPLICIT TYPES
 * ==============
 *
 * Live, modeled and simulated values are never passed around as anonymous
 * blobs. `DataProvenance` is attached to anything that reaches a number on
 * screen, so a SIMULATED figure can never render with a LIVE badge.
 */

/**
 * Where a displayed value came from.
 *
 * `protocol` is for OFFICIAL PROTOCOL CONSTANTS (costs, weights, the 50/50
 * split). Those are verified against the Rare Friends docs and read back
 * onchain, but they are constants rather than live readings, so they must not
 * wear a LIVE badge.
 */
export type DataProvenance = 'onchain' | 'opensea' | 'modeled' | 'simulated' | 'protocol'

export const PROVENANCE_LABEL: Record<DataProvenance, string> = {
  onchain: 'LIVE · ONCHAIN',
  opensea: 'LIVE · OPENSEA',
  protocol: 'PROTOCOL · VERIFIED',
  modeled: 'MODELED',
  simulated: 'SIMULATED',
}

export type Sourced<T> = { value: T; provenance: DataProvenance }

/** A value that may be unavailable, and says so rather than faking it. */
export type Maybe<T> = T | null

export type CollectionName = 'Genesis' | 'Generations'

/** Where a Friend's on-screen state actually came from. */
export type FriendStateSource = DataProvenance

export interface RewardPosition {
  /** claimable + already-accrued, withdrawable now. Null when `earned()` reverts. */
  claimableRfWei: Maybe<bigint>
  claimableRf: DataProvenance
  /** false when the contract exposes no reward position for this Friend at all */
  claimableKnown: boolean
  /** this Friend's share of the currently streaming remainder (modeled). */
  streamingRfWei: Maybe<bigint>
  streamingRf: DataProvenance
  /** global stream remaining at read time, for context. */
  streamRemainingRfWei: Maybe<bigint>
  streamRateRfPerSec: Maybe<bigint>
  streamFinishUnix: Maybe<bigint>
  /** WETH is displayed but never financed in v1. */
  claimableWethWei: Maybe<bigint>
  claimableWeth: DataProvenance
  /** share of the currently streaming WETH remainder (modeled). */
  streamingWethWei: Maybe<bigint>
  streamingWeth: DataProvenance
  streamRemainingWethWei: Maybe<bigint>
  streamFinishWethUnix: Maybe<bigint>
}

export interface FriendPosition {
  /** stable key: `${collection}:${tokenId}` */
  key: string
  collection: CollectionName
  tokenId: string
  /** Generations only. 0 for Genesis. */
  generation: number
  /** tier 0..4, or null when inactive. */
  tier: Maybe<number>
  activated: boolean
  /** a temporary Generation (>=1 RF balance, no reward weight, not transferable) */
  temporary: boolean
  /** allocation weight in micro-units (1e-6) */
  weightMicros: bigint
  weight: DataProvenance
  /** token-bound account that holds this Friend's RF + WETH. */
  walletAddress: Maybe<`0x${string}`>
  /** art source */
  imageUrl: Maybe<string>
  /** where the artwork came from: onchain tokenURI, OpenSea, or nothing */
  artSource: 'onchain' | 'opensea' | 'none'
  traits: { type: string; value: string }[]
  canonicalUrl: Maybe<string>
  name: string
  stateSource: FriendStateSource
  rewards: RewardPosition
  /** set when a live read for this Friend failed */
  error: Maybe<string>
}

export type AdvanceStage = 'none' | 'quoted' | 'active' | 'settled'

export interface AdvanceQuote {
  /** face value of the selected stream slice, in wei */
  faceValueWei: bigint
  /** what the holder receives now */
  youReceiveNowWei: bigint
  /** what settles out of the stream */
  settlementWei: bigint
  /** LP earnings released at settlement */
  lpSpreadWei: bigint
  /** Rare Advance RF burn at settlement */
  rareAdvanceBurnWei: bigint
  discountBps: bigint
  lpSpreadBps: bigint
  rareAdvanceBurnBps: bigint
  /** stream slice length in ms, derived from the global stream finish */
  durationMs: bigint
  quoteKind: 'standard' | 'conservative' | 'competitive'
}

export interface AdvancePosition {
  id: string
  friendKey: string
  quote: AdvanceQuote
  createdAtMs: number
  /** simulated clock, advanced by SIMULATE TIME only */
  elapsedMs: bigint
  settledWei: bigint
  lpEarnedWei: bigint
  burnWei: bigint
  stage: AdvanceStage
  simulated: true
}

export interface LiquidityPool {
  totalLiquidityWei: bigint
  advancesOutstandingWei: bigint
  lpSpreadEarnedWei: bigint
  rareAdvanceBurnedWei: bigint
  rfFinancedIntoActionsWei: bigint
  advancesIssuedWei: bigint
  /** the demo holder's own share of the pool */
  userDepositWei: bigint
  userDepositShareBps: bigint
  userLpEarningsWei: bigint
  simulated: true
}

export type GrowthActionKind = 'activate' | 'hardwire' | 'reactivate' | 'promote' | 'upgrade'

export interface ProtocolActionEffect {
  /** total action cost in wei */
  costWei: bigint
  /** 50% burned by the Rare Friends protocol */
  protocolBurnWei: bigint
  /** 50% funding RF rewards */
  protocolRewardFundingWei: bigint
  weightBeforeMicros: bigint
  weightAfterMicros: bigint
}

export interface GrowthAction {
  id: string
  kind: GrowthActionKind
  friendKey: string
  title: string
  /** e.g. "GEN 3 · TIER 2 -> TIER 3" */
  subject: string
  /**
   * False when the protocol does not determine a single cost from onchain state.
   * A temporary Friend's hardwire price depends on the owner's live RF balance,
   * so no cost is asserted and no financing is modelled for it.
   */
  costKnown: boolean
  effect: ProtocolActionEffect
  /** plain-language consequences, taken from the official docs */
  consequences: string[]
  valid: true
}

export interface GrowthFinanceQuote {
  action: GrowthAction
  userContributionWei: bigint
  financedWei: bigint
  premiumWei: bigint
  repaymentTargetWei: bigint
  premiumToLiquidityProvidersWei: bigint
  premiumToRareAdvanceBurnWei: bigint
  repaymentRoutingBps: bigint
  ownerRoutingBps: bigint
  weightBeforeMicros: bigint
  weightAfterMicros: bigint
  weightIncreaseBps: bigint | null
  /** modeled payback; null when the live inputs are unavailable */
  payback: PaybackModel | null
  paybackProvenance: DataProvenance
}

export interface PaybackModel {
  totalActiveWeightMicros: bigint
  postActionTotalActiveWeightMicros: bigint
  /** share of rewards after the action, in basis points (display only) */
  postActionShareBps: bigint
  /** same share at 1e18 precision, used for the daily-reward math */
  postActionShareWad: bigint
  currentRfStreamRateWeiPerSec: bigint
  modeledRfPerDayWei: bigint
  repaymentRfPerDayWei: bigint
  modeledPaybackSeconds: bigint
}

export interface GrowthFinancePosition {
  id: string
  friendKey: string
  quote: GrowthFinanceQuote
  createdAtMs: number
  elapsedMs: bigint
  repaidWei: bigint
  ownerReceivedWei: bigint
  lpReceivedWei: bigint
  burnWei: bigint
  settled: boolean
  simulated: true
}

export type ConnectionStatus =
  | 'idle'
  | 'discovering'
  | 'choosing'
  | 'requesting-accounts'
  | 'switching-network'
  | 'connected'
  | 'rejected'
  | 'unsupported'
  | 'wrong-network'
  | 'switch-unavailable'
  | 'disconnected'
  | 'error'

export interface WalletState {
  status: ConnectionStatus
  address: `0x${string}` | null
  chainId: number | null
  /** Human-readable, never a raw RPC string. */
  error: string | null
  /** What the user can do next. */
  hint: string | null
}

export type DataStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface LiveDataState {
  status: DataStatus
  error: string | null
  blockNumber: bigint | null
  readAtMs: number | null
  /** documented or onchain protocol metrics */
  totalActiveWeightMicros: bigint | null
  totalActiveWeightProvenance: DataProvenance
  rfStream: {
    pendingWei: bigint | null
    rateWeiPerSec: bigint | null
    finishUnix: bigint | null
    remainderWei: bigint | null
  }
  wethStream: {
    pendingWei: bigint | null
    rateWeiPerSec: bigint | null
    finishUnix: bigint | null
    remainderWei: bigint | null
  }
  prices: { rfUsd: number | null; ethUsd: number | null }
  /**
   * False when not every Rare Friends token id could be checked from this
   * browser. An empty friend list then means "unverified", not "holds nothing".
   */
  discoveryExhaustive: boolean
}

export type SessionMode = 'demo' | 'live'

export interface SessionInsight {
  advancesIssuedWei: bigint
  liquiditySuppliedWei: bigint
  lpSpreadGeneratedWei: bigint
  rareAdvanceBurnedWei: bigint
  rfFinancedIntoActionsWei: bigint
  underlyingProtocolBurnWei: bigint
  underlyingRewardFundingWei: bigint
}
