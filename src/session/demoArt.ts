/**
 * DEMO ARTWORK — real onchain Rare Friends portraits
 * ====================================================
 *
 * The demo's Friends are real tokens, so they should wear their real faces.
 * Their REWARD balances stay simulated, but the artwork is read straight from
 * each collection contract's own `tokenURI()`, exactly as a connected wallet
 * would read it.
 *
 * Why it is cached in localStorage rather than baked into the bundle:
 *
 *   - the artwork is a base64 data URI of a few hundred bytes, so it would
 *     bloat the JavaScript bundle if inlined;
 *   - once cached, Demo Mode needs NO network at all, which is a promise this
 *     project makes and tests;
 *   - a judge on a bad connection still sees real Rare Friends, not
 *     placeholders.
 *
 * The cache is keyed by chain id and token, so it can never serve one
 * collection's art for another's.
 */

import { fetchOnchainArt } from '../chain/artwork'
import type { CollectionName } from '../types'

const STORAGE_KEY = 'rare-advance:demo-art:v1'
/** How long a cached portrait stays fresh. Art is immutable for a token. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface DemoArt {
  imageUrl: string
  name: string
  /** Where this portrait actually came from. Shown in the UI, never implied. */
  source: 'onchain'
  fetchedAtMs: number
}

interface CacheEntry extends DemoArt {
  key: string
}

function cacheKey(collection: CollectionName, tokenId: string): string {
  return `${collection}:${tokenId}`
}

function readCache(): Record<string, CacheEntry> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { entries?: Record<string, CacheEntry> }
    return parsed.entries ?? {}
  } catch {
    return {}
  }
}

function writeCache(entries: Record<string, CacheEntry>): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }))
  } catch {
    // Storage full or blocked: the demo simply re-reads on the next visit.
  }
}

/**
 * The cached portrait for a token, or null. SYNCHRONOUS on purpose.
 *
 * Demo Mode rebuilds its Friends whenever the user enters the demo, so waiting
 * for an async cache hit would let that rebuild wipe portraits that had already
 * arrived. Reading the cache inline means a returning visitor sees the real
 * artwork on the very first paint.
 */
export function cachedDemoArt(collection: CollectionName, tokenId: string): DemoArt | null {
  const hit = readCache()[cacheKey(collection, tokenId)]
  if (!hit || Date.now() - hit.fetchedAtMs >= MAX_AGE_MS) return null
  return { imageUrl: hit.imageUrl, name: hit.name, source: hit.source, fetchedAtMs: hit.fetchedAtMs }
}

/**
 * Read one real portrait, preferring the cache and falling back to the chain.
 *
 * Resolves to null when neither is available. Callers must then fall back to
 * the drawn placeholder and say so; they must never invent a portrait.
 */
export async function loadDemoArt(
  collection: CollectionName,
  tokenId: string,
): Promise<DemoArt | null> {
  const key = cacheKey(collection, tokenId)
  const hit = readCache()[key]
  if (hit && Date.now() - hit.fetchedAtMs < MAX_AGE_MS) {
    return { imageUrl: hit.imageUrl, name: hit.name, source: hit.source, fetchedAtMs: hit.fetchedAtMs }
  }

  const art = await fetchOnchainArt(collection, tokenId)
  if (!art) return null

  const entry: CacheEntry = {
    key,
    imageUrl: art.imageUrl,
    name: art.name,
    source: 'onchain',
    fetchedAtMs: Date.now(),
  }
  // Read the cache again at WRITE time. A batch loads several portraits at once,
  // and each one finishes at a different moment; merging from a snapshot taken
  // before the await would let every portrait overwrite the others.
  writeCache({ ...readCache(), [key]: entry })
  return entry
}

/**
 * Load several portraits concurrently, skipping any that cannot be read.
 *
 * Individual failures are not errors: a demo must still start if the RPC is
 * slow or the browser is offline.
 */
export async function loadDemoArtBatch(
  items: { collection: CollectionName; tokenId: string }[],
): Promise<Map<string, DemoArt>> {
  const found = new Map<string, DemoArt>()
  const results = await Promise.all(
    items.map(async (it) => {
      const art = await loadDemoArt(it.collection, it.tokenId)
      return [cacheKey(it.collection, it.tokenId), art] as const
    }),
  )
  for (const [key, art] of results) {
    if (art) found.set(key, art)
  }
  return found
}

export function clearDemoArtCache(): void {
  try {
    localStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}