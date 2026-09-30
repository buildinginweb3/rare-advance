/**
 * COMMUNAL LIQUIDITY POOL — MARKET LIMITS
 * ========================================
 *
 * Product-level bounds for Demo Mode, kept in one file so the UI, the
 * validation layer and the tests can never disagree.
 *
 * These are DEMO LIMITS, not protocol facts.
 */

import { BPS_SCALE } from '../math/rf'

/**
 * Maximum LP premium a creator may request, on either market.
 * 25% is deliberately generous: the point is to let the market show that a
 * punitive pool simply gets no borrowers.
 */
export const MAX_LP_PREMIUM_BPS = 2_500n

/**
 * Maximum WETH participation, as a PRODUCT cap.
 *
 * This is the single most important guardrail in the whole market: WETH
 * participation is a temporary LP compensation term, and it must never be able
 * to approach a permanent royalty on a Friend. 25% of modeled WETH rewards,
 * ending the instant RF repayment completes.
 */
export const MAX_WETH_SHARE_BPS = 2_500n

/**
 * Maximum TOTAL WETH participation across concurrently outstanding Growth
 * positions held by one Friend. Split or concurrent financing can never take a
 * Friend's WETH beyond this.
 */
export const MAX_TOTAL_WETH_PARTICIPATION_BPS = 2_500n

/** Maximum single financing position the product allows a pool to open. */
export const MAX_POSITION_RF_WEI = 1_000_000n * 10n ** 18n

/** Guard against a pool being created with absurd capital in the demo. */
export const MAX_POOL_CAPITAL_WEI = 10_000_000n * 10n ** 18n

export const BPS_MAX = BPS_SCALE
