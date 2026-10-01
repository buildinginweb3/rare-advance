/**
 * ONCHAIN READS + DERIVATION
 * ==========================
 *
 * DIRECT READS (live, verifiable):
 *   ActivationManager.totalWeight()                     total active reward weight
 *   ActivationManager.streams(RF | WETH)                pending / rate / finish / remainder
 *   ActivationManager.positions(collection, tokenId)    (tier, weight) - weight 0 == inactive
 *   ActivationManager.earned(asset, collection, tokenId) per-Friend claimable
 *   Generations.generation / tokenBoundAccount / ownerOf
 *   ERC20.balanceOf(tokenBoundAccount)                  RF / WETH already in the Friend's wallet
 *
 * DERIVED (modeled, never labelled live):
 *   A Friend's share of the currently streaming remainder is
 *       friendWeight / totalActiveWeight * stream.remainder
 *   This is the documented allocation method
 *   (weight / total active weight) applied to the live stream remainder.
 *   The contracts expose a per-Friend "still to stream" figure; they do not
 *   expose a per-Friend forward projection, so this figure is labelled MODELED
 *   and never LIVE.
 */

import { CONTRACTS, COLLECTION_ADDRESS, REWARD_ASSETS } from '../protocol/rareFriendsConfig'
import { activationManagerAbi, generationsNftAbi, erc20ReadAbi, ZERO_ADDRESS } from '../protocol/abis'
import { cached, publicClient, sameAddress, isAddress } from './client'
import { weightFromWei18 } from '../math/rf'
import type { CollectionName, LiveDataState } from '../types'

const AM = CONTRACTS.activationManager as `0x${string}`
const RF = CONTRACTS.rareFriends as `0x${string}`
const WETH = CONTRACTS.weth as `0x${string}`
const GENERATIONS = COLLECTION_ADDRESS.generations
const GENESIS = COLLECTION_ADDRESS.genesis

export interface StreamRead {
  pendingWei: bigint
  rateWeiPerSec: bigint
  finishUnix: bigint
  lastUpdateUnix: bigint
  rewardPerWeight: bigint
  remainderWei: bigint
}

export interface OnchainPosition {
  tier: number
  weightWei: bigint
  weightMicros: bigint
  activated: boolean
}

export interface FriendOnchainState {
  collection: CollectionName
  tokenId: bigint
  generation: number
  tier: number | null
  activated: boolean
  temporary: boolean
  weightMicros: bigint
  tokenBoundAccount: `0x${string}` | null
  claimableRfWei: bigint
  /** false when `earned()` reverts, which is the case for a temporary Friend */
  claimableKnown: boolean
  claimableWethWei: bigint | null
  walletRfWei: bigint | null
  walletWethWei: bigint | null
}

/** Global protocol metrics and stream state. */
export async function readProtocolState(): Promise<LiveDataState> {
  const c = publicClient()
  const blockNumber = await c.getBlockNumber()
  const [totalWeightWei, rf, weth] = await Promise.all([
    cached('am.totalWeight', () =>
      c.readContract({ address: AM, abi: activationManagerAbi, functionName: 'totalWeight' }),
    ),
    cached('am.streams.rf', () =>
      c.readContract({ address: AM, abi: activationManagerAbi, functionName: 'streams', args: [RF] }),
    ),
    cached('am.streams.weth', () =>
      c.readContract({ address: AM, abi: activationManagerAbi, functionName: 'streams', args: [WETH] }),
    ),
  ])

  return {
    status: 'ready',
    error: null,
    blockNumber,
    readAtMs: Date.now(),
    totalActiveWeightMicros: weightFromWei18(totalWeightWei),
    totalActiveWeightProvenance: 'onchain',
    rfStream: {
      pendingWei: rf[0],
      rateWeiPerSec: rf[1],
      finishUnix: rf[2],
      remainderWei: rf[5],
    },
    wethStream: {
      pendingWei: weth[0],
      rateWeiPerSec: weth[1],
      finishUnix: weth[2],
      remainderWei: weth[5],
    },
    prices: { rfUsd: null, ethUsd: null },
    // Unproven until discovery actually completes.
    discoveryExhaustive: false,
  }
}

/** Current (tier, weight) for one Friend. weight == 0 means inactive. */
export async function readOnchainPosition(
  collection: CollectionName,
  tokenId: bigint,
): Promise<OnchainPosition> {
  const c = publicClient()
  const address = collection === 'Genesis' ? GENESIS : GENERATIONS
  const [tier, weightWei] = await c.readContract({
    address: AM,
    abi: activationManagerAbi,
    functionName: 'positions',
    args: [address, tokenId],
  })
  return {
    tier: Number(tier),
    weightWei,
    weightMicros: weightFromWei18(weightWei),
    activated: weightWei > 0n,
  }
}

/**
 * Everything the app needs about one Friend, in a single read pass.
 * Genesis has no tokenBoundAccount() getter, so its wallet is reported as
 * null rather than guessed.
 */
export async function readFriendOnchain(
  collection: CollectionName,
  tokenId: bigint,
): Promise<FriendOnchainState> {
  const c = publicClient()
  const address = collection === 'Genesis' ? GENESIS : GENERATIONS
  /*
   * `earned()` REVERTS for a temporary Friend, because a temporary Friend has
   * no reward position at all. That must not fail the whole read: the rest of
   * the state (generation, tier, weight, wallet) is still valid and useful. The
   * claimable figure is reported as unavailable rather than as zero.
   */
  const claimableRf = await c
    .readContract({
      address: AM,
      abi: activationManagerAbi,
      functionName: 'earned',
      args: [RF, address, tokenId],
    })
    .then((v) => ({ wei: v as bigint, known: true }))
    .catch(() => ({ wei: 0n, known: false }))

  const [pos, claimableWethWei, tba] = await Promise.all([
    readOnchainPosition(collection, tokenId),
    c
      .readContract({
        address: AM,
        abi: activationManagerAbi,
        functionName: 'earned',
        args: [WETH, address, tokenId],
      })
      .catch(() => null),
    collection === 'Generations'
      ? c.readContract({
          address: GENERATIONS,
          abi: generationsNftAbi,
          functionName: 'tokenBoundAccount',
          args: [tokenId],
        })
      : Promise.resolve(null),
  ])

  let generation = 0
  if (collection === 'Generations') {
    const g = await c.readContract({
      address: GENERATIONS,
      abi: generationsNftAbi,
      functionName: 'generation',
      args: [tokenId],
    })
    // A Generations Friend with generation 0 is a temporary, unhardwired Friend.
    generation = Number(g)
  }

  const wallet = tba && !sameAddress(tba, ZERO_ADDRESS) ? tba : null
  const [walletRfWei, walletWethWei] = wallet
    ? await Promise.all([
        c
          .readContract({ address: RF, abi: erc20ReadAbi, functionName: 'balanceOf', args: [wallet] })
          .catch(() => null),
        c
          .readContract({ address: WETH, abi: erc20ReadAbi, functionName: 'balanceOf', args: [wallet] })
          .catch(() => null),
      ])
    : [null, null]

  return {
    collection,
    tokenId,
    generation,
    tier: pos.activated ? pos.tier : null,
    activated: pos.activated,
    temporary: collection === 'Generations' && generation === 0,
    weightMicros: pos.weightMicros,
    tokenBoundAccount: wallet,
    claimableRfWei: claimableRf.wei,
    claimableKnown: claimableRf.known,
    claimableWethWei,
    walletRfWei,
    walletWethWei,
  }
}

/**
 * Cheap two-stage read: `positions()` is the smallest per-Friend call, so it can
 * be batched across a whole wallet in a couple of multicall requests. That lets
 * a large wallet be ranked by ACTIVE-first before the heavier reward reads are
 * spent on it.
 */
export async function readPositionsBatched(
  items: { collection: CollectionName; tokenId: bigint }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, OnchainPosition>> {
  const out = new Map<string, OnchainPosition>()
  const batchSize = 96
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (it) => {
        const key = `${it.collection}:${it.tokenId}`
        try {
          const pos = await readOnchainPosition(it.collection, it.tokenId)
          return [key, pos] as const
        } catch {
          return [key, null] as const
        }
      }),
    )
    for (const [key, pos] of results) {
      if (pos) out.set(key, pos)
    }
    onProgress?.(Math.min(i + batch.length, items.length), items.length)
  }
  return out
}

/** Direct ownership verification. OpenSea is never trusted for this. */
export async function verifyOwner(
  collection: CollectionName,
  tokenId: bigint,
  owner: string,
): Promise<boolean> {
  if (!isAddress(owner)) return false
  try {
    const c = publicClient()
    const address = collection === 'Genesis' ? GENESIS : GENERATIONS
    const actual = await c.readContract({
      address,
      abi: collection === 'Genesis' ? generationsNftAbi : generationsNftAbi,
      functionName: 'ownerOf',
      args: [tokenId],
    })
    return sameAddress(actual, owner)
  } catch {
    return false
  }
}

/** Genesis generation is defined as 0 by the Generations contract semantics. */
export const GENESIS_COLLECTION_ADDRESS = GENESIS
export const GENERATIONS_COLLECTION_ADDRESS = GENERATIONS
export const REWARD_ASSET_ADDRESSES = REWARD_ASSETS

// ---------------------------------------------------------------------------
// DERIVATION (modeled)
// ---------------------------------------------------------------------------

/**
 * A Friend's slice of the currently streaming reward remainder.
 *
 *   share = weight / totalActiveWeight * remainder
 *
 * Documented formula: reward weight / total active reward weight. Returns null
 * when any input is unavailable so the UI can say "unavailable" instead of
 * inventing a number.
 */
export function deriveStreamingShare(
  weightMicros: bigint,
  totalActiveWeightMicros: bigint | null,
  streamRemainderWei: bigint | null,
): bigint | null {
  if (weightMicros <= 0n) return 0n
  if (totalActiveWeightMicros === null || totalActiveWeightMicros <= 0n) return null
  if (streamRemainderWei === null) return null
  // Integer math only. Division rounds down: never overstates the slice.
  return (streamRemainderWei * weightMicros) / totalActiveWeightMicros
}

/** How much of the stream is left, in ms. */
export function streamRemainingMs(finishUnix: bigint | null, nowMs: number): bigint | null {
  if (finishUnix === null || finishUnix <= 0n) return null
  const finishMs = Number(finishUnix) * 1000
  const diff = finishMs - nowMs
  return diff > 0 ? BigInt(diff) : 0n
}
