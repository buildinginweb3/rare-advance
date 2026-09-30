/**
 * RARE ADVANCE ECONOMY CONFIGURATION
 * =================================
 *
 * Every number in this file is a RARE ADVANCE DEMO ASSUMPTION, not a Rare
 * Friends protocol constant. Official protocol values live in
 * `src/protocol/rareFriendsConfig.ts` and the two files must never be mixed.
 *
 * Nothing here is production pricing. Nothing here is a promise of return.
 */

export const ADVANCE_MARKET_TERMS = {
  label: 'DEMO MARKET TERMS',
  /**
   * Face value splits three ways, in basis points of the selected stream:
   *   holder receives 95%, LP spread 4%, Rare Advance RF burn 1%.
   * The holder's discount (5%) is exactly the LP spread plus the burn.
   */
  holderShareBps: 9_500n,
  lpSpreadBps: 400n,
  rareAdvanceBurnBps: 100n,
  get totalDiscountBps(): bigint {
    return this.lpSpreadBps + this.rareAdvanceBurnBps
  },
} as const

/**
 * How much of a settled stream a holder may advance.
 * The eligible base is the Friend's ALREADY-ALLOCATED, CURRENTLY-STREAMING
 * share of the reward stream, never an NFT floor and never a projection.
 */
export const ADVANCE_ELIGIBILITY = {
  /** The whole currently-streaming remainder is the maximum advanceable face. */
  maxFaceShareBps: 10_000n,
  /**
   * A Friend's streaming share is derived as
   *   friendWeight / totalActiveWeight * stream.remainder
   * see `src/chain/derive.ts` for the formula and its documentation.
   */
  excludesClaimable: true,
  excludesWeth: true,
} as const

/** Preset buttons on the advance slider. */
export const ADVANCE_PRESETS = [
  { key: 'p25', label: '25%', bps: 2_500n },
  { key: 'p50', label: '50%', bps: 5_000n },
  { key: 'p75', label: '75%', bps: 7_500n },
  { key: 'max', label: 'MAX', bps: 10_000n },
] as const

/**
 * Future Activation Finance (Grow).
 * A Rare Advance financed amount carries a premium that repays from the
 * Friend's FUTURE rewards, routed while financing is outstanding.
 */
export const GROW_FINANCE = {
  /** Premium on the FINANCED principal (not on the full action cost). */
  premiumBps: 500n,
  /** Split of the premium. 80% to LPs, 20% modelled as a Rare Advance burn. */
  premiumToLiquidityProvidersBps: 8_000n,
  premiumToRareAdvanceBurnBps: 2_000n,
  /**
   * Reward routing while financing is outstanding:
   * 75% of the Friend's future RF rewards repay the financing,
   * 25% stays with the owner. After the repayment target is reached the
   * owner receives 100%.
   */
  repaymentRoutingBps: 7_500n,
  ownerRoutingBps: 2_500n,
} as const

/** Contribution presets on the Grow financing slider (of the ACTION COST). */
export const GROW_CONTRIBUTION_PRESETS = [
  { key: 'c0', label: '0%', bps: 0n },
  { key: 'c25', label: '25%', bps: 2_500n },
  { key: 'c50', label: '50%', bps: 5_000n },
] as const

/**
 * The activation-finance hero scenario. Purely illustrative copy: the numbers
 * are stated, the model is simulated, and nothing is executed.
 */
/** The official Genesis active reward weight, quoted here for the hero example. */
const GENESIS_REFERENCE_WEIGHT = '2000000'

export const ACTIVATION_FINANCE_HERO = {
  generationLabel: 'INACTIVE GENESIS',
  actionCost: '100000',
  yourContribution: '25000',
  financed: '75000',
  fromWeight: '0',
  toWeight: GENESIS_REFERENCE_WEIGHT,
} as const

// ---------------------------------------------------------------------------
// Simulated market depth
// ---------------------------------------------------------------------------

/**
 * Optional multi-quote display. These are SIMULATED POOL QUOTES derived from
 * the single demo pool model at different discounts. They are not named
 * counterparties and not real people.
 */
/**
 * Discounts are in basis points of the face value: 100 bps = 1%.
 * These bracket the 5% default market term.
 */
export const SIMULATED_POOL_QUOTES = [
  { key: 'conservative', label: 'Conservative pool', discountBps: 600n },
  { key: 'standard', label: 'Standard pool', discountBps: 500n },
  { key: 'competitive', label: 'Competitive pool', discountBps: 400n },
] as const

/** Simulated quotes are always labelled. Never shown as real counterparties. */
export const SIMULATED_QUOTES_LABEL = 'SIMULATED POOL QUOTES'

// ---------------------------------------------------------------------------
// Demo seed state (deterministic)
// ---------------------------------------------------------------------------

/** The simulated demo wallet starts with a realistic pool of RF liquidity. */
export const DEMO_POOL_SEED = {
  totalLiquidity: '240000',
  advancesOutstanding: '81400',
  lpSpreadEarned: '3820',
  rareAdvanceBurned: '955',
} as const

/** Offered simulated LP deposit shortcuts. */
export const LP_DEPOSIT_PRESETS = ['1000', '5000', '10000'] as const

/**
 * One simulated day of streaming, in ms, for the SIMULATE TIME control.
 * A day is a whole step so a seven-day stream settles in seven taps.
 */
export const SIM_TIME_STEP_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Copy that must never drift into a return promise
// ---------------------------------------------------------------------------

export const NO_PROMISE_COPY = {
  advanceModel: 'MODELED USING CURRENT PROTOCOL ACTIVITY · NOT GUARANTEED · CHANGES AS REWARD FUNDING AND ACTIVE WEIGHT CHANGE',
  poolTerms: 'POOL TERMS ARE SIMULATED',
  weightNotYield:
    'Reward weight is allocation weight. A larger share of the pool is not a guaranteed return, yield or ROI.',
  simulation:
    'Rare Advance settlement is simulated. A production version would require a secure protocol-supported reward-routing, assignment or escrow mechanism so an advance can actually be settled from the reward stream.',
  transferRisk:
    'A production design must also define what happens if the NFT is transferred while an advance is outstanding. Current Rare Friends contracts do not solve this for Rare Advance.',
} as const
