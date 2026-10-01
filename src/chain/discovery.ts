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
import {
  generationsNftAbi,
  GENESIS_MAX_TOKEN_ID,
  multicall3Aggregate3Abi,
  MULTICALL3_ADDRESS,
} from '../protocol/abis'

/** Generous ceiling for the binary search; the real highest id is far lower. */
/**
 * Verified ceiling for Generations token ids. `ownerOf` reverts above ~344,000,
 * so this bound cannot miss a live token.
 */
const GENERATIONS_ID_UPPER_BOUND = 345_000n

/**
 * The public RPC throttles hard, so throughput is best at low concurrency:
 * measured 481 ms/batch at 5-way versus 1,110 ms/batch at 24-way.
 */
const SWEEP_CONCURRENCY = 4

/** Largest bundle the public RPC accepts; 8,000 is rejected outright. */
const MULTICALL_BATCH_SIZE = 4000
import { encodeFunctionData } from 'viem'
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

interface OwnerOfResult {
  success: boolean
  returnData: `0x${string}`
}

/** One bundled read of many `ownerOf` calls through Multicall3. */
async function readOwnerOfBatch(
  c: ReturnType<typeof publicClient>,
  contract: `0x${string}`,
  batch: bigint[],
): Promise<OwnerOfResult[]> {
  const results = await c.readContract({
    address: MULTICALL3_ADDRESS as `0x${string}`,
    abi: multicall3Aggregate3Abi,
    functionName: 'aggregate3',
    args: [
      batch.map((tokenId) => ({
        target: contract,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: generationsNftAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
      })),
    ],
  })
  return results as unknown as OwnerOfResult[]
}

/**
 * Ask about many token ids per request via Multicall3.
 *
 * The public RPC rejects `eth_getLogs` outright (HTTP 403) and the Generations
 * contract exposes no owner index, so checking every id is the only route. This
 * turns a 345,000-read sweep into ~87 requests instead of 345,000 round trips.
 *
 * `complete` is false if any batch could not be read even after one retry, so a
 * flaky RPC can never be reported as "this wallet owns nothing".
 */
async function sweepCollection(
  collection: CollectionName,
  ids: bigint[],
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{ found: DiscoveredFriend[]; complete: boolean }> {
  const c = publicClient()
  const contract =
    collection === 'Genesis' ? COLLECTION_ADDRESS.genesis : COLLECTION_ADDRESS.generations
  const found: DiscoveredFriend[] = []

  const batches: bigint[][] = []
  for (let i = 0; i < ids.length; i += MULTICALL_BATCH_SIZE) {
    batches.push(ids.slice(i, i + MULTICALL_BATCH_SIZE))
  }
  const total = batches.length
  let incomplete = false

  const worker = async () => {
    const collect = (results: OwnerOfResult[], batch: bigint[]) => {
      results.forEach((r, i) => {
        if (!r.success || !r.returnData || r.returnData.length < 66) return
        const owner = `0x${r.returnData.slice(-40)}` as `0x${string}`
        if (sameAddress(owner, address)) {
          found.push({
            collection,
            tokenId: batch[i].toString(),
            ownershipVerified: true,
            discovery: 'onchain-sweep',
          })
        }
      })
    }
    for (;;) {
      const batch = batches.shift()
      if (batch === undefined) return
      if (signal?.aborted) throw new DiscoveryError('Discovery cancelled.', 'onchain')
      try {
        collect(await readOwnerOfBatch(c, contract, batch), batch)
      } catch {
        try {
          collect(await readOwnerOfBatch(c, contract, batch), batch)
        } catch {
          incomplete = true
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(SWEEP_CONCURRENCY, total)) }, () => worker()),
  )
  return { found, complete: !incomplete }
}

/** Genesis is small enough to enumerate completely in a single bundle. */
export async function discoverGenesisOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{ found: DiscoveredFriend[]; complete: boolean }> {
  const ids = Array.from({ length: GENESIS_MAX_TOKEN_ID }, (_, i) => BigInt(i + 1))
  return sweepCollection('Genesis', ids, address, signal)
}

/**
 * Generations has no owner index, so every candidate id is checked. Ids that were
 * never minted simply fail inside the bundle, which makes a generous upper bound
 * both safe and exhaustive.
 *
 * The ceiling is a verified constant rather than a search: `ownerOf` reverts
 * above ~344,000. The collection is NOT minted contiguously from 1 (id 4,000
 * exists while id 1 does not, and 343,888 exists while 345,000 does not), so an
 * id-range binary search would be unsound here and every id must be asked about.
 */
export async function discoverGenerationsOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{ found: DiscoveredFriend[]; complete: boolean }> {
  const ids: bigint[] = []
  for (let id = 1n; id <= GENERATIONS_ID_UPPER_BOUND; id += 1n) ids.push(id)
  return sweepCollection('Generations', ids, address, signal)
}

/**
 * Sweep BOTH collections onchain.
 *
 * This is the authoritative route and the only one that works from a static
 * host: rarefriends.com sends no CORS headers, OpenSea does not serve these
 * tokens, and the public RPC refuses eth_getLogs.
 *
 * `exhaustive` is true only when every token id of both collections was read.
 */
export async function discoverOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{ friends: DiscoveredFriend[]; exhaustive: boolean }> {
  const [genesis, generations] = await Promise.all([
    discoverGenesisOnchain(address, signal).catch(() => ({
      found: [] as DiscoveredFriend[],
      complete: false,
    })),
    discoverGenerationsOnchain(address, signal).catch(() => ({
      found: [] as DiscoveredFriend[],
      complete: false,
    })),
  ])
  return {
    friends: [...genesis.found, ...generations.found],
    exhaustive: genesis.complete && generations.complete,
  }
}

// ---------------------------------------------------------------------------
// 3. OpenSea account fallback
// ---------------------------------------------------------------------------

/**
 * OpenSea's v2 "NFTs by account" endpoint, used only when the first-party index
 * is unavailable AND a key is configured. Ownership is still verified onchain
 * afterwards. If OpenSea is unavailable this returns an empty list and the
 * caller degrades honestly.
 *
 * NOTE the path: it is chain-scoped and uses the singular `account`
 * (`/api/v2/chain/{chain}/account/{address}/nfts`). The un-scoped
 * `/api/v2/accounts/{address}/nfts` path does not exist and returns 404, which
 * previously made every wallet fall through to the slow exhaustive onchain
 * sweep. Verified 2026-09-30: this endpoint returns a Robinhood Chain holder's
 * Rare Friends in a single request.
 */
export async function discoverViaOpenSea(
  address: `0x${string}`,
  key: string,
  signal?: AbortSignal,
): Promise<DiscoveredFriend[]> {
  if (!key) return []
  const out: DiscoveredFriend[] = []
  let next: string | null =
    `${BASE_V2}/chain/${OPENSEA_CHAIN}/account/${address}/nfts?limit=50`
  let pages = 0
  while (next && pages < 20) {
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
  /**
   * True only when every token id of both collections was actually checked.
   * When false an empty list means "not everything could be checked from this
   * browser", NOT "this wallet holds nothing" — the UI must not claim the latter.
   */
  exhaustive: boolean
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
  /** True only when every possible token id for both collections was checked. */
  let exhaustive = false

  try {
    candidates = await discoverViaFirstPartyApi(address, signal)
    if (candidates.length > 0) {
      route = 'first-party-api'
      // A first-party index answered, so its list is the whole truth.
      exhaustive = true
    }
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
    // Last resort, and the only route that needs no index at all: sweep both
    // collection contracts directly. This is what runs when no index answered,
    // because rarefriends.com sends no CORS headers and cannot be read from a
    // static host.
    try {
      const onchain = await discoverOnchain(address, signal)
      exhaustive = onchain.exhaustive
      if (onchain.friends.length > 0) {
        candidates = onchain.friends
        route = 'onchain-sweep'
        notes.push(
          `Verified directly onchain: ${onchain.friends
            .map((f) => `${f.collection} #${f.tokenId}`)
            .join(', ')}.`,
        )
      }
    } catch (err) {
      notes.push(`Onchain sweep failed: ${(err as Error).message}`)
    }
  }

  if (route === 'opensea') {
    notes.push('Listed by the OpenSea index, with every token confirmed by a direct onchain ownerOf read.')
  } else if (!exhaustive && (route === 'none' || route === 'onchain-sweep')) {
    // Say plainly that the check was bounded, so nobody reads "none found" as
    // "this wallet holds nothing".
    notes.push(
      'No NFT index answered, so ownership was checked by sweeping the collection contracts onchain. Generations has no owner index, so this could not be exhaustive: Rare Friends holdings here are best-effort.',
    )
  }

  if (candidates.length === 0) {
    return { friends: [], route: 'none', rejected: 0, exhaustive, notes }
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

  return { friends: verified, route, rejected, exhaustive, notes }
}

export const openSeaChainSlug = OPENSEA_CHAIN
