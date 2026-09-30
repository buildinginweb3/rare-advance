/**
 * NFT ARTWORK
 * ===========
 *
 * Artwork is display-only. It is never used for ownership and never used for
 * any economic figure.
 *
 * Sources, in order of fidelity:
 *
 *  1. ONCHAIN `tokenURI()` -> base64 metadata -> `image` data URI.
 *     This is the real Rare Friends artwork, generated on chain, read from the
 *     collection contract itself. It is fully onchain, needs no index, and
 *     cannot be stale. This is the primary source.
 *  2. OPENSEA API v2 image, used when OpenSea happens to have the token indexed.
 *  3. The on-device deterministic placeholder portrait, clearly captioned.
 *
 * The real artwork is never redrawn, recoloured or filtered. It is placed
 * inside the monochrome device UI exactly as the protocol produced it.
 */

import { createPublicClient, http, parseAbi } from 'viem'
import { CONTRACTS, COLLECTION_ADDRESS, OPENSEA_CHAIN, RARE_FRIENDS_BLOCK_EXPLORER } from '../protocol/rareFriendsConfig'
import type { CollectionName } from '../types'
import { rpcUrl } from './client'

const KEY = (import.meta.env?.VITE_OPENSEA_API_KEY as string | undefined)?.trim() ?? ''
const BASE = 'https://api.opensea.io/api/v2'

export const openseaConfigured = KEY.length > 0

export interface ArtAsset {
  identifier: string
  collection: CollectionName
  imageUrl: string | null
  name: string
  /** which path produced the image */
  source: 'onchain' | 'opensea' | 'none'
  openseaUrl: string | null
  traits: { type: string; value: string }[]
}

const tokenUriAbi = parseAbi(['function tokenURI(uint256 tokenId) view returns (string)'])

let uriClient: ReturnType<typeof createPublicClient> | null = null
function uriReader() {
  if (!uriClient) {
    uriClient = createPublicClient({
      transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }),
      batch: { multicall: { wait: 20, batchSize: 128 } },
    })
  }
  return uriClient
}

/**
 * Decode `data:application/json;base64,…` or a plain https URL into the
 * metadata object. Returns null rather than throwing on anything unexpected.
 */
function decodeMetadata(uri: string): { name?: string; image?: string } | null {
  try {
    if (uri.startsWith('data:application/json')) {
      const b64 = uri.slice(uri.indexOf(',') + 1)
      const json = JSON.parse(atob(b64)) as { name?: string; image?: string }
      return { name: json.name, image: json.image }
    }
    if (uri.startsWith('{')) {
      const json = JSON.parse(uri) as { name?: string; image?: string }
      return { name: json.name, image: json.image }
    }
    if (uri.startsWith('data:image') || uri.startsWith('https://') || uri.startsWith('ipfs://')) {
      return { image: uri }
    }
    return null
  } catch {
    return null
  }
}

/** A data: URI cannot be used in `src` unless it is already a data URI. */
function usableImageUrl(image: string | undefined): string | null {
  if (!image) return null
  if (image.startsWith('data:image')) return image
  if (image.startsWith('https://')) return image
  return null // ipfs:// and anything else is not resolvable without a gateway
}

export function tokenIdOf(id: string): bigint {
  return BigInt(id)
}

/** Read the real artwork straight from the collection contract. */
export async function fetchOnchainArt(
  collection: CollectionName,
  tokenId: string,
): Promise<{ imageUrl: string; name: string } | null> {
  try {
    const uri = await uriReader().readContract({
      address: COLLECTION_ADDRESS[collection === 'Genesis' ? 'genesis' : 'generations'],
      abi: tokenUriAbi,
      functionName: 'tokenURI',
      args: [tokenIdOf(tokenId)],
    })
    const meta = decodeMetadata(uri)
    const imageUrl = usableImageUrl(meta?.image)
    if (!imageUrl) return null
    return { imageUrl, name: meta?.name ?? `${collection} #${tokenId}` }
  } catch {
    // A token that does not exist, or a collection without onchain metadata.
    return null
  }
}

function contractFor(collection: CollectionName): `0x${string}` {
  return (collection === 'Genesis' ? CONTRACTS.genesis : CONTRACTS.generations) as `0x${string}`
}

function headers(): HeadersInit {
  return KEY ? { 'X-API-KEY': KEY, accept: 'application/json' } : { accept: 'application/json' }
}

/** OpenSea traits and canonical URL. Used for the metadata, not the image. */
export async function fetchOpenseaMetadata(
  collection: CollectionName,
  tokenId: string,
  signal?: AbortSignal,
): Promise<{ openseaUrl: string | null; traits: { type: string; value: string }[] } | null> {
  if (!openseaConfigured) return null
  const url = `${BASE}/chain/${OPENSEA_CHAIN}/contract/${contractFor(collection)}/nft/${tokenId}`
  try {
    const res = await fetch(url, { headers: headers(), signal })
    if (!res.ok) return null
    const json = (await res.json()) as {
      nft?: { opensea_url?: string | null; traits?: { trait_type: string; value: unknown }[] | null }
    }
    if (!json.nft) return null
    return {
      openseaUrl: json.nft.opensea_url ?? null,
      traits: (json.nft.traits ?? []).slice(0, 8).map((t) => ({ type: t.trait_type, value: String(t.value) })),
    }
  } catch {
    return null
  }
}

/**
 * Upper bound on artwork reads per session, so a wallet holding hundreds of
 * Friends never becomes hundreds of requests. Artwork is display-only.
 */
export const MAX_ARTWORK_FETCHES = 24

/**
 * Resolve artwork for a wallet's Friends, onchain first.
 * Concurrency is bounded and the queue is capped.
 */
export async function fetchArtwork(
  items: { collection: CollectionName; tokenId: string }[],
  signal?: AbortSignal,
): Promise<Map<string, ArtAsset>> {
  const out = new Map<string, ArtAsset>()
  if (items.length === 0) return out
  const queue = items.slice(0, MAX_ARTWORK_FETCHES)
  const concurrency = 6
  for (let i = 0; i < queue.length; i += concurrency) {
    if (signal?.aborted) return out
    const group = queue.slice(i, i + concurrency)
    const results = await Promise.all(
      group.map(async (it) => {
        const key = `${it.collection}:${it.tokenId}`
        const onchain = await fetchOnchainArt(it.collection, it.tokenId)
        if (onchain) {
          const meta = await fetchOpenseaMetadata(it.collection, it.tokenId, signal)
          return [
            key,
            {
              identifier: it.tokenId,
              collection: it.collection,
              imageUrl: onchain.imageUrl,
              name: onchain.name,
              source: 'onchain' as const,
              openseaUrl: meta?.openseaUrl ?? openseaAssetUrl(it.collection, it.tokenId),
              traits: meta?.traits ?? [],
            },
          ] as const
        }
        const meta = await fetchOpenseaMetadata(it.collection, it.tokenId, signal)
        return [
          key,
          {
            identifier: it.tokenId,
            collection: it.collection,
            imageUrl: null,
            name: `${it.collection} #${it.tokenId}`,
            source: 'none' as const,
            openseaUrl: meta?.openseaUrl ?? openseaAssetUrl(it.collection, it.tokenId),
            traits: meta?.traits ?? [],
          },
        ] as const
      }),
    )
    for (const [key, asset] of results) out.set(key, asset)
  }
  return out
}

export function openseaAssetUrl(collection: CollectionName, tokenId: string): string {
  return `https://opensea.io/assets/${OPENSEA_CHAIN}/${contractFor(collection)}/${tokenId}`
}

export function explorerTokenUrl(collection: CollectionName, tokenId: string): string {
  return `${RARE_FRIENDS_BLOCK_EXPLORER}/token/${contractFor(collection)}?a=${tokenId}`
}
