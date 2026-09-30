/**
 * ADVANCE MATH
 * ============
 *
 * A Rare Advance is NOT a loan. It is the sale of an already-streaming RF
 * receivable at a discount.
 *
 * For a selected face value S:
 *   LP spread       = floor(S * 4%)
 *   Rare Advance burn = floor(S * 1%)
 *   principal       = S - lpSpread - burn          (exactly 95% of S)
 *   holder receives = principal, now
 *   settlement      = S, streamed out of the Friend's reward position
 *
 * The three parts always sum back to S exactly, so rounding can never create
 * or destroy value: `lp + burn + principal === face`.
 *
 * There is no NFT floor, no LTV, no liquidation, no margin call, no credit
 * score and no monthly repayment anywhere in this file.
 */

import { ADVANCE_MARKET_TERMS, SIMULATED_POOL_QUOTES, ADVANCE_ELIGIBILITY } from './rareAdvanceConfig'
import { BPS_SCALE, minRF, mulBps } from '../math/rf'
import type { AdvanceQuote } from '../types'

export const ADVANCE_ZERO: AdvanceQuote = {
  faceValueWei: 0n,
  youReceiveNowWei: 0n,
  settlementWei: 0n,
  lpSpreadWei: 0n,
  rareAdvanceBurnWei: 0n,
  discountBps: ADVANCE_MARKET_TERMS.totalDiscountBps,
  lpSpreadBps: ADVANCE_MARKET_TERMS.lpSpreadBps,
  rareAdvanceBurnBps: ADVANCE_MARKET_TERMS.rareAdvanceBurnBps,
  durationMs: 0n,
  quoteKind: 'standard',
}

export class AdvanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdvanceError'
  }
}

/**
 * Split a face value into its three destination parts.
 * `lp + burn + principal` is exactly the face value for every input.
 */
export function splitFaceValue(
  faceValueWei: bigint,
  lpBps: bigint = ADVANCE_MARKET_TERMS.lpSpreadBps,
  burnBps: bigint = ADVANCE_MARKET_TERMS.rareAdvanceBurnBps,
): { principalWei: bigint; lpSpreadWei: bigint; burnWei: bigint } {
  if (faceValueWei < 0n) throw new AdvanceError('Advance amount cannot be negative.')
  const lp = mulBps(faceValueWei, lpBps)
  const burn = mulBps(faceValueWei, burnBps)
  const principal = faceValueWei - lp - burn
  return { principalWei: principal, lpSpreadWei: lp, burnWei: burn }
}

/**
 * Quote an advance against an eligible streaming amount.
 *
 * @param eligibleWei the Friend's currently-streaming, attributable RF
 * @param bps         the requested slice of that stream
 * @param durationMs  how much stream time the selected slice covers
 */
export function quoteAdvance(
  eligibleWei: bigint,
  bps: bigint,
  durationMs: bigint,
  quoteKind: AdvanceQuote['quoteKind'] = 'standard',
  discountBps: bigint = ADVANCE_MARKET_TERMS.totalDiscountBps,
): AdvanceQuote {
  if (eligibleWei < 0n) throw new AdvanceError('Eligible stream cannot be negative.')
  if (bps < 0n) throw new AdvanceError('Selection cannot be negative.')
  if (bps > BPS_SCALE) throw new AdvanceError('Selection cannot exceed 100% of the stream.')

  const cappedBps = bps > ADVANCE_ELIGIBILITY.maxFaceShareBps ? ADVANCE_ELIGIBILITY.maxFaceShareBps : bps
  const face = mulBps(eligibleWei, cappedBps)

  if (face <= 0n) {
    return { ...ADVANCE_ZERO, durationMs, quoteKind }
  }

  // The holder's discount is exactly the LP spread plus the Rare Advance burn,
  // so a wider pool quote simply shifts that discount between the two.
  const holderBps = BPS_SCALE - discountBps
  const lpBps = discountBps - ADVANCE_MARKET_TERMS.rareAdvanceBurnBps
  const burnBps = ADVANCE_MARKET_TERMS.rareAdvanceBurnBps
  if (holderBps + lpBps + burnBps !== BPS_SCALE) {
    throw new AdvanceError('Advance terms do not sum to 100%.')
  }

  const { principalWei, lpSpreadWei, burnWei } = splitFaceValue(face, lpBps, burnBps)
  const sliceDuration = mulBps(durationMs, cappedBps)

  return {
    faceValueWei: face,
    youReceiveNowWei: principalWei,
    settlementWei: face,
    lpSpreadWei,
    rareAdvanceBurnWei: burnWei,
    discountBps,
    lpSpreadBps: lpBps,
    rareAdvanceBurnBps: burnBps,
    durationMs: sliceDuration,
    quoteKind,
  }
}

/** Quote for one of the SIMULATED POOL QUOTES. Never a real counterparty. */
export function quoteFromSimulatedPool(
  eligibleWei: bigint,
  durationMs: bigint,
  key: (typeof SIMULATED_POOL_QUOTES)[number]['key'],
): AdvanceQuote | null {
  const q = SIMULATED_POOL_QUOTES.find((x) => x.key === key)
  if (!q) return null
  return quoteAdvance(
    eligibleWei,
    BPS_SCALE,
    durationMs,
    q.key === 'standard' ? 'standard' : q.key,
    q.discountBps,
  )
}

/**
 * Validate a user-entered or preset selection against the eligible amount.
 * Returns null when the request is not allowed, so the UI can disable it
 * rather than silently clamping to something the user did not ask for.
 */
export function validateSelection(requestedWei: bigint, eligibleWei: bigint): AdvanceError | null {
  if (requestedWei < 0n) return new AdvanceError('Advance amount cannot be negative.')
  if (requestedWei === 0n) return new AdvanceError('Choose an amount above zero.')
  if (eligibleWei <= 0n) return new AdvanceError('No stream is currently attributable to this Friend.')
  if (requestedWei > eligibleWei) {
    return new AdvanceError('You cannot advance more than the currently streaming amount.')
  }
  return null
}

/** A selection expressed as a basis-point slice of the eligible amount. */
export function selectionToWei(eligibleWei: bigint, bps: bigint): bigint {
  return minRF(mulBps(eligibleWei, bps), eligibleWei)
}

/**
 * The advanceable base. The whole currently-streaming, attributable remainder
 * is the maximum face: claimable RF is already available to the owner and WETH
 * is not financeable in v1.
 */
export function selectEligible(streamingWei: bigint | null): bigint {
  if (streamingWei === null) return 0n
  return streamingWei > 0n ? mulBps(streamingWei, ADVANCE_ELIGIBILITY.maxFaceShareBps) : 0n
}

/**
 * Simulated settlement progress. Streaming is linear over the slice duration,
 * and rounding is applied to the settled amount so it can never exceed the
 * face value.
 */
export function settledAt(quote: AdvanceQuote, elapsedMs: bigint): bigint {
  if (quote.settlementWei === 0n) return 0n
  if (elapsedMs <= 0n) return 0n
  if (elapsedMs >= quote.durationMs) return quote.settlementWei
  if (quote.durationMs === 0n) return quote.settlementWei
  // Integer math, rounded down: settlement can never exceed the face value.
  const settled = (quote.settlementWei * elapsedMs) / quote.durationMs
  return minRF(settled, quote.settlementWei)
}

export function remainingAt(quote: AdvanceQuote, elapsedMs: bigint): bigint {
  return quote.settlementWei - settledAt(quote, elapsedMs)
}

export function isSettled(quote: AdvanceQuote, elapsedMs: bigint): boolean {
  return elapsedMs >= quote.durationMs
}

/**
 * Reconcile a settled advance. The three destinations must sum to the face
 * value exactly. Throws if the economy would leak value.
 */
export function reconcileSettlement(quote: AdvanceQuote): {
  principalWei: bigint
  lpSpreadWei: bigint
  burnWei: bigint
  totalWei: bigint
} {
  const { principalWei, lpSpreadWei, burnWei } = splitFaceValue(
    quote.faceValueWei,
    quote.lpSpreadBps,
    quote.rareAdvanceBurnBps,
  )
  const totalWei = principalWei + lpSpreadWei + burnWei
  if (totalWei !== quote.settlementWei) {
    throw new AdvanceError(
      `Settlement does not reconcile: ${principalWei} + ${lpSpreadWei} + ${burnWei} !== ${quote.settlementWei}`,
    )
  }
  return { principalWei, lpSpreadWei, burnWei, totalWei }
}
