/**
 * WALLET — EIP-6963 PROVIDER DISCOVERY + READ-ONLY CONNECTION
 * ============================================================
 *
 * STOP-SHIP fix for the previously fragile connection flow.
 *
 * What was wrong before, reproduced and fixed:
 *   1. `window.ethereum` was assumed to be the intended wallet. With MetaMask
 *      and Rabby both installed, `window.ethereum` is whichever injected last,
 *      so the user could be connected to the wallet they did not choose. There
 *      was no chooser at all. EIP-6963 now drives discovery and the user picks.
 *   2. Portfolio data was loaded and displayed even while the wallet was on the
 *      WRONG chain, so onchain reads were silently meaningless.
 *   3. A `wallet_addEthereumChain` rejection leaked a raw RPC message
 *      ("unsupported wallet_addEthereumChain") straight into the UI.
 *   4. Entering "live" mode happened before a wallet was even known to exist, so
 *      the no-provider case still showed a LIVE wallet badge.
 *   5. There was no in-progress state, so "Switching network…" was invisible.
 *
 * SAFETY: the only requests this module can ever make are account access and
 * network configuration. There is no `personal_sign`, no `eth_sign`,
 *  `eth_signTypedData*`, no `eth_sendTransaction` and no approval flow anywhere
 * in this file or this project.
 */

import {
  OFFICIAL_ROBINHOOD_RPC,
  RARE_FRIENDS_BLOCK_EXPLORER,
  RARE_FRIENDS_CHAIN_ID,
} from '../protocol/rareFriendsConfig'

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, cb: (...args: unknown[]) => void): void
  removeListener?(event: string, cb: (...args: unknown[]) => void): void
}

export interface DiscoveredProvider {
  info: { uuid: string; name: string; rdns: string; icon?: string }
  provider: Eip1193Provider
}

/** Current verified Robinhood Chain mainnet configuration. */
export const ROBINHOOD_CHAIN = {
  chainId: RARE_FRIENDS_CHAIN_ID,
  chainIdHex: `0x${RARE_FRIENDS_CHAIN_ID.toString(16)}`,
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [OFFICIAL_ROBINHOOD_RPC],
  blockExplorerUrls: [RARE_FRIENDS_BLOCK_EXPLORER],
  testnet: false,
} as const

export const ROBINHOOD_CHAIN_NAME = 'Robinhood Chain'

export type WalletStage =
  | 'idle'
  | 'discovering'
  | 'choosing'
  | 'requesting-accounts'
  | 'switching-network'
  | 'connected'
  | 'rejected'
  | 'unsupported'
  | 'wrong-network'
  | 'switch-unavailable'
  | 'disconnected'
  | 'error'

export interface WalletError {
  /** Short, human, and never a raw RPC string. */
  message: string
  /** What the user can do next. */
  hint: string
  code: string
}

export const NO_WALLET_ERROR: WalletError = {
  code: 'no-provider',
  message: 'No browser wallet detected.',
  hint: 'Install MetaMask or Rabby, or use TRY DEMO — the demo needs no wallet at all.',
}

export const WALLET_LOCKED_ERROR: WalletError = {
  code: 'wallet-locked',
  message: 'Your wallet is locked.',
  hint: 'Unlock your wallet, then try connecting again.',
}

export const REJECTED_ERROR: WalletError = {
  code: 'user-rejected',
  message: 'Connection cancelled.',
  hint: 'You declined the connection request. Nothing was changed.',
}

export const WRONG_NETWORK_ERROR: WalletError = {
  code: 'wrong-network',
  message: `${ROBINHOOD_CHAIN_NAME} is needed to read live protocol data.`,
  hint: `Switch your wallet to chain ${ROBINHOOD_CHAIN.chainId}, or continue in TRY DEMO.`,
}

export const SWITCH_UNAVAILABLE_ERROR: WalletError = {
  code: 'switch-unavailable',
  message: 'This wallet could not switch networks.',
  hint: `Add ${ROBINHOOD_CHAIN_NAME} manually (chain ${ROBINHOOD_CHAIN.chainId}), then reconnect.`,
}

/** Map any provider rejection onto a human-readable error. Never leaks raw text. */
export function explainProviderError(err: unknown): WalletError {
  const e = err as { code?: number | string; message?: string; name?: string }
  const code = typeof e?.code === 'number' ? e.code : undefined
  const msg = String(e?.message ?? '')

  if (code === 4001 || /user rejected|denied|cancell?ed/i.test(msg)) return REJECTED_ERROR
  if (code === 4100 || /unauthori[sz]ed/i.test(msg)) return REJECTED_ERROR
  if (code === 4902 || /unrecognized chain|not added|chain .* not/i.test(msg)) {
    return SWITCH_UNAVAILABLE_ERROR
  }
  if (code === -32002) {
    return {
      code: 'already-pending',
      message: 'A wallet request is already open.',
      hint: 'Check your wallet and finish or dismiss the pending request.',
    }
  }
  if (/locked|unlock/i.test(msg) || e?.name === 'WalletLockedError') return WALLET_LOCKED_ERROR
  if (code === -32601 || /unsupported method/i.test(msg)) return SWITCH_UNAVAILABLE_ERROR
  if (/disconnected|transport|network request failed/i.test(msg)) {
    return {
      code: 'disconnected',
      message: 'The wallet disconnected.',
      hint: 'Reopen your wallet, then reconnect.',
    }
  }
  return {
    code: 'unknown',
    message: 'The wallet could not complete the request.',
    hint: 'Try again, or continue in TRY DEMO.',
  }
}

// ---------------------------------------------------------------------------
// EIP-6963 discovery
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[]; isMetaMask?: boolean }
  }
}

/**
 * Subscribe to EIP-6963 announcements.
 *
 * This is the correct way to enumerate injected wallets: `window.ethereum` is
 * an implementation detail and is frequently the wrong wallet.
 */
/**
 * Wallets announce themselves asynchronously over EIP-6963, so "nothing has
 * arrived yet" and "nothing exists" are different states. This window is how
 * long we wait for a late announcement before telling the user, honestly, that
 * no wallet was found.
 */
export const DISCOVERY_WINDOW_MS = 1200

export function discoverProviders(onUpdate: (found: DiscoveredProvider[]) => void): () => void {
  const found = new Map<string, DiscoveredProvider>()

  const handleAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<DiscoveredProvider>).detail
    if (!detail?.info?.uuid || !detail.provider) return
    found.set(detail.info.uuid, detail)
    onUpdate([...found.values()])
  }
  const handleDisconnect = (event: Event) => {
    const detail = (event as CustomEvent<DiscoveredProvider>).detail
    if (!detail?.info?.uuid) return
    found.delete(detail.info.uuid)
    onUpdate([...found.values()])
  }

  window.addEventListener('eip6963:announceProvider', handleAnnounce)
  window.addEventListener('eip6963:disconnectProvider', handleDisconnect)
  // EIP-6963 requires the wallet to re-announce on request.
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  // Fallback for wallets that predate EIP-6963: read window.ethereum directly.
  if (typeof window !== 'undefined' && window.ethereum) {
    const legacy = window.ethereum
    if (!found.size) {
      onUpdate([
        {
          info: { uuid: 'legacy', name: legacy.isMetaMask ? 'MetaMask' : 'Browser Wallet', rdns: 'legacy' },
          provider: legacy,
        },
      ])
    }
  }

  return () => {
    window.removeEventListener('eip6963:announceProvider', handleAnnounce)
    window.removeEventListener('eip6963:disconnectProvider', handleDisconnect)
  }
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export interface ConnectOutcome {
  stage: WalletStage
  address: `0x${string}` | null
  chainId: number | null
  error: WalletError | null
}

function isAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)
}

export async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const hex = await provider.request({ method: 'eth_chainId' })
    return typeof hex === 'string' ? Number.parseInt(hex, 16) : null
  } catch {
    return null
  }
}

/**
 * Switch to Robinhood Chain, adding it first if the wallet does not know it.
 * Returns the chain the wallet ends up on.
 */
export async function switchToRobinhoodChain(
  provider: Eip1193Provider,
): Promise<{ ok: boolean; chainId: number | null; error: WalletError | null }> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ROBINHOOD_CHAIN.chainIdHex }],
    })
    return { ok: true, chainId: await readChainId(provider), error: null }
  } catch (err) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 4001) return { ok: false, chainId: null, error: REJECTED_ERROR }

    // 4902 / "unrecognized chain": add it, then switch again.
    if (e?.code === 4902 || /unrecognized chain|not added/i.test(String(e?.message ?? ''))) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ROBINHOOD_CHAIN.chainIdHex,
              chainName: ROBINHOOD_CHAIN.chainName,
              nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
              rpcUrls: [...ROBINHOOD_CHAIN.rpcUrls],
              blockExplorerUrls: [...ROBINHOOD_CHAIN.blockExplorerUrls],
            },
          ],
        })
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ROBINHOOD_CHAIN.chainIdHex }],
        })
        return { ok: true, chainId: await readChainId(provider), error: null }
      } catch (addErr) {
        const ae = addErr as { code?: number }
        if (ae?.code === 4001) return { ok: false, chainId: null, error: REJECTED_ERROR }
        return { ok: false, chainId: await readChainId(provider), error: SWITCH_UNAVAILABLE_ERROR }
      }
    }

    // -32601 means the wallet does not implement network switching at all.
    if (e?.code === -32601 || /unsupported method/i.test(String(e?.message ?? ''))) {
      return { ok: false, chainId: await readChainId(provider), error: SWITCH_UNAVAILABLE_ERROR }
    }

    return { ok: false, chainId: await readChainId(provider), error: explainProviderError(err) }
  }
}

/**
 * Connect for identity and read-only discovery.
 *
 * The wallet method allowlist for this whole project is:
 *   eth_requestAccounts, eth_accounts, eth_chainId,
 *   wallet_switchEthereumChain, wallet_addEthereumChain
 * Nothing else is ever requested.
 */
export async function connectReadOnly(provider: Eip1193Provider): Promise<ConnectOutcome> {
  let accounts: unknown
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' })
  } catch (err) {
    const error = explainProviderError(err)
    return { stage: error.code === 'user-rejected' ? 'rejected' : 'error', address: null, chainId: await readChainId(provider), error }
  }

  const list = Array.isArray(accounts) ? accounts : []
  if (!list.some(isAddress)) {
    return {
      stage: 'rejected',
      address: null,
      chainId: await readChainId(provider),
      error: {
        code: 'no-accounts',
        message: 'No account was shared.',
        hint: 'Unlock your wallet and allow this site to see your account address.',
      },
    }
  }

  const current = await readChainId(provider)
  if (current === ROBINHOOD_CHAIN.chainId) {
    return { stage: 'connected', address: list.find(isAddress)!, chainId: current, error: null }
  }

  const switched = await switchToRobinhoodChain(provider)
  if (switched.ok && switched.chainId === ROBINHOOD_CHAIN.chainId) {
    return { stage: 'connected', address: list.find(isAddress)!, chainId: switched.chainId, error: null }
  }

  // Not fatal: keep the identity, but do NOT pretend the chain is usable.
  return {
    stage: switched.error?.code === 'switch-unavailable' ? 'switch-unavailable' : 'wrong-network',
    address: list.find(isAddress)!,
    chainId: switched.chainId,
    error: switched.error ?? WRONG_NETWORK_ERROR,
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function watchChain(
  provider: Eip1193Provider,
  cb: (chainId: number) => void,
): () => void {
  if (!provider.on) return () => {}
  const handler = (...args: unknown[]) => {
    const chainId = args[0]
    if (typeof chainId === 'string') cb(Number.parseInt(chainId, 16))
  }
  provider.on('chainChanged', handler)
  return () => provider.removeListener?.('chainChanged', handler)
}

export function watchAccounts(
  provider: Eip1193Provider,
  cb: (accounts: string[]) => void,
): () => void {
  if (!provider.on) return () => {}
  const handler = (...args: unknown[]) => cb((args[0] as string[]) ?? [])
  provider.on('accountsChanged', handler)
  return () => provider.removeListener?.('accountsChanged', handler)
}

/** Shorten an address for display: 0x1234…ABCD */
export function shortenAddress(address: string | null): string {
  if (!address || address.length < 12) return address ?? '—'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
