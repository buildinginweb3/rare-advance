/**
 * LIVE DATA ORCHESTRATION
 * =======================
 *
 * Loads protocol state, discovers the wallet's Friends, verifies ownership
 * onchain and attaches artwork. Every failure degrades honestly: an error
 * state with Retry, never a silent substitution of fake data.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { discoverFriends } from '../chain/discovery'
import {
  readProtocolState,
  readFriendOnchain,
  readPositionsBatched,
  deriveStreamingShare,
  streamRemainingMs,
} from '../chain/reads'
import { fetchArtwork } from '../chain/artwork'
import { clearChainCache } from '../chain/client'
import type { FriendPosition, LiveDataState } from '../types'

const OPENSEA_KEY = (import.meta.env?.VITE_OPENSEA_API_KEY as string | undefined)?.trim() ?? ''

export interface LiveLoadResult {
  friends: FriendPosition[]
  live: LiveDataState
  notes: string[]
  route: string
  /** how many Friends were verified onchain in total */
  totalVerified: number
  /** how many were actually read this pass */
  readCount: number
}

/**
 * Per-Friend reward state requires several onchain calls each, so a wallet
 * holding hundreds of Friends cannot be fully materialised in one pass without
 * hammering the public RPC. The first `MAX_FRIEND_READS` verified Friends are
 * read and the UI states plainly how many more exist.
 */
export const MAX_FRIEND_READS = 48

const emptyLive: LiveDataState = {
  status: 'loading',
  error: null,
  blockNumber: null,
  readAtMs: null,
  totalActiveWeightMicros: null,
  totalActiveWeightProvenance: 'onchain',
  rfStream: { pendingWei: null, rateWeiPerSec: null, finishUnix: null, remainderWei: null },
  wethStream: { pendingWei: null, rateWeiPerSec: null, finishUnix: null, remainderWei: null },
  prices: { rfUsd: null, ethUsd: null },
}

export function useLiveData(address: `0x${string}` | null) {
  const [result, setResult] = useState<LiveLoadResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!address) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    clearChainCache()
    setLoading(true)
    setError(null)
    try {
      const live = await readProtocolState()

      // Optional first-party prices snapshot. Purely cosmetic; failure is fine.
      try {
        const res = await fetch('/api/rf-snapshot', { signal: ac.signal })
        if (res.ok) {
          const json = (await res.json()) as {
            prices?: { rfUsd?: number; ethUsd?: number }
          }
          if (json.prices) {
            live.prices = {
              rfUsd: json.prices.rfUsd ?? null,
              ethUsd: json.prices.ethUsd ?? null,
            }
          }
        }
      } catch {
        /* prices are decorative; protocol state is already live */
      }

      const discovery = await discoverFriends(address, OPENSEA_KEY, ac.signal)
      const now = Date.now()

      // Stage 1: a cheap batched `positions()` sweep ranks the whole wallet
      // active-first, so a large wallet still surfaces its EARNING Friends
      // before the heavier per-Friend reward reads are spent.
      const positions = await readPositionsBatched(
        discovery.friends.map((d) => ({ collection: d.collection, tokenId: BigInt(d.tokenId) })),
      )
      const ranked = discovery.friends
        .map((d) => ({ d, pos: positions.get(`${d.collection}:${d.tokenId}`) }))
        .sort((a, b) => {
          const aa = a.pos?.activated ? 0 : 1
          const bb = b.pos?.activated ? 0 : 1
          if (aa !== bb) return aa - bb
          const x = BigInt(a.d.tokenId)
          const y = BigInt(b.d.tokenId)
          return x < y ? -1 : x > y ? 1 : 0
        })
        .map((r) => r.d)

      const activeCount = ranked.filter((d) => positions.get(`${d.collection}:${d.tokenId}`)?.activated).length
      const queue = ranked.slice(0, MAX_FRIEND_READS)
      if (ranked.length > queue.length) {
        discovery.notes.push(
          `${ranked.length} Friends verified onchain (${activeCount} active); the first ${queue.length} are loaded because each reward read is a separate onchain call.`,
        )
      }

      // Bounded concurrency: fast enough to feel instant, gentle on the public RPC.
      const friends: FriendPosition[] = []
      const batchSize = 8
      for (let i = 0; i < queue.length; i += batchSize) {
        const batch = queue.slice(i, i + batchSize)
        friends.push(
          ...(await Promise.all(
            batch.map(async (d) => {
              const tokenId = BigInt(d.tokenId)
              try {
                const s = await readFriendOnchain(d.collection, tokenId)
                const streamingRfWei = deriveStreamingShare(
                  s.weightMicros,
                  live.totalActiveWeightMicros,
                  live.rfStream.remainderWei,
                )
                return {
                  key: `${d.collection}:${d.tokenId}`,
                  collection: d.collection,
                  tokenId: d.tokenId,
                  generation: s.generation,
                  tier: s.tier,
                  activated: s.activated,
                  temporary: s.temporary,
                  weightMicros: s.weightMicros,
                  weight: 'onchain' as const,
                  walletAddress: s.tokenBoundAccount,
                  imageUrl: null,
                  artSource: 'none' as const,
                  traits: [],
                  canonicalUrl: null,
                  name: `${d.collection} #${d.tokenId}`,
                  stateSource: 'onchain' as const,
                  rewards: {
                    claimableRfWei: s.claimableKnown ? s.claimableRfWei : null,
                    claimableRf: 'onchain' as const,
                    claimableKnown: s.claimableKnown,
                    streamingRfWei,
                    streamingRf: 'modeled' as const,
                    streamRemainingRfWei: live.rfStream.remainderWei,
                    streamRateRfPerSec: live.rfStream.rateWeiPerSec,
                    streamFinishUnix: live.rfStream.finishUnix,
                    claimableWethWei: s.claimableWethWei,
                    claimableWeth: 'onchain' as const,
                    streamingWethWei: deriveStreamingShare(
                      s.weightMicros,
                      live.totalActiveWeightMicros,
                      live.wethStream.remainderWei,
                    ),
                    streamingWeth: 'modeled' as const,
                    streamRemainingWethWei: live.wethStream.remainderWei,
                    streamFinishWethUnix: live.wethStream.finishUnix,
                  },
                  error: null,
                }
              } catch (err) {
                return {
                  key: `${d.collection}:${d.tokenId}`,
                  collection: d.collection,
                  tokenId: d.tokenId,
                  generation: 0,
                  tier: null,
                  activated: false,
                  temporary: false,
                  weightMicros: 0n,
                  weight: 'onchain' as const,
                  walletAddress: null,
                  imageUrl: null,
                  artSource: 'none' as const,
                  traits: [],
                  canonicalUrl: null,
                  name: `${d.collection} #${d.tokenId}`,
                  stateSource: 'onchain' as const,
                  rewards: {
                    claimableRfWei: null,
                    claimableRf: 'onchain' as const,
                    claimableKnown: false,
                    streamingRfWei: null,
                    streamingRf: 'onchain' as const,
                    streamRemainingRfWei: null,
                    streamRateRfPerSec: null,
                    streamFinishUnix: null,
                    claimableWethWei: null,
                    claimableWeth: 'onchain' as const,
                    streamingWethWei: null,
                    streamingWeth: 'onchain' as const,
                    streamRemainingWethWei: null,
                    streamFinishWethUnix: null,
                  },
                  error: `Live read failed: ${(err as Error).message}`,
                }
              }
            }),
          )),
        )
      }

      // Artwork is display-only and is resolved separately, onchain first, so
      // a slow metadata index can never block or corrupt protocol state.
      if (friends.length > 0) {
        const assets = await fetchArtwork(
          friends.map((f) => ({ collection: f.collection, tokenId: f.tokenId })),
          ac.signal,
        ).catch(() => new Map())
        for (const f of friends) {
          const asset = assets.get(f.key)
          if (asset) {
            f.imageUrl = asset.imageUrl
            f.artSource = asset.imageUrl ? asset.source : 'none'
            f.traits = asset.traits
            f.canonicalUrl = asset.openseaUrl
          }
        }
      }

      setResult({
        friends,
        live,
        notes: discovery.notes,
        route: discovery.route,
        totalVerified: discovery.friends.length,
        readCount: friends.length,
      })
      void streamRemainingMs(live.rfStream.finishUnix, now)
    } catch (err) {
      setError(
        `Live protocol state unavailable: ${(err as Error).message}. Robinhood Chain RPC did not answer.`,
      )
      setResult({
        friends: [],
        live: { ...emptyLive, status: 'error', error: (err as Error).message },
        notes: [],
        route: 'none',
        totalVerified: 0,
        readCount: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (address) void load()
  }, [address, load])

  useEffect(() => () => abortRef.current?.abort(), [])

  return { result, loading, error, retry: load }
}
