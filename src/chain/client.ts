/**
 * READ-ONLY CHAIN ACCESS
 * ======================
 *
 * Everything here is read-only. There is no wallet client, no signer, no
 * `sendTransaction`, no `writeContract` and no approval anywhere in this
 * codebase. The public client is created from a public HTTP endpoint only.
 */

import { createPublicClient, http, defineChain, type PublicClient } from 'viem'
import {
  OFFICIAL_ROBINHOOD_RPC,
  RARE_FRIENDS_CHAIN_ID,
  RARE_FRIENDS_BLOCK_EXPLORER,
} from '../protocol/rareFriendsConfig'

export const robinhoodChain = defineChain({
  id: RARE_FRIENDS_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [OFFICIAL_ROBINHOOD_RPC] } },
  blockExplorers: {
    default: { name: 'Robinhood Chain Blockscout', url: RARE_FRIENDS_BLOCK_EXPLORER },
  },
  testnet: false,
})

const configuredRpc = (import.meta.env?.VITE_RPC_URL as string | undefined)?.trim()

/**
 * The official documented public endpoint is used unless an operator supplies
 * their own. Requests are short-lived and cached; nothing polls every second.
 */
export const rpcUrl = configuredRpc && configuredRpc.length > 0 ? configuredRpc : OFFICIAL_ROBINHOOD_RPC

export const rpcSource: DataSourceLabel =
  configuredRpc && configuredRpc.length > 0 ? 'ONCHAIN' : 'ONCHAIN'

type DataSourceLabel = 'ONCHAIN'

let client: PublicClient | null = null

export function publicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: robinhoodChain,
      transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
      batch: { multicall: { wait: 20, batchSize: 512 } },
    }) as PublicClient
  }
  return client
}

/** Small TTL cache so repeated view navigations do not hammer the RPC. */
const cache = new Map<string, { at: number; value: unknown }>()
const TTL_MS = 12_000

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.at < TTL_MS) return hit.value as T
  const value = await fn()
  cache.set(key, { at: now, value })
  return value
}

export function clearChainCache(): void {
  cache.clear()
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function sameAddress(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
}
