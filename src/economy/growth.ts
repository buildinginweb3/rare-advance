/**
 * FUTURE ACTIVATION FINANCE MATH
 * ==============================
 *
 * GROWTH financing is a SEPARATE layer from the reward advance, and the two
 * burns are deliberately never combined:
 *
 *   1. The underlying Rare Friends action has its own protocol economics:
 *        50% RF burned by the protocol, 50% funding RF rewards.
 *   2. Rare Advance adds a financing premium on the FINANCED principal:
 *        5% premium, of which 80% goes to liquidity providers and 20% is
 *        modelled as an additional Rare Advance burn.
 *
 *   financed          = actionCost - userContribution
 *   premium           = 5% of financed
 *   repaymentTarget   = financed + premium
 *   premium split     = 80% liquidity providers / 20% Rare Advance burn
 *
 * While financing is outstanding, 75% of the Friend's future RF rewards route
 * to repayment and 25% stays with the owner. After the target is reached the
 * owner receives 100%.
 *
 * THIS IS A SIMULATION. The Rare Friends contracts do not currently support
 * this reward routing and Rare Advance cannot intercept protocol reward
 * payments.
 */

import { GROW_FINANCE } from './rareAdvanceConfig'
import { BPS_SCALE, mulBps, minRF, mulDivFloor, weightChangeBps } from '../math/rf'
import type {
  GrowthAction,
  GrowthFinanceQuote,
  PaybackModel,
  ProtocolActionEffect,
} from '../types'

export class FinanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinanceError'
  }
}

export function validateContribution(contributionWei: bigint, actionCostWei: bigint): FinanceError | null {
  if (contributionWei < 0n) return new FinanceError('Contribution cannot be negative.')
  if (contributionWei > actionCostWei) {
    return new FinanceError('Contribution cannot exceed the action cost.')
  }
  return null
}

export interface GrowthFinanceBreakdown {
  userContributionWei: bigint
  financedWei: bigint
  premiumWei: bigint
  repaymentTargetWei: bigint
  premiumToLiquidityProvidersWei: bigint
  premiumToRareAdvanceBurnWei: bigint
  protocol: ProtocolActionEffect
  /** every RF destination, kept separate so nothing is conflated */
  destinations: {
    protocolBurnWei: bigint
    protocolRewardFundingWei: bigint
    userContributionWei: bigint
    liquidityProvidersWei: bigint
    rareAdvanceBurnWei: bigint
  }
}

/**
 * Exact breakdown of a partially-funded Rare Friends action.
 * `premiumToLP + premiumToBurn` always equals `premium`.
 */
export function breakdownFinance(
  action: GrowthAction,
  userContributionWei: bigint,
): GrowthFinanceBreakdown {
  const invalid = validateContribution(userContributionWei, action.effect.costWei)
  if (invalid) throw invalid

  const cost = action.effect.costWei
  const financed = cost - userContributionWei
  const premium = mulBps(financed, GROW_FINANCE.premiumBps)
  const repaymentTarget = financed + premium
  const toLp = mulBps(premium, GROW_FINANCE.premiumToLiquidityProvidersBps)
  const toBurn = premium - toLp

  if (toLp + toBurn !== premium) {
    throw new FinanceError('Financing premium split does not reconcile.')
  }

  return {
    userContributionWei,
    financedWei: financed,
    premiumWei: premium,
    repaymentTargetWei: repaymentTarget,
    premiumToLiquidityProvidersWei: toLp,
    premiumToRareAdvanceBurnWei: toBurn,
    protocol: action.effect,
    destinations: {
      protocolBurnWei: action.effect.protocolBurnWei,
      protocolRewardFundingWei: action.effect.protocolRewardFundingWei,
      userContributionWei,
      liquidityProvidersWei: toLp,
      rareAdvanceBurnWei: toBurn,
    },
  }
}

/**
 * Modeled payback.
 *
 *   postActionShare = postActionWeight / projectedTotalActiveWeight
 *   modeledRfPerDay = currentRfStreamRate * 86400 * postActionShare
 *   repaymentRfPerDay = modeledRfPerDay * repaymentRoutingShare
 *   modeledPaybackDays = repaymentTarget / repaymentRfPerDay
 *
 * Returns null when the live inputs are unavailable. A missing live input is
 * never replaced with an invented "live APR": the caller shows a demo
 * scenario instead.
 */
export function modelPayback(
  repaymentTargetWei: bigint,
  weightAfterMicros: bigint,
  currentWeightMicros: bigint,
  totalActiveWeightMicros: bigint | null,
  rfStreamRateWeiPerSec: bigint | null,
): PaybackModel | null {
  if (repaymentTargetWei <= 0n) return null
  if (totalActiveWeightMicros === null || totalActiveWeightMicros <= 0n) return null
  if (rfStreamRateWeiPerSec === null || rfStreamRateWeiPerSec <= 0n) return null
  if (weightAfterMicros <= 0n) return null

  const projectedTotal =
    totalActiveWeightMicros - minRF(currentWeightMicros, totalActiveWeightMicros) + weightAfterMicros
  if (projectedTotal <= 0n) return null

  // The share is computed at 1e18 precision, NOT at basis points: a Generation
  // Friend can hold a weight so small against total network weight that its
  // share is well under one basis point, and rounding that to zero would
  // silently report a zero yield.
  const postActionShareWad = mulDivFloor(weightAfterMicros, SHARE_SCALE, projectedTotal)
  const postActionShareBps = postActionShareWad / (SHARE_SCALE / BPS_SCALE)

  const rfPerDayWei = (rfStreamRateWeiPerSec * 86_400n) / 1n
  const modeledRfPerDayWei = mulDivFloor(rfPerDayWei, postActionShareWad, SHARE_SCALE)
  const repaymentRfPerDayWei = mulDivFloor(modeledRfPerDayWei, GROW_FINANCE.repaymentRoutingBps, BPS_SCALE)

  if (repaymentRfPerDayWei <= 0n) return null

  const seconds = mulDivFloor(repaymentTargetWei, SHARE_SCALE, repaymentRfPerDayWei)

  return {
    totalActiveWeightMicros: totalActiveWeightMicros,
    postActionTotalActiveWeightMicros: projectedTotal,
    postActionShareBps,
    postActionShareWad,
    currentRfStreamRateWeiPerSec: rfStreamRateWeiPerSec,
    modeledRfPerDayWei,
    repaymentRfPerDayWei,
    modeledPaybackSeconds: seconds,
  }
}

/** 1e18 fixed-point scale for share ratios. */
const SHARE_SCALE = 10n ** 18n

export interface QuoteInput {
  action: GrowthAction
  userContributionWei: bigint
  totalActiveWeightMicros: bigint | null
  rfStreamRateWeiPerSec: bigint | null
  /** when the live rate is missing, an explicitly DEMO scenario rate is used */
  demoRfStreamRateWeiPerSec?: bigint | null
  totalActiveWeightProvenance: 'onchain' | 'simulated'
}

export function quoteGrowthFinance(input: QuoteInput): GrowthFinanceQuote {
  const b = breakdownFinance(input.action, input.userContributionWei)
  const live =
    input.totalActiveWeightMicros !== null && input.rfStreamRateWeiPerSec !== null

  const payback = live
    ? modelPayback(
        b.repaymentTargetWei,
        b.protocol.weightAfterMicros,
        b.protocol.weightBeforeMicros,
        input.totalActiveWeightMicros,
        input.rfStreamRateWeiPerSec,
      )
    : modelPayback(
        b.repaymentTargetWei,
        b.protocol.weightAfterMicros,
        b.protocol.weightBeforeMicros,
        input.totalActiveWeightMicros ?? input.demoRfStreamRateWeiPerSec ?? null,
        input.rfStreamRateWeiPerSec ?? input.demoRfStreamRateWeiPerSec ?? null,
      )

  const before = b.protocol.weightBeforeMicros
  const after = b.protocol.weightAfterMicros
  const weightIncreaseBps = weightChangeBps(before, after)

  return {
    action: input.action,
    userContributionWei: b.userContributionWei,
    financedWei: b.financedWei,
    premiumWei: b.premiumWei,
    repaymentTargetWei: b.repaymentTargetWei,
    premiumToLiquidityProvidersWei: b.premiumToLiquidityProvidersWei,
    premiumToRareAdvanceBurnWei: b.premiumToRareAdvanceBurnWei,
    repaymentRoutingBps: GROW_FINANCE.repaymentRoutingBps,
    ownerRoutingBps: GROW_FINANCE.ownerRoutingBps,
    weightBeforeMicros: before,
    weightAfterMicros: after,
    weightIncreaseBps,
    payback,
    paybackProvenance: live ? 'modeled' : 'simulated',
  }
}

/**
 * Route one day of a Friend's future RF rewards while financing is
 * outstanding. After the target is reached the owner receives 100%.
 */
export function routeFutureRewards(
  quote: GrowthFinanceQuote,
  earnedWei: bigint,
  alreadyRepaidWei: bigint,
): {
  repaymentWei: bigint
  ownerWei: bigint
  outstandingAfterWei: bigint
  settled: boolean
  /** invariant: the repayment applied is never larger than the outstanding target */
  repaidNeverExceeds: boolean
} {
  const outstanding = quote.repaymentTargetWei - alreadyRepaidWei
  if (outstanding <= 0n) {
    return {
      repaymentWei: 0n,
      ownerWei: earnedWei,
      outstandingAfterWei: 0n,
      settled: true,
      repaidNeverExceeds: true,
    }
  }
  const toRepayment = mulBps(earnedWei, quote.repaymentRoutingBps)
  const toOwner = earnedWei - toRepayment
  const applied = minRF(toRepayment, outstanding)
  return {
    repaymentWei: applied,
    ownerWei: toOwner,
    outstandingAfterWei: outstanding - applied,
    settled: outstanding - applied === 0n,
    repaidNeverExceeds: applied <= outstanding,
  }
}

/** How the repayment target is made up. Never merged with the protocol split. */
export interface PremiumLedger {
  financedWei: bigint
  premiumToLiquidityProvidersWei: bigint
  premiumToRareAdvanceBurnWei: bigint
  totalRepaymentWei: bigint
}

export function premiumLedger(quote: GrowthFinanceQuote): PremiumLedger {
  return {
    financedWei: quote.financedWei,
    premiumToLiquidityProvidersWei: quote.premiumToLiquidityProvidersWei,
    premiumToRareAdvanceBurnWei: quote.premiumToRareAdvanceBurnWei,
    totalRepaymentWei: quote.repaymentTargetWei,
  }
}
