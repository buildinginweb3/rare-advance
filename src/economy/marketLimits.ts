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
 *
 * 100% is deliberately far beyond anything sensible. The point is to let the
 * market show that a punitive pool simply gets no borrowers, rather than
 * capping the number a creator is even allowed to imagine.
 */
export const MAX_LP_PREMIUM_BPS = 10_000n

/**
 * Maximum WETH participation, as a PRODUCT cap.
 *
 * A pool may now ask for the whole modeled WETH stream, which is a real and
 * sometimes reasonable trade: an expensive financing that is certain to be
 * repaid may be worth far more than half a year of WETH. Participation is still
 * TEMPORARY and ends the instant RF repayment completes, so even a 100% share
 * cannot become a permanent royalty on a Friend.
 */
export const MAX_WETH_SHARE_BPS = 10_000n

/**
 * Maximum TOTAL WETH participation across concurrently outstanding Growth
 * positions held by one Friend. A single position may take up to the cap above;
 * splitting or stacking concurrent financing can never exceed it.
 */
export const MAX_TOTAL_WETH_PARTICIPATION_BPS = 10_000n

/** Maximum single financing position the product allows a pool to open. */
export const MAX_POSITION_RF_WEI = 1_000_000n * 10n ** 18n

/** Guard against a pool being created with absurd capital in the demo. */
export const MAX_POOL_CAPITAL_WEI = 10_000_000n * 10n ** 18n

export const BPS_MAX = BPS_SCALE
