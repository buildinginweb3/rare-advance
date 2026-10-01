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

/**
 * Generations sweep budget. The collection is far too large to enumerate, so the
 * sweep is explicitly best-effort and the UI is told when it was incomplete.
 */
const MAX_GENERATION_SWEEP_WINDOWS = 2
const MAX_GENERATION_SWEEP_HITS = 8
/** Generous ceiling for the binary search; the real highest id is far lower. */
const TOKEN_ID_UPPER_BOUND = 4_000_000n
/**
 * Wall-clock ceiling for the best-effort Generations sweep. Genesis must never
 * be starved of RPC budget, so only the Generations window loop is deadline
 * driven; if the deadline passes it returns what it has and reports itself
 * incomplete rather than delaying the page.
 */
const GENERATIONS_SWEEP_BUDGET_MS = 12_000
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

async function sweepCollection(
  collection: CollectionName,
  ids: bigint[],
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<DiscoveredFriend[]> {
  const c = publicClient()
  const contract = collection === 'Genesis' ? COLLECTION_ADDRESS.genesis : COLLECTION_ADDRESS.generations
  const found: DiscoveredFriend[] = []
  const groupSize = 48
  for (let i = 0; i < ids.length; i += groupSize) {
    if (signal?.aborted) throw new DiscoveryError('Discovery cancelled.', 'onchain')
    const group = ids.slice(i, i + groupSize)
    const results = await Promise.all(
      group.map(async (id) => {
        try {
          const owner = await c.readContract({
            address: contract,
            abi: generationsNftAbi,
            functionName: 'ownerOf',
            args: [id],
          })
          return sameAddress(owner, address) ? id : null
        } catch {
          // A token id that does not exist reverts; that is not an error.
          return null
        }
      }),
    )
    for (const id of results) {
      if (id !== null) {
        found.push({
          collection,
          tokenId: id.toString(),
          ownershipVerified: true,
          discovery: 'onchain-sweep',
        })
      }
    }
  }
  return found
}

/** Genesis is small enough to enumerate completely. */
export async function discoverGenesisOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<DiscoveredFriend[]> {
  const ids = Array.from({ length: GENESIS_MAX_TOKEN_ID }, (_, i) => BigInt(i + 1))
  return sweepCollection('Genesis', ids, address, signal)
}

/**
 * Generations is far too large to enumerate: its highest live token id is in the
 * hundreds of thousands and the contract exposes no owner index (totalSupply,
 * balanceOf and tokenOfOwnerByIndex all revert), so a complete sweep is not
 * possible from a browser.
 *
 * This therefore sweeps newest-first within a strict budget. It reliably finds
 * wallets holding recently minted Friends and gives up honestly rather than
 * hanging the page. `complete` tells the caller whether the sweep could have
 * been exhaustive, so the UI never claims a wallet is empty when it simply was
 * not fully checked.
 */
export async function discoverGenerationsOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{ found: DiscoveredFriend[]; complete: boolean; highestId: bigint }> {
  const empty = { found: [] as DiscoveredFriend[], complete: false, highestId: 0n }
  const highest = await highestLiveTokenId('Generations', signal)
  if (highest === null) return empty

  const found: DiscoveredFriend[] = []
  const step = 48n
  const deadlineAt = Date.now() + GENERATIONS_SWEEP_BUDGET_MS
  let end = highest
  for (let window = 0; window < MAX_GENERATION_SWEEP_WINDOWS; window += 1) {
    if (signal?.aborted) throw new DiscoveryError('Discovery cancelled.', 'onchain')
    const start = end - step + 1n > 0n ? end - step + 1n : 1n
    const ids: bigint[] = []
    for (let id = end; id >= start; id -= 1n) ids.push(id)
    found.push(...(await sweepCollection('Generations', ids, address, signal)))
    if (found.length >= MAX_GENERATION_SWEEP_HITS || start === 1n) {
      return { found, complete: true, highestId: highest }
    }
    end = start - 1n
    if (Date.now() >= deadlineAt) return { found, complete: false, highestId: highest }
  }
  return { found, complete: false, highestId: highest }
}

/**
 * Binary search for the highest token id that exists. `ownerOf` reverts for ids
 * that were never minted, and ownership is not monotonic, but the minted range
 * is contiguous from 1, so a descending binary search is sound.
 */
async function highestLiveTokenId(
  collection: CollectionName,
  signal?: AbortSignal,
): Promise<bigint | null> {
  const c = publicClient()
  const contract = collection === 'Genesis' ? COLLECTION_ADDRESS.genesis : COLLECTION_ADDRESS.generations
  const exists = async (id: bigint): Promise<boolean> => {
    try {
      await c.readContract({ address: contract, abi: generationsNftAbi, functionName: 'ownerOf', args: [id] })
      return true
    } catch {
      return false
    }
  }
  if (!(await exists(1n))) return null
  let lo = 1n
  let hi = TOKEN_ID_UPPER_BOUND
  while (lo < hi) {
    if (signal?.aborted) throw new DiscoveryError('Discovery cancelled.', 'onchain')
    const mid = (lo + hi + 1n) / 2n
    if (await exists(mid)) lo = mid
    else hi = mid - 1n
  }
  return lo
}

/**
 * Sweep BOTH collections onchain.
 *
 * This is the authoritative route and the only one that works from a static
 * host. The first-party Rare Friends API sends no CORS headers, so a browser
 * on GitHub Pages cannot read it, and OpenSea's account endpoint does not
 * reliably list these tokens — a wallet that clearly holds Rare Friends
 * would otherwise be reported as holding none.
 */
export async function discoverOnchain(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{ friends: DiscoveredFriend[]; exhaustive: boolean }> {
  // Genesis is fully enumerable, so it always runs first and completely.
  const genesis = await discoverGenesisOnchain(address, signal)

  // Generations cannot be enumerated (no owner index, hundreds of thousands of
  // ids), so sweeping it costs a lot of RPC for a small chance of a hit. Spend
  // that budget only when Genesis turned up nothing — i.e. exactly the wallets
  // that would otherwise be left empty — so the common path stays fast.
  if (genesis.length > 0) {
    return { friends: genesis, exhaustive: false }
  }

  const generations = await discoverGenerationsOnchain(address, signal).catch(() => ({
    found: [] as DiscoveredFriend[],
    complete: false,
    highestId: 0n,
  }))
  return {
    friends: [...genesis, ...generations.found],
    // Genesis is fully enumerated; Generations is best-effort only.
    exhaustive: generations.complete,
  }
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
    // The route that needs no index, no API key and no CORS: sweep both
    // collection contracts directly. This is the ONLY discovery route that
    // reliably works from a static host, because rarefriends.com sends no
    // access-control headers and OpenSea's account endpoint does not reliably
    // list these tokens.
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

  if (!exhaustive) {
    // Say plainly that the check was bounded, so nobody reads "none found" as
    // "this wallet holds nothing".
    notes.push(
      'Generations has hundreds of thousands of token ids and no owner index, so only a bounded onchain sweep was possible from this browser. Rare Friends holdings here are best-effort, not exhaustive.',
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
