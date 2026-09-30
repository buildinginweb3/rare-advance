/**
 * SIMULATED LIQUIDITY POOL
 * ========================
 *
 * The other side of the same economy: liquidity providers supply RF and earn
 * the spread as reward streams settle.
 *
 * This module deliberately computes NO yield, NO APY and NO annualised return.
 * A 5-day advance cannot be honestly annualised and is not presented as if it
 * could. What is shown is the RF spread, the discount and the remaining stream
 * duration, which are the real numbers.
 */

import { BPS_SCALE, mulBps, mulDivFloor } from '../math/rf'
import type { LiquidityPool } from '../types'

export interface PoolSeed {
  totalLiquidityWei: bigint
  advancesOutstandingWei: bigint
  lpSpreadEarnedWei: bigint
  rareAdvanceBurnedWei: bigint
  advancesIssuedWei: bigint
  rfFinancedIntoActionsWei: bigint
  userDepositWei: bigint
}

export const EMPTY_POOL: LiquidityPool = {
  totalLiquidityWei: 0n,
  advancesOutstandingWei: 0n,
  lpSpreadEarnedWei: 0n,
  rareAdvanceBurnedWei: 0n,
  rfFinancedIntoActionsWei: 0n,
  advancesIssuedWei: 0n,
  userDepositWei: 0n,
  userDepositShareBps: 0n,
  userLpEarningsWei: 0n,
  simulated: true,
}

export function buildPool(seed: PoolSeed): LiquidityPool {
  const available = seed.totalLiquidityWei - seed.advancesOutstandingWei
  if (available < 0n) {
    throw new Error('Pool: advances outstanding exceed total liquidity.')
  }
  const userShare =
    seed.totalLiquidityWei > 0n
      ? mulDivFloor(seed.userDepositWei, BPS_SCALE, seed.totalLiquidityWei)
      : 0n
  return {
    totalLiquidityWei: seed.totalLiquidityWei,
    advancesOutstandingWei: seed.advancesOutstandingWei,
    lpSpreadEarnedWei: seed.lpSpreadEarnedWei,
    rareAdvanceBurnedWei: seed.rareAdvanceBurnedWei,
    rfFinancedIntoActionsWei: seed.rfFinancedIntoActionsWei,
    advancesIssuedWei: seed.advancesIssuedWei,
    userDepositWei: seed.userDepositWei,
    userDepositShareBps: userShare,
    // The depositor's cut of spread already earned, pro rata. Not a projection.
    userLpEarningsWei: mulBps(seed.lpSpreadEarnedWei, userShare),
    simulated: true,
  }
}

export function poolAvailable(pool: LiquidityPool): bigint {
  const v = pool.totalLiquidityWei - pool.advancesOutstandingWei
  return v > 0n ? v : 0n
}

/** Utilisation as basis points: advances outstanding / total liquidity. */
export function poolUtilizationBps(pool: LiquidityPool): bigint {
  if (pool.totalLiquidityWei <= 0n) return 0n
  return (pool.advancesOutstandingWei * BPS_SCALE) / pool.totalLiquidityWei
}

export function addDeposit(pool: LiquidityPool, amountWei: bigint): LiquidityPool {
  if (amountWei <= 0n) throw new Error('Pool: deposit must be above zero.')
  return buildPool({
    totalLiquidityWei: pool.totalLiquidityWei + amountWei,
    advancesOutstandingWei: pool.advancesOutstandingWei,
    lpSpreadEarnedWei: pool.lpSpreadEarnedWei,
    rareAdvanceBurnedWei: pool.rareAdvanceBurnedWei,
    rfFinancedIntoActionsWei: pool.rfFinancedIntoActionsWei,
    advancesIssuedWei: pool.advancesIssuedWei,
    userDepositWei: pool.userDepositWei + amountWei,
  })
}

/**
 * Can this quote actually be filled by the pool? A thin pool is a real
 * constraint, so the UI disables the action rather than showing an unfillable
 * quote.
 */
export function canFill(pool: LiquidityPool, youReceiveWei: bigint): boolean {
  return poolAvailable(pool) >= youReceiveWei
}
