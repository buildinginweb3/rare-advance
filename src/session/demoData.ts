/**
 * DETERMINISTIC DEMO STATE
 * ========================
 *
 * Judges must not need to own a Rare Friend. This module builds a clearly
 * labelled SIMULATED DEMO wallet whose Friends use real protocol rules and
 * protocol-valid values, and marks every field `simulated`.
 *
 * No synthetic value here is ever presented as onchain data.
 */

import { GENERATION_SCHEDULE, GENESIS, REWARD_STREAM_DURATION_SECONDS } from '../protocol/rareFriendsConfig'
import { parseRF, parseWeight } from '../math/rf'
import { deriveStreamingShare, streamRemainingMs } from '../chain/reads'
import { DEMO_POOL_SEED } from '../economy/rareAdvanceConfig'
import type { FriendPosition, LiveDataState } from '../types'
import { cachedDemoArt } from './demoArt'

export const DEMO_WALLET_LABEL = 'DEMO WALLET · REWARDS SIMULATED'
export const DEMO_ADDRESS = '0xDEM0advance0000000000000000000000000000'

/**
 * Fixed reference point for the demo so every screenshot and every run is
 * identical. The app's simulated clock starts here.
 */
export const DEMO_EPOCH_MS = Date.UTC(2026, 8, 29, 12, 0, 0)

/** Demo protocol activity, clearly marked as a scenario, not a live read. */
const DEMO_TOTAL_ACTIVE_WEIGHT_MICROS = parseWeight('1068353624.53125')
const DEMO_RF_STREAM_RATE_WEI_PER_SEC = parseRF('1044.83')
const DEMO_RF_STREAM_REMAINDER = parseRF('4692104.14')
const DEMO_WETH_STREAM_REMAINDER = parseRF('1.62')

interface DemoFriendSpec {
  collection: 'Genesis' | 'Generations'
  tokenId: string
  generation: number
  tier: number | null
  activated: boolean
  temporary?: boolean
  claimableRf: string
  claimableWeth: string
  walletRf: string
  walletWeth: string
  artSeeds: [number, number]
}

/**
 * The demo wallet mirrors a real Rare Friends holder: ten active Genesis at
 * 2,000,000 weight, one hardwired active Gen 1, one permanent Gen 4 that lost
 * activation on transfer, and one temporary Gen 6. The token ids and states are
 * real and were read onchain; the balances and streams are SIMULATED.
 */
const DEMO_SPECS: DemoFriendSpec[] = [
  {
    collection: 'Genesis',
    tokenId: '500',
    generation: 0,
    tier: 0,
    activated: true,
    claimableRf: '177970.984112',
    claimableWeth: '0.133504881',
    walletRf: '1842.5',
    walletWeth: '0.42',
    artSeeds: [3, 7],
  },
  {
    collection: 'Genesis',
    tokenId: '277',
    generation: 0,
    tier: 0,
    activated: true,
    claimableRf: '177641.479204',
    claimableWeth: '0.132293117',
    walletRf: '640.25',
    walletWeth: '0.11',
    artSeeds: [9, 4],
  },
  {
    collection: 'Generations',
    tokenId: '1773',
    generation: 1,
    tier: 0,
    activated: true,
    claimableRf: '15533.164301',
    claimableWeth: '0.011537004',
    walletRf: '96.4',
    walletWeth: '0.08',
    artSeeds: [11, 2],
  },
  {
    collection: 'Generations',
    tokenId: '77045',
    generation: 4,
    tier: null,
    activated: false,
    claimableRf: '0',
    claimableWeth: '0',
    walletRf: '0',
    walletWeth: '0',
    artSeeds: [5, 9],
  },
  {
    collection: 'Generations',
    tokenId: '4975',
    generation: 6,
    tier: null,
    activated: false,
    temporary: true,
    claimableRf: '0',
    claimableWeth: '0',
    walletRf: '0',
    walletWeth: '0',
    artSeeds: [8, 13],
  },
  {
    collection: 'Generations',
    tokenId: '41220',
    generation: 3,
    tier: 2,
    activated: true,
    claimableRf: '412.883744',
    claimableWeth: '0.000231004',
    walletRf: '18.4',
    walletWeth: '0.01',
    artSeeds: [14, 6],
  },
]

function demoStreamState(nowMs: number): LiveDataState {
  const finish = BigInt(Math.floor((DEMO_EPOCH_MS + 5.2 * 24 * 3600 * 1000) / 1000))
  return {
    status: 'ready',
    error: null,
    blockNumber: 76_285_887n,
    readAtMs: nowMs,
    totalActiveWeightMicros: DEMO_TOTAL_ACTIVE_WEIGHT_MICROS,
    totalActiveWeightProvenance: 'simulated',
    rfStream: {
      pendingWei: parseRF('8444159.7'),
      rateWeiPerSec: DEMO_RF_STREAM_RATE_WEI_PER_SEC,
      finishUnix: finish,
      remainderWei: DEMO_RF_STREAM_REMAINDER,
    },
    wethStream: {
      pendingWei: parseRF('1.542891596441'),
      rateWeiPerSec: parseRF('0.0000488'),
      finishUnix: finish + 1n,
      remainderWei: DEMO_WETH_STREAM_REMAINDER,
    },
    prices: { rfUsd: 0.00117, ethUsd: 2669.54 },
  }
}

export function buildDemoLiveState(nowMs: number): LiveDataState {
  return demoStreamState(nowMs)
}

export function buildDemoFriends(nowMs: number): FriendPosition[] {
  const state = demoStreamState(nowMs)
  return DEMO_SPECS.map((spec) => {
    const art = cachedDemoArt(spec.collection, spec.tokenId)
    const schedule = spec.generation >= 1 ? GENERATION_SCHEDULE[spec.generation - 1] : null
    const weight = !spec.activated
      ? 0n
      : spec.collection === 'Genesis'
        ? parseWeight(GENESIS.activeRewardWeight)
        : parseWeight(schedule!.tierWeights[spec.tier ?? 0])

    return {
      key: `${spec.collection}:${spec.tokenId}`,
      collection: spec.collection,
      tokenId: spec.tokenId,
      generation: spec.generation,
      tier: spec.activated ? (spec.tier ?? 0) : null,
      activated: spec.activated,
      temporary: spec.temporary === true,
      weightMicros: weight,
      weight: 'simulated' as const,
      walletAddress: null,
      // The REAL onchain portrait when we already have it cached, otherwise a
      // drawn placeholder until the chain read lands. Never invented.
      imageUrl: art?.imageUrl ?? null,
      artSource: art ? ('onchain' as const) : ('none' as const),
      traits: [],
      canonicalUrl: null,
      name: art?.name ?? `${spec.collection} #${spec.tokenId}`,
      stateSource: 'simulated' as const,
      rewards: {
        claimableRfWei: parseRF(spec.claimableRf),
        claimableRf: 'simulated' as const,
        claimableKnown: true,
        streamingRfWei: deriveStreamingShare(weight, state.totalActiveWeightMicros, state.rfStream.remainderWei),
        streamingRf: 'simulated' as const,
        streamRemainingRfWei: state.rfStream.remainderWei,
        streamRateRfPerSec: state.rfStream.rateWeiPerSec,
        streamFinishUnix: state.rfStream.finishUnix,
        claimableWethWei: parseRF(spec.claimableWeth),
        claimableWeth: 'simulated' as const,
        streamingWethWei: deriveStreamingShare(weight, state.totalActiveWeightMicros, state.wethStream.remainderWei),
        streamingWeth: 'simulated' as const,
        streamRemainingWethWei: state.wethStream.remainderWei,
        streamFinishWethUnix: state.wethStream.finishUnix,
      },
      error: null,
    }
  })
}

export const DEMO_POOL_SEED_WEI = {
  totalLiquidityWei: parseRF(DEMO_POOL_SEED.totalLiquidity),
  advancesOutstandingWei: parseRF(DEMO_POOL_SEED.advancesOutstanding),
  lpSpreadEarnedWei: parseRF(DEMO_POOL_SEED.lpSpreadEarned),
  rareAdvanceBurnedWei: parseRF(DEMO_POOL_SEED.rareAdvanceBurned),
  advancesIssuedWei: parseRF('124500'),
  rfFinancedIntoActionsWei: parseRF('61100'),
  userDepositWei: 0n,
}

export const DEMO_STREAM_DURATION_MS = BigInt(REWARD_STREAM_DURATION_SECONDS) * 1000n

export function demoStreamRemainingMs(nowMs: number): bigint {
  return streamRemainingMs(BigInt(Math.floor((DEMO_EPOCH_MS + 5.2 * 24 * 3600 * 1000) / 1000)), nowMs) ?? DEMO_STREAM_DURATION_MS
}
