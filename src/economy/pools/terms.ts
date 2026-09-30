/**
 * COMMUNAL LIQUIDITY POOL — DEMO GUARDRAILS
 * ===========================================
 *
 * Every bound lives here so a pool creator cannot build a mathematically
 * nonsensical pool, and so the product limits are stated in one place.
 *
 * Guardrails stop INVALID terms. They deliberately do NOT stop UNATTRACTIVE
 * terms: a pool that offers a silly premium may simply never get chosen, and
 * that is the market working, not a bug.
 */

import { BPS_SCALE, mulBps } from '../../math/rf'
import type { PoolTerms } from './types'
import { MAX_WETH_SHARE_BPS, MAX_LP_PREMIUM_BPS } from '../marketLimits'

export const BPS_MAX = BPS_SCALE

/** What a creator picks from for the WETH participation term, up to 100%. */
export const WETH_SHARE_PRESETS = [0n, 2_500n, 5_000n, 7_500n, 10_000n] as const

/**
 * What a creator picks from for LP premium.
 *
 * The top range is far beyond any sane price. That is intentional: a pool may
 * price itself out of the market, and seeing that happen is more honest than
 * forbidding the number.
 */
export const PREMIUM_PRESETS = [300n, 500n, 1_000n, 2_500n, 5_000n] as const

/**
 * How much of a Growth action a pool may finance.
 *
 * This is NOT a creator setting and is deliberately absent from the pool wizard.
 * A pool funds what an action needs; capping that would not make the pool
 * safer, because every borrower repays the same premium on whatever they took.
 */
export const DEFAULT_MAX_FINANCE_BPS = 10_000n

/** What a creator picks from for RF repayment routing, up to 100%. */
export const RF_ROUTING_PRESETS = [5_000n, 6_500n, 7_500n, 9_000n, 10_000n] as const

/** Rare Friends streams last seven days; there is no other supported mechanism. */
export const PROTOCOL_STREAM_DURATION_MS = 7n * 24n * 60n * 60n * 1000n

export interface TermsValidation {
  ok: boolean
  errors: string[]
  /** Non-blocking notes, e.g. "this is an unusual premium". */
  warnings: string[]
}

/**
 * Validate a set of terms. Pure, no side effects, no thrown errors.
 */
export function validateTerms(terms: PoolTerms): TermsValidation {
  const errors: string[] = []
  const warnings: string[] = []

  const pct = (bps: bigint) => `${Number(bps) / 100}%`

  // ---- Stream ----
  if (terms.streamPremiumBps < 0n || terms.streamPremiumBps > MAX_LP_PREMIUM_BPS) {
    errors.push(`LP premium must be between 0% and ${pct(MAX_LP_PREMIUM_BPS)}.`)
  } else if (terms.streamPremiumBps > 1_500n) {
    warnings.push('That LP premium is far above the demo default. Borrowers may skip this pool.')
  }
  if (terms.rareAdvanceFeeBps < 0n || terms.rareAdvanceFeeBps > MAX_LP_PREMIUM_BPS) {
    errors.push(`Rare Advance fee must be between 0% and ${pct(MAX_LP_PREMIUM_BPS)}.`)
  }
  if (terms.maxAdvanceShareBps <= 0n || terms.maxAdvanceShareBps > BPS_SCALE) {
    errors.push('Maximum advance must be greater than 0% and at most 100%.')
  }
  if (terms.maxStreamPositionWei <= 0n) {
    errors.push('Maximum Stream Advance size must be above zero.')
  }

  // ---- Growth ----
  if (terms.growthPremiumBps < 0n || terms.growthPremiumBps > MAX_LP_PREMIUM_BPS) {
    errors.push(`Growth RF premium must be between 0% and ${pct(MAX_LP_PREMIUM_BPS)}.`)
  } else if (terms.growthPremiumBps > 2_000n) {
    warnings.push('That Growth RF premium is very high. Borrowers may skip this pool.')
  }
  if (terms.growthMaxFinanceBps <= 0n || terms.growthMaxFinanceBps > BPS_SCALE) {
    errors.push('Financing share must be greater than 0% and at most 100%.')
  } else if (terms.growthMaxFinanceBps > 9_000n) {
    warnings.push('Financing more than 90% of an action leaves very little owner alignment.')
  }
  if (terms.growthRfRoutingBps <= 0n || terms.growthRfRoutingBps > BPS_SCALE) {
    errors.push('RF repayment routing must be greater than 0% and at most 100%.')
  }
  if (terms.growthWethShareBps < 0n || terms.growthWethShareBps > MAX_WETH_SHARE_BPS) {
    errors.push(`WETH share must be between 0% and ${pct(MAX_WETH_SHARE_BPS)}.`)
  }
  if (terms.growthMaxPositionWei <= 0n) {
    errors.push('Maximum Growth financing size must be above zero.')
  }
  if (terms.eligibleActions.length === 0) {
    errors.push('Choose at least one Rare Friends action this pool can finance.')
  }
  if (
    terms.eligibleGenerations !== null &&
    (terms.eligibleGenerations.length === 0 ||
      terms.eligibleGenerations.some((g) => g < 1 || g > 6))
  ) {
    errors.push('Generation eligibility must be empty-disabled or generations 1 to 6.')
  }

  // ---- Cross-check: a pool must be able to fund something ----
  const streamSum = terms.streamPremiumBps + terms.rareAdvanceFeeBps
  if (terms.streamPremiumBps > 0n || terms.rareAdvanceFeeBps > 0n) {
    if (streamSum >= BPS_SCALE) {
      errors.push('LP premium plus the Rare Advance fee must leave the holder something.')
    }
  }
  const growthTarget = mulBps(terms.growthPremiumBps, terms.growthMaxFinanceBps)
  if (growthTarget >= BPS_SCALE) {
    errors.push('Growth premium on the financed share must leave the repayment target below the action cost.')
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * The most generous terms the product allows. Used as the wizard's ceiling, and
 * asserted valid in the test suite so the ceiling can never be a lie.
 */
export function maxTerms(overrides: Partial<PoolTerms> = {}): PoolTerms {
  return {
    streamPremiumBps: 0n,
    rareAdvanceFeeBps: 0n,
    maxAdvanceShareBps: BPS_SCALE,
    maxStreamPositionWei: 500_000n * 10n ** 18n,

    growthPremiumBps: 0n,
    growthMaxFinanceBps: BPS_SCALE,
    growthRfRoutingBps: BPS_SCALE,
    growthWethShareBps: MAX_WETH_SHARE_BPS,
    growthMaxPositionWei: 500_000n * 10n ** 18n,

    eligibleActions: ['activate', 'hardwire', 'upgrade', 'promote'],
    eligibleGenerations: null,
    ...overrides,
  }
}

/**
 * Minimum owner contribution, DERIVED from maximum financing so the two can
 * never contradict each other in the UI.
 */
export function minOwnerContributionBps(terms: PoolTerms): bigint {
  const min = BPS_SCALE - terms.growthMaxFinanceBps
  return min > 0n ? min : 0n
}

/**
 * Total WETH participation a set of concurrent Growth positions would take.
 * Used to enforce the product-level cap when financing is split or concurrent.
 */
export function totalWethParticipationBps(shares: bigint[]): bigint {
  return shares.reduce((a, b) => a + b, 0n)
}

/** Renders terms the way a borrower reads them. */
export interface TermsSummaryLine {
  label: string
  value: string
}

export function describeTerms(terms: PoolTerms, kind: 'stream' | 'growth'): TermsSummaryLine[] {
  const pct = (bps: bigint) => `${Number(bps) / 100}%`
  if (kind === 'stream') {
    return [
      { label: 'LP premium', value: pct(terms.streamPremiumBps) },
      { label: 'Rare Advance fee', value: pct(terms.rareAdvanceFeeBps) },
      { label: 'Maximum advance', value: pct(terms.maxAdvanceShareBps) },
    ]
  }
  return [
    { label: 'LP premium on financed RF', value: pct(terms.growthPremiumBps) },
    { label: 'Borrower pays upfront', value: pct(minOwnerContributionBps(terms)) },
    { label: 'RF rewards → repayment', value: pct(terms.growthRfRoutingBps) },
    { label: 'WETH rewards → pool', value: pct(terms.growthWethShareBps) },
  ]
}
