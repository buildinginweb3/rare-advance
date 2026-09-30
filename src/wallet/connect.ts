/**
 * READ-ONLY WALLET CONNECTION
 * ===========================
 *
 * EIP-1193 only, and read-only.
 *
 * The ONLY requests this app can make are:
 *   eth_requestAccounts   -> identity (what every dApp asks on connect)
 *   eth_chainId           -> network detection
 *   wallet_switchEthereumChain / wallet_addEthereumChain -> network switching
 *   eth_accounts          -> identity
 *
 * There is no `personal_sign`, no `eth_signTypedData_v4`, no `eth_sendTransaction`,
 * no `eth_sign` and no approval flow anywhere in this file or this codebase.
 * Wallet connection is used for identity and read-only discovery only.
 */

import { RARE_FRIENDS_CHAIN_ID, OFFICIAL_ROBINHOOD_RPC, RARE_FRIENDS_BLOCK_EXPLORER } from '../protocol/rareFriendsConfig'
import type { WalletState } from '../types'

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>
      on?(event: string, cb: (...args: unknown[]) => void): void
      removeListener?(event: string, cb: (...args: unknown[]) => void): void
    }
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && Boolean(window.ethereum)
}

function provider() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No EIP-1193 browser wallet detected.')
  }
  return window.ethereum
}

function isUserRejection(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 4001 || /user rejected|denied/i.test(e?.message ?? '')
}

function describe(err: unknown): string {
  const e = err as { code?: number; message?: string; shortMessage?: string }
  if (isUserRejection(err)) return 'Connection rejected in your wallet.'
  if (e?.code === -32002) return 'A wallet request is already open.'
  return e?.shortMessage || e?.message || 'Wallet request failed.'
}

export async function readChainId(): Promise<number | null> {
  if (!hasInjectedWallet()) return null
  try {
    const hex = (await provider().request({ method: 'eth_chainId' })) as string
    return Number.parseInt(hex, 16)
  } catch {
    return null
  }
}

/** Switch (or add) Robinhood Chain mainnet. Network config only, no signature. */
export async function ensureRobinhoodChain(): Promise<number> {
  const p = provider()
  const current = await readChainId()
  if (current === RARE_FRIENDS_CHAIN_ID) return current

  const params = {
    chainId: `0x${RARE_FRIENDS_CHAIN_ID.toString(16)}`,
    chainName: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [OFFICIAL_ROBINHOOD_RPC],
    blockExplorerUrls: [RARE_FRIENDS_BLOCK_EXPLORER],
  }
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainId }] })
  } catch (err) {
    const e = err as { code?: number }
    if (e?.code === 4902 || e?.code === -32603) {
      await p.request({ method: 'wallet_addEthereumChain', params: [params] })
    } else {
      throw err
    }
  }
  const after = await readChainId()
  return after ?? RARE_FRIENDS_CHAIN_ID
}

/** Connect for identity and read-only discovery. Never signs anything. */
export async function connectReadOnly(): Promise<WalletState> {
  if (!hasInjectedWallet()) {
    return {
      status: 'unsupported',
      address: null,
      chainId: await readChainId(),
      error: 'No EIP-1193 browser wallet detected in this browser.',
    }
  }
  try {
    const accounts = (await provider().request({ method: 'eth_requestAccounts' })) as string[]
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return { status: 'rejected', address: null, chainId: null, error: 'No account was shared.' }
    }
    const chainId = await ensureRobinhoodChain()
    if (chainId !== RARE_FRIENDS_CHAIN_ID) {
      return {
        status: 'wrong-network',
        address: accounts[0] as `0x${string}`,
        chainId,
        error: 'Your wallet is not on Robinhood Chain (4663). Switch networks to read live protocol data.',
      }
    }
    return { status: 'connected', address: accounts[0] as `0x${string}`, chainId, error: null }
  } catch (err) {
    return { status: 'rejected', address: null, chainId: await readChainId(), error: describe(err) }
  }
}

export function watchChain(callback: (chainId: number) => void): () => void {
  if (!hasInjectedWallet() || !window.ethereum?.on) return () => {}
  const handler = (...args: unknown[]) => {
    const chainId = args[0] as string
    if (typeof chainId === 'string') callback(Number.parseInt(chainId, 16))
  }
  window.ethereum.on('chainChanged', handler)
  return () => window.ethereum?.removeListener?.('chainChanged', handler)
}

export function watchAccounts(callback: (accounts: string[]) => void): () => void {
  if (!hasInjectedWallet() || !window.ethereum?.on) return () => {}
  const handler = (...args: unknown[]) => callback((args[0] as string[]) ?? [])
  window.ethereum.on('accountsChanged', handler)
  return () => window.ethereum?.removeListener?.('accountsChanged', handler)
}
