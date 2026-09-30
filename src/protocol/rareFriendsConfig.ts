/**
 * OFFICIAL RARE FRIENDS PROTOCOL CONFIGURATION
 * ==========================================
 *
 * This module is the single source of truth for every *protocol* constant used
 * by Rare Advance. Nothing in here is a Rare Advance assumption.
 *
 * Source of truth (re-verified for this build):
 *   - Rare Friends Docs / Genesis      -> https://rarefriends.com/docs/genesis
 *   - Rare Friends Docs / Generations  -> https://rarefriends.com/docs/generations
 *   - Rare Friends Docs / Economy      -> https://rarefriends.com/docs/economy
 *   - Rare Friends Docs / Contracts    -> https://rarefriends.com/docs/contracts
 *   - Robinhood Chain docs / Connecting-> https://docs.robinhood.com/chain/connecting
 *   - Onchain read-back of ActivationManager.totalWeight() and
 *     ActivationManager.positions() on Robinhood Chain mainnet.
 *
 * Verified 2026-09-29 against the pages above and against live contract reads.
 * Reward weights below are re-read from the chain at runtime in live mode; the
 * numbers here are the documented reference table used for Demo Mode and Grow
 * projections.
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export const RARE_FRIENDS_CHAIN_ID = 4663

/** Official documented public endpoint. Do not replace with a stale URL. */
export const OFFICIAL_ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com'

export const RARE_FRIENDS_BLOCK_EXPLORER = 'https://robinhoodchain.blockscout.com'

// ---------------------------------------------------------------------------
// Contracts (from rarefriends.com/docs/contracts)
// ---------------------------------------------------------------------------

export const CONTRACTS = {
  genesis: '0x116EaA62241751E0c98dA43d458600c6C17cD361',
  generations: '0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D',
  rareFriends: '0x0779369854d3EcdEA927206718FFD7730C67B71f',
  activationManager: '0xD4A35e11318E3679168d409184B788bcF9F283Ac',
  hook: '0x7A65d0194e6Cc43971C31CE7D1471Da01D42A0cC',
  market: '0x99930E551b6f849bAabC4B491053eF28a700C4F2',
  reserve: '0xA850B2499c064900EfF341745807e1cB0d71a52b',
  clanker: '0x0af64eC6f2Cf0A499411eeB428bA8A9AcD0E05fA',
  sharedArtworkRenderer: '0x608161cC3671619B2D020Eed5fa0720b356874e5',
  genesisMetadataAdapter: '0x473d12Cd65F97Dd3Da20566cD120618F646C37E3',
  generationsMetadataAdapter: '0x3A243E7f46970275CaE8375b0032e53dF91a9110',
  tokenBoundAccountImplementation: '0xED038886c002B285EB0f74971e967B02F6af8ea5',
  // Reward assets read from the official Rare Friends client integration.
  // WETH / USDG are not listed on the docs contracts table but are read by the
  // official portfolio from these addresses, so they are verified the same way.
  weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  usdg: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
} as const

export type CollectionKey = 'genesis' | 'generations'

export const COLLECTION_ADDRESS: Record<CollectionKey, `0x${string}`> = {
  genesis: CONTRACTS.genesis as `0x${string}`,
  generations: CONTRACTS.generations as `0x${string}`,
}

/** OpenSea v2 chain slug for Robinhood Chain (verified against the v2 API). */
export const OPENSEA_CHAIN = 'robinhood'

export const OPENSEA_CONTRACT_SLUG: Record<CollectionKey, string> = {
  genesis: 'rare-friends-genesis',
  generations: 'rare-friends-generations',
}

// ---------------------------------------------------------------------------
// Token + reward mechanics
// ---------------------------------------------------------------------------

/** $RAREFRIENDS is 18 decimals. */
export const RF_DECIMALS = 18

/** Rewards are RF and WETH and are accounted for separately. Never merged. */
export const REWARD_ASSETS = {
  rf: { symbol: 'RF', address: CONTRACTS.rareFriends, decimals: RF_DECIMALS, financeable: true },
  weth: { symbol: 'WETH', address: CONTRACTS.weth, decimals: 18, financeable: false },
} as const

/**
 * Every activation / hardwire / promote / upgrade payment splits:
 *   50% RF burned, 50% RF funds RF rewards.
 * Genesis reserve fees are 100% reward funding and are never burned.
 */
export const ACTION_FEE_SPLIT = {
  burnShareBps: 5_000n,
  rewardShareBps: 5_000n,
} as const

/** RF and WETH stream separately over seven days. */
export const REWARD_STREAM_DURATION_SECONDS = 7 * 24 * 60 * 60

/**
 * Protocol market: the WETH-side trading fee funds WETH rewards.
 * Display-only. Rare Advance v1 finances RF only.
 */
export const MARKET_FEE_TO_WETH_REWARDS = '5% of the WETH-side fee funds WETH rewards.'

/**
 * Allocation method, verbatim from the Economy docs:
 *   share = friend reward weight / total active reward weight
 *   (Genesis and Generations share the same pool; no fixed collection split.)
 */
export const REWARD_SHARE_FORMULA =
  'friend reward weight / total active reward weight (Genesis and Generations share one pool)'

// ---------------------------------------------------------------------------
// Genesis
// ---------------------------------------------------------------------------

export const GENESIS = {
  /** Official cap. */
  maxSupply: 1_024,
  /** Verified onchain: positions(genesis, 1).weight === 2_000_000e18 */
  activationCost: '100000',
  activeRewardWeight: '2000000',
  /** Genesis has no hardwire, no promotion and no tier upgrades. */
  canHardwire: false,
  canPromote: false,
  canUpgrade: false,
  canReactivate: false,
} as const

// ---------------------------------------------------------------------------
// Generations
// ---------------------------------------------------------------------------

export const GENERATION_COUNT = 6
export const TIER_COUNT = 5 // tiers 0..4
export const MAX_TIER = 4

/**
 * Documented hardwire / base weight / reactivation table (RF).
 * Values are decimal strings so they are parsed exactly into 18-decimal
 * bigint wei. Never parsed through Number.
 */
export interface GenerationSchedule {
  readonly generation: number
  readonly hardwire: string
  readonly baseWeight: string
  readonly reactivate: string
  /** Every upgrade payment, indexed by the tier it upgrades FROM. */
  readonly upgrades: readonly string[]
  /** Allocation weight at each tier 0..MAX_TIER. */
  readonly tierWeights: readonly string[]
}

export const GENERATION_SCHEDULE: readonly GenerationSchedule[] = [
  {
    generation: 1,
    hardwire: '100000',
    baseWeight: '175000',
    reactivate: '10000',
    upgrades: ['50000', '75000', '112500', '168750'],
    tierWeights: ['175000', '270000', '416250', '641250', '987187.5'],
  },
  {
    generation: 2,
    hardwire: '10000',
    baseWeight: '16000',
    reactivate: '1000',
    upgrades: ['5000', '7500', '11250', '16875'],
    tierWeights: ['16000', '24375', '37125', '56531.25', '86062.5'],
  },
  {
    generation: 3,
    hardwire: '1000',
    baseWeight: '1450',
    reactivate: '100',
    upgrades: ['500', '750', '1125', '1687.5'],
    tierWeights: ['1450', '2212.5', '3375', '5146.875', '7846.875'],
  },
  {
    generation: 4,
    hardwire: '100',
    baseWeight: '130',
    reactivate: '10',
    upgrades: ['50', '75', '112.5', '168.75'],
    tierWeights: ['130', '198.75', '303.75', '464.0625', '708.75'],
  },
  {
    generation: 5,
    hardwire: '10',
    baseWeight: '12',
    reactivate: '1',
    upgrades: ['5', '7.5', '11.25', '16.875'],
    tierWeights: ['12', '18.375', '28.125', '43.03125', '65.8125'],
  },
  {
    generation: 6,
    hardwire: '1',
    baseWeight: '1.1',
    reactivate: '0.1',
    upgrades: ['0.5', '0.75', '1.125', '1.6875'],
    tierWeights: ['1.1', '1.6875', '2.5875', '3.965625', '6.075'],
  },
] as const

/**
 * Adjacent promotion cost in RF, in the documented order:
 *   [0] Gen 6 -> Gen 5      [1] Gen 5 -> Gen 4      [2] Gen 4 -> Gen 3
 *   [3] Gen 3 -> Gen 2      [4] Gen 2 -> Gen 1
 * A promotion moves a Friend ONE generation earlier and RESETS TIER TO 0.
 * A Generation can never promote into Genesis.
 * Lookup helper: promotionCostFor(generation).
 */
export const PROMOTION_COSTS_EARLIER: readonly string[] = ['9', '90', '900', '9000', '90000']

/**
 * The Generations docs state that promoting from Gen 6 all the way to Gen 1
 * costs 100,000 RF in total. The published adjacent ladder sums to 99,999 RF;
 * the docs round. The adjacent ladder is authoritative and is what the app
 * uses, so the 6->1 total here is the exact sum, not the rounded figure.
 */
export const PROMOTION_LADDER_SUM_6_TO_1 = '99999'

/** 10% of a generation's hardwire price, per the Generations docs. */
export const REACTIVATION_HARDFWIRE_SHARE_BPS = 1_000n

/**
 * Mechanics that the UI must never contradict.
 */
export const PROTOCOL_RULES = [
  'A direct transfer or sale clears activation and upgrades.',
  'Reactivation restarts at tier 0. Previous upgrade payments are not refunded or credited.',
  'Promotion resets tier to 0 and can never move a Generation into Genesis.',
  'Upgrades are sequential: tier n -> n+1 only.',
  'Reward weight is ALLOCATION weight, not tokens, yield, return or ROI.',
  'Activation earns from that point forward, never rewards streamed before activation.',
  'Rewards never mint new RF. Rewards belong to the Friend and follow the NFT.',
] as const
