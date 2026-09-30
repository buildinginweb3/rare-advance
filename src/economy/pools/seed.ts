/**
 * SIMULATED DEMO MARKET SEED
 * ===========================
 *
 * Seed pools that make the MARKET visible on first load, so a judge can see
 * competing capital immediately instead of a single protocol pool.
 *
 * These are EXPLICITLY SIMULATED DEMO POOLS. They are not real people, not real
 * market makers, and no named party implies a real counterparty.
 *
 * The set is chosen so the tradeoffs are legible:
 *   - a broad default pool
 *   - a cheaper Stream pool with less liquidity
 *   - a high-financing Growth pool that takes a WETH share
 *   - a balanced Growth pool
 *   - a private pool, to show that private volume is not public liquidity
 */

import { BPS_SCALE } from '../../math/rf'
import { createPool } from './engine'
import type { Pool, PoolAccess, PoolTerms } from './types'

const ALL_ACTIONS: PoolTerms['eligibleActions'] = [
  'activate',
  'hardwire',
  'reactivate',
  'promote',
  'upgrade',
]

export function publicAccess(inviteCode: string | null = null): PoolAccess {
  return {
    visibility: 'public',
    inviteCode,
    privateLiquidityAccess: 'invited',
    privateBorrowerAccess: 'invited',
    allowlistedLps: [],
  }
}

export const DEMO_INVITE_CODE = 'FRIENDS'

export function privateAccess(): PoolAccess {
  return {
    visibility: 'private',
    inviteCode: DEMO_INVITE_CODE,
    privateLiquidityAccess: 'invited',
    privateBorrowerAccess: 'invited',
    // Demo Mode grants the local user access so the private badge is visible
    // without pretending a real invitation was issued to anyone.
    allowlistedLps: ['you'],
  }
}

/** The exact demo defaults: 4% LP premium, 1% Rare Advance fee. */
export const DEMO_STREAM_PREMIUM_BPS = 400n
export const DEMO_RARE_ADVANCE_FEE_BPS = 100n

export function defaultTerms(overrides: Partial<PoolTerms> = {}): PoolTerms {
  return {
    streamPremiumBps: DEMO_STREAM_PREMIUM_BPS,
    rareAdvanceFeeBps: DEMO_RARE_ADVANCE_FEE_BPS,
    maxAdvanceShareBps: BPS_SCALE,
    maxStreamPositionWei: 50_000n * 10n ** 18n,

    growthPremiumBps: 500n,
    growthMaxFinanceBps: 7_500n,
    growthRfRoutingBps: 7_500n,
    growthWethShareBps: 0n,
    growthMaxPositionWei: 50_000n * 10n ** 18n,

    eligibleActions: ALL_ACTIONS,
    eligibleGenerations: null,
    ...overrides,
  }
}

const RF = (n: string | number) => BigInt(n) * 10n ** 18n

export interface SeedSpec {
  id: string
  name: string
  kind: Pool['kind']
  creatorLpId: string
  creatorName: string
  capitalWei: bigint
  terms: PoolTerms
  access: PoolAccess
}

/** Every seeded pool, in market display order. */
export const SEED_SPECS: SeedSpec[] = [
  {
    id: 'pool-default',
    name: 'Rare Advance Default',
    kind: 'both',
    creatorLpId: 'ra',
    creatorName: 'Rare Advance',
    capitalWei: RF(100_000),
    terms: defaultTerms(),
    access: publicAccess(),
  },
  {
    id: 'pool-lowcost',
    name: 'Community Low-Cost',
    kind: 'stream',
    creatorLpId: 'lp-a',
    creatorName: 'LP A',
    capitalWei: RF(18_000),
    terms: defaultTerms({ streamPremiumBps: 300n, maxStreamPositionWei: RF(20_000) }),
    access: publicAccess(),
  },
  {
    id: 'pool-growth-deep',
    name: 'Growth Deep',
    kind: 'growth',
    creatorLpId: 'lp-b',
    creatorName: 'LP B',
    // Deep enough in CASH to actually fund a promotion, which costs 90,000 RF.
    capitalWei: RF(260_000),
    terms: defaultTerms({
      growthPremiumBps: 400n,
      growthMaxFinanceBps: 10_000n,
      growthRfRoutingBps: 8_000n,
      growthWethShareBps: 1_000n,
      // Deep enough to fund a promotion as well as an upgrade.
      growthMaxPositionWei: 250_000n * 10n ** 18n,
    }),
    access: publicAccess(),
  },
  {
    id: 'pool-growth-flex',
    name: 'Growth Flex',
    kind: 'growth',
    creatorLpId: 'lp-c',
    creatorName: 'LP C',
    capitalWei: RF(52_000),
    terms: defaultTerms({
      growthPremiumBps: 600n,
      growthMaxFinanceBps: 10_000n,
      growthRfRoutingBps: 6_500n,
      growthWethShareBps: 500n,
    }),
    access: publicAccess(),
  },
  {
    id: 'pool-private',
    name: 'Private Crew',
    kind: 'growth',
    creatorLpId: 'lp-d',
    creatorName: 'LP D',
    capitalWei: RF(14_000),
    terms: defaultTerms({
      growthPremiumBps: 300n,
      growthMaxFinanceBps: 10_000n,
      growthRfRoutingBps: 7_500n,
      growthWethShareBps: 500n,
    }),
    access: privateAccess(),
  },
]

/** Build the seeded market at a fixed timestamp. */
export function buildSeedMarket(nowMs: number): Pool[] {
  return SEED_SPECS.map((spec) =>
    createPool({
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      creatorLpId: spec.creatorLpId,
      creatorName: spec.creatorName,
      capitalWei: spec.capitalWei,
      terms: spec.terms,
      access: spec.access,
      nowMs,
      seeded: true,
    }),
  )
}

/**
 * Neutral simulated identities. Demo Mode never shows long wallet addresses as
 * the primary label.
 */
export const DEMO_LPS = [
  { id: 'you', displayName: 'You' },
  { id: 'lp-a', displayName: 'LP A' },
  { id: 'lp-b', displayName: 'LP B' },
  { id: 'lp-c', displayName: 'LP C' },
  { id: 'lp-d', displayName: 'LP D' },
] as const

export const LOCAL_LP_ID = 'you'
