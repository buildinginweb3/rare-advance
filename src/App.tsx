import { useEffect } from 'react'
import { LandingView } from './views/Landing'
import { DashboardView } from './views/Dashboard'
import { AdvanceView } from './views/Advance'
import { GrowView } from './views/Grow'
import { LiquidityView } from './views/Liquidity'
import { HowView } from './views/HowItWorks'
import { Badge, Notice } from './components/ui'
import { WalletMessages } from './components/WalletMessages'
import { useDispatch, useSession, type ViewId } from './session/store'
import { useLiveData } from './session/useLiveData'
import { loadDemoArtBatch } from './session/demoArt'
import { useWallet } from './wallet/useWallet'

/**
 * NAVIGATION
 * ==========
 * Only what a Rare Friend HOLDER needs is primary. Liquidity provider mechanics
 * and the full explanation are one step away, not in the main path.
 */
const PRIMARY_NAV: { id: ViewId; label: string }[] = [
  { id: 'dashboard', label: 'HOME' },
  { id: 'advance', label: 'ADVANCE' },
  { id: 'grow', label: 'GROW' },
]
const SECONDARY_NAV: { id: ViewId; label: string }[] = [
  { id: 'liquidity', label: 'LIQUIDITY' },
  { id: 'how', label: 'HOW IT WORKS' },
]

export function App() {
  const state = useSession()
  const dispatch = useDispatch()
  const wallet = useWallet()
  const demo = state.mode === 'demo'

  // Live reads only run when a wallet is connected AND on the right chain.
  // Previously data loaded on the wrong chain and looked valid, which was wrong.
  // Live mode follows the WALLET, not the button: it is entered once a wallet is
  // actually connected on the right chain. A visitor who has deliberately
  // chosen TRY DEMO is never pulled out of it.
  const walletConnected =
    wallet.state.status === 'connected' || wallet.state.status === 'wrong-network' ||
    wallet.state.status === 'switch-unavailable'

  useEffect(() => {
    if (!walletConnected || (state.view !== 'landing' && state.landed)) return
    // A wrong chain blocks LIVE DATA, not the product. Land on the demo Friends
    // and let the status strip keep saying the data is not live.
    dispatch({ type: wallet.usable ? 'enter-live' : 'land' })
  }, [walletConnected, wallet.usable, state.view, state.landed, dispatch])

  const landed = state.landed && state.view !== 'landing'
  const liveAddress = !demo && wallet.usable ? wallet.state.address : null
  const live = useLiveData(liveAddress)

  useEffect(() => {
    if (!liveAddress) return
    if (live.result) {
      dispatch({ type: 'set-friends', friends: live.result.friends })
      dispatch({ type: 'set-live', live: live.result.live })
    }
    if (live.error) dispatch({ type: 'set-live-error', error: live.error })
    // state.live is deliberately NOT a dependency: the reducer merges the error,
    // so reading it here would re-trigger this effect on its own dispatch and
    // spin the app in a render loop.
  }, [liveAddress, live.result, live.error, dispatch])

  const friends = demo ? state.friends : (live.result?.friends ?? [])

  // Demo Mode wears the REAL onchain portraits. Read once per session from the
  // collection contracts (then cached), so a judge sees actual Rare Friends
  // rather than drawn placeholders. Reward balances stay simulated.
  const demoArtKey = demo ? friends.map((f) => `${f.collection}:${f.tokenId}`).join(',') : ''

  useEffect(() => {
    if (!demoArtKey) return
    let cancelled = false
    void loadDemoArtBatch(
      demoArtKey.split(',').map((key) => {
        const [collection, tokenId] = key.split(':') as ['Genesis' | 'Generations', string]
        return { collection, tokenId }
      }),
    ).then((art) => {
      if (cancelled || art.size === 0) return
      dispatch({
        type: 'apply-demo-art',
        art: Object.fromEntries([...art].map(([key, a]) => [key, { imageUrl: a.imageUrl, name: a.name }])),
      })
    })
    return () => {
      cancelled = true
    }
    // Keyed on the token list, not on the array identity, so an unrelated store
    // update cannot re-trigger a chain read.
  }, [demoArtKey, dispatch])

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className={demo ? 'brand-led on' : 'brand-led'} aria-hidden="true" />
            RARE ADVANCE
          </span>
          <span className="spacer" />
          {landed ? (
          <nav className="nav" aria-label="Primary">
            {PRIMARY_NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className="nav-btn"
                aria-current={state.view === n.id ? 'page' : undefined}
                onClick={() => dispatch({ type: 'set-view', view: n.id })}
                data-testid={`nav-${n.id}`}
              >
                {n.label}
              </button>
            ))}
            <span className="nav-sep" aria-hidden="true" />
            {SECONDARY_NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className="nav-btn nav-btn-quiet"
                aria-current={state.view === n.id ? 'page' : undefined}
                onClick={() => dispatch({ type: 'set-view', view: n.id })}
                data-testid={`nav-${n.id}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
          ) : null}
        </div>
      </header>

      <main className="main" id="main" data-testid="main">
        <div className="wrap">
          <div className="stack">
            {landed ? <WalletStrip /> : null}

            {state.notice ? (
              <Notice tone={state.notice.tone === 'error' ? 'error' : state.notice.tone === 'warn' ? 'warn' : 'info'}>
                {state.notice.text}
              </Notice>
            ) : null}

            {state.view === 'landing' || !state.landed ? <LandingView /> : null}
            {state.landed && state.view === 'dashboard' ? <DashboardView /> : null}
            {state.view === 'advance' ? <AdvanceView /> : null}
            {state.view === 'grow' ? <GrowView /> : null}
            {state.view === 'liquidity' ? <LiquidityView /> : null}
            {state.view === 'how' ? <HowView /> : null}
            {!landed ? <WalletStrip /> : null}

          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span className="h3" style={{ fontSize: 8 }}>
            RARE ADVANCE · ECONOMY POTENTIAL
          </span>
          <span>
            All Rare Advance financing, liquidity, settlement and burns are SIMULATED. No tokens or NFTs move.
            No transaction is ever signed. Reward weight is allocation weight, not yield.
          </span>
          <span>Rare Friends is a separate project; Rare Advance does not replace it.</span>
        </div>
      </footer>

      <span hidden>{friends.length}</span>
    </div>
  )
}

/**
 * A single global explanation of live vs simulated, plus the wallet control.
 * Provenance is available on individual numbers; it is not repeated everywhere.
 */
function WalletStrip() {
  const state = useSession()
  const dispatch = useDispatch()
  const wallet = useWallet()
  const demo = state.mode === 'demo'
  // A failed live read must say so. Silence would let a broken RPC look like
  // a wallet that simply owns nothing.
  const liveFailed = !demo && state.live.status === 'error'

  return (
    <div className="status-bar" data-testid="status-strip">
      <div className="status-bar-row">
        <Badge
          provenance={demo ? 'simulated' : 'onchain'}
          label={demo ? 'SIMULATED' : 'LIVE READ-ONLY'}
        />
        <span className="tiny status-bar-legend">
          {demo
            ? 'Artwork and protocol constants are read live from Robinhood Chain. Reward balances, advances, pools, financing and settlement are simulated.'
            : 'Friend ownership and protocol data are read-only from Robinhood Chain. Rare Advance financing is simulated.'}
        </span>
        <span className="spacer" />
        {!demo && wallet.state.address ? (
          <Badge
            provenance="onchain"
            label={`${wallet.state.address.slice(0, 6)}\u2026${wallet.state.address.slice(-4)}`}
          />
        ) : null}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => dispatch({ type: 'enter-demo' })}
          data-testid="strip-demo"
        >
          TRY DEMO
        </button>
        <WalletButton />
      </div>

      {/* Wallet problems matter in every mode: a rejection or a wrong network
          must never be hidden just because the user is in Demo Mode. */}
      {liveFailed ? (
        <Notice tone="warn">
          LIVE DATA UNAVAILABLE. {state.live.error ?? 'Robinhood Chain did not answer.'} Nothing on this
          screen is being read live right now.
        </Notice>
      ) : null}
      {/* Wallet problems matter in every mode: a rejection or a wrong network
          must never be hidden just because the user is in Demo Mode. */}
      <WalletMessages />
    </div>
  )
}

function WalletButton() {
  const wallet = useWallet()
  const dispatch = useDispatch()

  if (wallet.state.status === 'choosing' || wallet.providers.length > 1) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => wallet.retry()} data-testid="strip-connect">
        CHOOSE WALLET
      </button>
    )
  }
  if (wallet.isBusy) {
    return (
      <button type="button" className="btn btn-sm" disabled data-testid="strip-connect">
        {wallet.state.status === 'switching-network'
          ? 'SWITCHING NETWORK…'
          : wallet.state.status === 'requesting-accounts'
            ? 'CONNECTING…'
            : 'LOOKING FOR A WALLET…'}
      </button>
    )
  }
  if (wallet.usable) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => dispatch({ type: 'enter-demo' })}
        data-testid="strip-connect"
      >
        CONNECTED · DEMO
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => {
        void wallet.requestConnection()
      }}
      data-testid="strip-connect"
    >
      CONNECT WALLET
    </button>
  )
}
