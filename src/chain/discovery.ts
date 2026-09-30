/**
 * FRIEND DISCOVERY
 * ================
 *
 * Three paths, in order, with honest failure at every step:
 *
 *  1. First-party Rare Friends public JSON API
 *     GET {base}/api/protocol/owned-nfts?address=0x...
 *     This is the same index the official Rare Friends Portfolio uses. It sends
 *     no CORS headers, so the app calls it through its own same-origin proxy
 *     path (/api/rf-owned-nfts) which the Vite dev/preview server forwards.
 *     On a purely static host the proxy does not exist and this path fails
 *     cleanly with a Retry affordance.
 *
 *  2. Onchain Genesis sweep
 *     Genesis has a hard cap of 1,024, so `ownerOf(1..1024)` is enumerable with
 *     multicall batching and needs no index at all.
 *
 *  3. Onchain Generations fallback
 *     The Generations id space runs to ~337k, so a full sweep is not viable
 *     against a public RPC. Rather than pretend, the app reports the honest
 *     failure and offers Demo Mode.
 *
 * EVERY result from every path is re-verified with a direct `ownerOf()` read
 * before it is shown. An unverified entry is dropped, never displayed.
 */

import { COLLECTION_ADDRESS, OPENSEA_CHAIN } from '../protocol/rareFriendsConfig'
import { generationsNftAbi, GENESIS_MAX_TOKEN_ID } from '../protocol/abis'
import { publicClient, sameAddress } from './client'
import { verifyOwner } from './reads'
import type { CollectionName } from '../types'

const RF_API_BASE = (import.meta.env?.VITE_RF_API_BASE as string | undefined)?.trim() ?? ''

export interface DiscoveredFriend {
  collection: CollectionName
  tokenId: string
  /** true when ownership was confirmed with a direct onchain ownerOf() read */
  ownershipVerified: boolean
  discovery: 'first-party-api' | 'onchain-sweep' | 'opensea'
}

export class DiscoveryError extends Error {
  readonly stage: 'api' | 'onchain' | 'verify'
  constructor(message: string, stage: DiscoveryError['stage']) {
    super(message)
    this.name = 'DiscoveryError'
    this.stage = stage
  }
}

// ---------------------------------------------------------------------------
// 1. First-party Rare Friends public API (through the same-origin proxy)
// ---------------------------------------------------------------------------

interface OwnedNftsResponse {
  nfts?: { collection?: string; id?: string }[]
}

/**
 * In dev/preview the same-origin path is /api/rf-owned-nfts. If the app is
 * hosted statically the operator can point VITE_RF_API_BASE at their own proxy.
 */
function ownedNftsUrl(address: string): string {
  const base = RF_API_BASE.replace(/\/$/, '')
  if (base) return `${base}/api/protocol/owned-nfts?address=${address}`
  return `/api/rf-owned-nfts?address=${address}`
}

export async function discoverViaFirstPartyApi(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<DiscoveredFriend[]> {
  let res: Response
  try {
    res = await fetch(ownedNftsUrl(address), { signal, headers: { accept: 'application/json' } })
  } catch (err) {
    throw new DiscoveryError(
      `NFT discovery service unreachable (${(err as Error).message}).`,
      'api',
    )
  }
  if (!res.ok) {
    throw new DiscoveryError(`NFT discovery service returned ${res.status}.`, 'api')
  }
  const json = (await res.json()) as OwnedNftsResponse
  if (!Array.isArray(json.nfts)) {
    throw new DiscoveryError('NFT discovery service returned an unexpected payload.', 'api')
  }
  return json.nfts
    .filter(
      (n): n is { collection: string; id: string } =>
        typeof n?.id === 'string' && (n.collection === 'Genesis' || n.collection === 'Generations'),
    )
    .map((n) => ({
      collection: n.collection as CollectionName,
      tokenId: n.id,
      ownershipVerified: false,
      discovery: 'first-party-api' as const,
    }))
}

// ---------------------------------------------------------------------------
// 2. Onchain Genesis sweep (cap of 1,024 -> fully enumerable)
// ---------------------------------------------------------------------------

export async function discoverGenesisOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<DiscoveredFriend[]> {
  const c = publicClient()
  const found: DiscoveredFriend[] = []
  const ids = Array.from({ length: GENESIS_MAX_TOKEN_ID }, (_, i) => BigInt(i + 1))
  const groupSize = 64
  for (let i = 0; i < ids.length; i += groupSize) {
    if (signal?.aborted) throw new DiscoveryError('Discovery cancelled.', 'onchain')
    const group = ids.slice(i, i + groupSize)
    const results = await Promise.all(
      group.map(async (id) => {
        try {
          const owner = await c.readContract({
            address: COLLECTION_ADDRESS.genesis,
            abi: generationsNftAbi,
            functionName: 'ownerOf',
            args: [id],
          })
          return sameAddress(owner, address) ? id : null
        } catch {
          return null
        }
      }),
    )
    for (const id of results) {
      if (id !== null) {
        found.push({
          collection: 'Genesis',
          tokenId: id.toString(),
          ownershipVerified: true,
          discovery: 'onchain-sweep',
        })
      }
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// 3. OpenSea account fallback
// ---------------------------------------------------------------------------

/**
 * OpenSea's v2 "NFTs by account" endpoint is used only when the first-party
 * index is unavailable AND a key is configured. Ownership is still verified
 * onchain afterwards. If OpenSea is unavailable this returns an empty list and
 * the caller degrades honestly.
 */
export async function discoverViaOpenSea(
  address: `0x${string}`,
  key: string,
  signal?: AbortSignal,
): Promise<DiscoveredFriend[]> {
  if (!key) return []
  const out: DiscoveredFriend[] = []
  let next: string | null = `${BASE_V2}/accounts/${address}/nfts?limit=50`
  let pages = 0
  while (next && pages < 4) {
    if (signal?.aborted) throw new DiscoveryError('Discovery cancelled.', 'api')
    const res = await fetch(next, { headers: { 'X-API-KEY': key, accept: 'application/json' }, signal })
    if (!res.ok) break
    const json = (await res.json()) as {
      nfts?: { contract?: string; identifier?: string }[]
      next?: string | null
    }
    for (const n of json.nfts ?? []) {
      const contract = (n.contract ?? '').toLowerCase()
      const collection: CollectionName | null =
        contract === COLLECTION_ADDRESS.genesis.toLowerCase()
          ? 'Genesis'
          : contract === COLLECTION_ADDRESS.generations.toLowerCase()
            ? 'Generations'
            : null
      if (collection && n.identifier) {
        out.push({ collection, tokenId: String(n.identifier), ownershipVerified: false, discovery: 'opensea' })
      }
    }
    next = json.next ?? null
    pages += 1
  }
  return out
}

const BASE_V2 = 'https://api.opensea.io/api/v2'

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  friends: DiscoveredFriend[]
  /** how the list was produced, for provenance copy */
  route: 'first-party-api' | 'onchain-sweep' | 'opensea' | 'none'
  /** entries dropped because ownerOf() did not confirm the wallet */
  rejected: number
  notes: string[]
}

/**
 * Discover a wallet's Rare Friends and verify every one of them onchain.
 * Never returns an unverified entry.
 */
export async function discoverFriends(
  address: `0x${string}`,
  openseaKey: string,
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const notes: string[] = []
  let candidates: DiscoveredFriend[] = []
  let route: DiscoveryResult['route'] = 'none'

  try {
    candidates = await discoverViaFirstPartyApi(address, signal)
    if (candidates.length > 0) route = 'first-party-api'
  } catch (err) {
    notes.push((err as Error).message)
  }

  if (candidates.length === 0 && openseaKey) {
    try {
      const viaSea = await discoverViaOpenSea(address, openseaKey, signal)
      if (viaSea.length > 0) {
        candidates = viaSea
        route = 'opensea'
        notes.push('Discovered through OpenSea, verified onchain.')
      }
    } catch (err) {
      notes.push(`OpenSea discovery failed: ${(err as Error).message}`)
    }
  }

  if (candidates.length === 0) {
    // Last resort that needs no index at all: sweep Genesis onchain.
    try {
      const genesis = await discoverGenesisOnchain(address, signal)
      if (genesis.length > 0) {
        candidates = genesis
        route = 'onchain-sweep'
        notes.push('Discovered by sweeping the Genesis contract onchain.')
      }
    } catch (err) {
      notes.push(`Onchain sweep failed: ${(err as Error).message}`)
    }
  }

  if (candidates.length === 0) {
    return { friends: [], route: 'none', rejected: 0, notes }
  }

  // Ownership is ALWAYS re-verified onchain. Indexes can lag.
  const verified: DiscoveredFriend[] = []
  let rejected = 0
  for (const cand of candidates) {
    let ok = cand.ownershipVerified
    if (!ok) ok = await verifyOwner(cand.collection, BigInt(cand.tokenId), address)
    if (ok) verified.push({ ...cand, ownershipVerified: true })
    else rejected += 1
  }

  if (rejected > 0) {
    notes.push(
      `${rejected} indexed ${rejected === 1 ? 'entry was' : 'entries were'} dropped because a direct ownerOf() read did not confirm this wallet.`,
    )
  }

  verified.sort((a, b) => {
    if (a.collection !== b.collection) return a.collection === 'Genesis' ? -1 : 1
    const x = BigInt(a.tokenId)
    const y = BigInt(b.tokenId)
    return x < y ? -1 : x > y ? 1 : 0
  })

  return { friends: verified, route, rejected, notes }
}

export const openSeaChainSlug = OPENSEA_CHAIN
