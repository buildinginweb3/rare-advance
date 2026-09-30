/**
 * WALLET HOOK
 * ===========
 *
 * Owns the whole read-only connection lifecycle for one EIP-1193 provider:
 * discovery, provider choice, account access, network switching and wallet
 * events. The UI never talks to a provider directly.
 *
 * Nothing here can request a signature or a transaction.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  connectReadOnly,
  DISCOVERY_WINDOW_MS,
  discoverProviders,
  readChainId,
  ROBINHOOD_CHAIN,
  switchToRobinhoodChain,
  watchAccounts,
  watchChain,
  type DiscoveredProvider,
  type WalletStage,
} from './connect'
import type { WalletState } from '../types'

const INITIAL: WalletState = {
  status: 'discovering',
  address: null,
  chainId: null,
  error: null,
  hint: null,
}

function useWalletController() {
  const [state, setState] = useState<WalletState>(INITIAL)
  const [providers, setProviders] = useState<DiscoveredProvider[]>([])
  const [selected, setSelected] = useState<DiscoveredProvider | null>(null)
  const providerRef = useRef<DiscoveredProvider | null>(null)
  const busy = useRef(false)

  // EIP-6963 discovery.
  //
  // Discovery NEVER prompts. It only lists what is installed; account access is
  // requested later, from an explicit CONNECT WALLET press.
  useEffect(() => {
    const stop = discoverProviders((found) => {
      setProviders(found)
      setState((s) => {
        if (s.status !== 'discovering') return s
        if (found.length === 0) {
          return {
            ...s,
            status: 'unsupported',
            error: 'No browser wallet detected.',
            hint: 'Install MetaMask or Rabby, or use TRY DEMO — the demo needs no wallet at all.',
          }
        }
        // More than one wallet: let the user choose, but only when they ask.
        return { ...s, status: found.length > 1 ? 'choosing' : 'idle' }
      })
    })
    // If nothing announces within the discovery window, say so rather than
    // spinning on "looking for a wallet" forever.
    const settle = setTimeout(() => {
      setProviders((current) => {
        if (current.length === 0) {
          setState((s) =>
            s.status === 'discovering'
              ? {
                  ...s,
                  status: 'unsupported',
                  error: 'No browser wallet detected.',
                  hint: 'Install MetaMask or Rabby, or use TRY DEMO — the demo needs no wallet at all.',
                }
              : s,
          )
        }
        return current
      })
    }, DISCOVERY_WINDOW_MS)

    return () => {
      clearTimeout(settle)
      stop()
    }
  }, [])

  const connectWith = useCallback(async (target: DiscoveredProvider) => {
    if (busy.current) return
    busy.current = true
    providerRef.current = target
    setSelected(target)
    setState((s) => ({ ...s, status: 'requesting-accounts', error: null, hint: null }))
    try {
      const outcome = await connectReadOnly(target.provider)
      setState({
        status: outcome.stage as WalletStage,
        address: outcome.address,
        chainId: outcome.chainId,
        error: outcome.error?.message ?? null,
        hint: outcome.error?.hint ?? null,
      })
    } finally {
      busy.current = false
    }
  }, [])

  const switchNetwork = useCallback(async () => {
    const target = providerRef.current
    if (!target) return
    setState((s) => ({ ...s, status: 'switching-network', error: null, hint: null }))
    const result = await switchToRobinhoodChain(target.provider)
    setState((s) => ({
      ...s,
      status: result.ok && result.chainId === ROBINHOOD_CHAIN.chainId ? 'connected' : 'wrong-network',
      chainId: result.chainId ?? s.chainId,
      error: result.ok ? null : (result.error?.message ?? 'Could not switch networks.'),
      hint: result.ok ? null : (result.error?.hint ?? null),
    }))
  }, [])

  /**
   * Called from the CONNECT WALLET button.
   *
   * One wallet connects directly; several open the chooser; none says so plainly
   * instead of pretending to enter live mode.
   */
  const requestConnection = useCallback(async () => {
    if (providers.length === 0) {
      setState({
        ...INITIAL,
        status: 'unsupported',
        error: 'No browser wallet detected.',
        hint: 'Install MetaMask or Rabby, or use TRY DEMO — the demo needs no wallet at all.',
      })
      return
    }
    if (providers.length === 1) {
      await connectWith(providers[0]!)
      return
    }
    setState((s) => ({ ...s, status: 'choosing', error: null, hint: null }))
  }, [providers, connectWith])

  const retry = useCallback(async () => {
    if (providers.length === 1) await connectWith(providers[0]!)
    else if (providers.length > 1) setState((s) => ({ ...s, status: 'choosing', error: null, hint: null }))
    else setState(INITIAL)
  }, [providers, connectWith])

  const disconnect = useCallback(() => {
    providerRef.current = null
    setSelected(null)
    setState({
      status: providers.length > 0 ? 'idle' : 'unsupported',
      address: null,
      chainId: null,
      error: null,
      hint: null,
    })
  }, [providers.length])

  // Wallet events.
  useEffect(() => {
    const target = providerRef.current
    if (!target) return
    const offChain = watchChain(target.provider, (chainId) => {
      setState((s) =>
        chainId === ROBINHOOD_CHAIN.chainId
          ? { ...s, status: 'connected', chainId, error: null, hint: null }
          : {
              ...s,
              status: 'wrong-network',
              chainId,
              error: `${ROBINHOOD_CHAIN.chainName} is needed to read live protocol data.`,
              hint: `Switch your wallet to chain ${ROBINHOOD_CHAIN.chainId}, or continue in TRY DEMO.`,
            },
      )
    })
    const offAccounts = watchAccounts(target.provider, (accounts) => {
      setState((s) =>
        accounts.length === 0
          ? {
              status: 'disconnected',
              address: null,
              chainId: null,
              error: 'Wallet disconnected.',
              hint: 'Reconnect to read live protocol data again.',
            }
          : { ...s, address: accounts[0] as `0x${string}` },
      )
    })
    return () => {
      offChain()
      offAccounts()
    }
  }, [selected])

  const isBusy =
    state.status === 'requesting-accounts' ||
    state.status === 'switching-network' ||
    state.status === 'discovering'

  return useMemo(
    () => ({
      state,
      providers,
      selected,
      isBusy,
      /** A wallet is usable only when connected AND on the right chain. */
      usable: state.status === 'connected' && state.chainId === ROBINHOOD_CHAIN.chainId,
      connect: connectWith,
      requestConnection,
      switchNetwork,
      retry,
      disconnect,
      readChainId: () => (providerRef.current ? readChainId(providerRef.current.provider) : Promise.resolve(null)),
    }),
    [state, providers, selected, isBusy, connectWith, requestConnection, switchNetwork, retry, disconnect],
  )
}

export type WalletController = ReturnType<typeof useWalletController>

/**
 * One provider, one discovery subscription. Mounted once at the app root so the
 * UI can read wallet state from anywhere without re-running EIP-6963 discovery.
 */
const WalletCtx = createContext<WalletController | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const controller = useWalletController()
  return <WalletCtx.Provider value={controller}>{children}</WalletCtx.Provider>
}

export function useWallet(): WalletController {
  const c = useContext(WalletCtx)
  if (!c) throw new Error('useWallet must be used inside WalletProvider')
  return c
}
