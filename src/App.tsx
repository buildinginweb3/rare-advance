import { useEffect, useMemo, useState } from 'react'
import { DashboardView } from './views/Dashboard'
import { AdvanceView } from './views/Advance'
import { GrowView } from './views/Grow'
import { LiquidityView, HowItWorksView } from './views/Liquidity'
import { InsightPanel } from './components/ActivationHero'
import { Badge, Notice } from './components/ui'
import { useDispatch, useSession, type ViewId } from './session/store'
import { useLiveData } from './session/useLiveData'
import { connectReadOnly, hasInjectedWallet, readChainId, watchAccounts, watchChain } from './wallet/connect'
import { RARE_FRIENDS_CHAIN_ID, RARE_FRIENDS_BLOCK_EXPLORER, PROTOCOL_RULES, REWARD_SHARE_FORMULA } from './protocol/rareFriendsConfig'
import { DEMO_NOTE } from './content/copy'

const NAV: { id: ViewId; label: string }[] = [
  { id: 'dashboard', label: 'DASHBOARD' },
  { id: 'advance', label: 'ADVANCE' },
  { id: 'grow', label: 'GROW' },
  { id: 'liquidity', label: 'LIQUIDITY' },
  { id: 'how', label: 'HOW' },
]

export function App() {
  const state = useSession()
  const dispatch = useDispatch()
  const [connecting, setConnecting] = useState(false)
  const live = useLiveData(state.mode === 'live' ? state.wallet.address : null)

  // keep the store in sync with live reads
  useEffect(() => {
    if (state.mode !== 'live') return
    if (live.result) {
      dispatch({ type: 'set-friends', friends: live.result.friends })
      dispatch({ type: 'set-live', live: live.result.live })
    }
  }, [state.mode, live.result, dispatch])

  useEffect(() => {
    if (state.mode !== 'live') return
    if (live.error) {
      dispatch({ type: 'set-live', live: { ...state.live, status: 'error', error: live.error } })
    }
  }, [state.mode, live.error, dispatch, state.live])

  useEffect(() => {
    if (state.mode !== 'live') return
    const offChain = watchChain((chainId) => {
      if (chainId !== RARE_FRIENDS_CHAIN_ID) {
        dispatch({
          type: 'set-wallet',
          wallet: {
            ...state.wallet,
            chainId,
            status: 'wrong-network',
            error: `Wallet is on chain ${chainId}. Switch to Robinhood Chain (${RARE_FRIENDS_CHAIN_ID}) to read live protocol data.`,
          },
        })
      }
    })
    const offAccounts = watchAccounts((accounts) => {
      if (accounts.length === 0) {
        dispatch({ type: 'set-wallet', wallet: { status: 'rejected', address: null, chainId: null, error: 'Wallet disconnected.' } })
      }
    })
    return () => {
      offChain()
      offAccounts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, dispatch])

  const demo = state.mode === 'demo'
  const friends = demo ? state.friends : (live.result?.friends ?? [])

  const selected = useMemo(
    () => friends.find((f) => f.key === state.selectedFriendKey) ?? null,
    [friends, state.selectedFriendKey],
  )

  const connect = async () => {
    setConnecting(true)
    dispatch({ type: 'enter-live' })
    const chainBefore = await readChainId()
    if (chainBefore === null) {
      dispatch({
        type: 'set-wallet',
        wallet: { status: 'unsupported', address: null, chainId: null, error: 'No EIP-1193 browser wallet detected.' },
      })
    } else {
      const wallet = await connectReadOnly()
      dispatch({ type: 'set-wallet', wallet })
    }
    setConnecting(false)
  }

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
          <nav className="nav" aria-label="Primary">
            {NAV.map((n) => (
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
          </nav>
        </div>
      </header>

      <main className="main" id="main">
        <div className="wrap">
          <div className="stack">
            {/* mode + connection strip */}
            <div className="panel" data-testid="status-strip">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row-tight">
                  <Badge
                    provenance={demo ? 'simulated' : 'onchain'}
                    label={demo ? 'SIMULATED DEMO WALLET' : 'LIVE READ-ONLY WALLET'}
                    large
                  />
                  {demo ? (
                    <Badge provenance="simulated" label="NO REAL NFT OR RF" />
                  ) : (
                    <Badge
                      provenance={state.wallet.chainId === RARE_FRIENDS_CHAIN_ID ? 'onchain' : 'simulated'}
                      label={
                        state.wallet.chainId === RARE_FRIENDS_CHAIN_ID
                          ? `ROBINHOOD CHAIN ${RARE_FRIENDS_CHAIN_ID}`
                          : `CHAIN ${state.wallet.chainId ?? '—'} · NEEDS 4663`
                      }
                    />
                  )}
                </div>
                <div className="row-tight">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatch({ type: 'enter-demo' })}
                    data-testid="strip-demo"
                  >
                    TRY DEMO
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={connect}
                    disabled={connecting}
                    data-testid="strip-connect"
                  >
                    {connecting ? 'CONNECTING…' : demo ? 'CONNECT WALLET' : 'RECONNECT'}
                  </button>
                </div>
              </div>

              {!demo ? (
                <div style={{ marginTop: 8 }}>
                  {state.wallet.status === 'rejected' || state.wallet.status === 'unsupported' || state.wallet.status === 'wrong-network' ? (
                    <Notice tone="error">
                      {state.wallet.error}{' '}
                      {!hasInjectedWallet() ? 'Try Demo Mode — it needs no wallet at all.' : null}
                    </Notice>
                  ) : null}

                  {live.loading ? <Notice tone="info">Reading Robinhood Chain…</Notice> : null}

                  {live.error ? (
                    <Notice tone="error">
                      {live.error}{' '}
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ marginTop: 6 }}
                        onClick={() => void live.retry()}
                        data-testid="retry-live"
                      >
                        RETRY
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ marginTop: 6 }}
                        onClick={() => dispatch({ type: 'enter-demo' })}
                      >
                        CONTINUE IN DEMO MODE
                      </button>
                    </Notice>
                  ) : null}

                  {live.result && live.result.friends.length === 0 && !live.loading && !live.error ? (
                    <Notice tone="info">
                      No Rare Friends found for this wallet. Every indexed entry is verified with a direct
                      onchain <code>ownerOf()</code> read before it is shown, and unverified entries are
                      dropped. {live.result.notes.join(' ')}
                    </Notice>
                  ) : null}

                  {live.result && live.result.friends.length > 0 ? (
                    <Notice tone="info">
                      Discovery route: <strong>{live.result.route}</strong>.{' '}
                      {live.result.readCount} Friend{live.result.readCount === 1 ? '' : 's'} read,{' '}
                      {live.result.totalVerified} verified with direct onchain <code>ownerOf()</code>.{' '}
                      {live.result.notes.join(' ')}
                    </Notice>
                  ) : null}
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <Notice tone="warn">{DEMO_NOTE}</Notice>
                </div>
              )}
            </div>

            {state.notice ? (
              <Notice tone={state.notice.tone === 'error' ? 'error' : state.notice.tone === 'warn' ? 'warn' : 'info'}>
                {state.notice.text}
              </Notice>
            ) : null}

            {state.view === 'dashboard' ? <DashboardView /> : null}
            {state.view === 'advance' ? <AdvanceView /> : null}
            {state.view === 'grow' ? <GrowView /> : null}
            {state.view === 'liquidity' ? <LiquidityView /> : null}
            {state.view === 'how' ? <HowItWorksView /> : null}

            {demo || state.view === 'how' ? <InsightPanel /> : null}

            <div className="section">
              <div className="panel">
                <div className="grid-2">
                  <div>
                    <h3 className="h3" style={{ marginBottom: 6 }}>
                      PROTOCOL RULES THIS TOOL RESPECTS
                    </h3>
                    <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
                      {PROTOCOL_RULES.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="h3" style={{ marginBottom: 6 }}>
                      DATA SOURCES
                    </h3>
                    <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
                      <li>
                        Robinhood Chain mainnet, chain {RARE_FRIENDS_CHAIN_ID} —{' '}
                        <a className="link" href={RARE_FRIENDS_BLOCK_EXPLORER} target="_blank" rel="noreferrer">
                          Blockscout
                        </a>
                      </li>
                      <li>ActivationManager.positions / earned / streams / totalWeight — read only</li>
                      <li>NFT artwork — onchain tokenURI() SVG, the real protocol pixels</li>
                      <li>OpenSea API v2 — secondary traits and canonical URL only, never ownership or value</li>
                      <li>Share formula: {REWARD_SHARE_FORMULA}</li>
                    </ul>
                  </div>
                </div>
                {selected ? (
                  <p className="tiny muted" style={{ marginBottom: 0, marginTop: 8 }}>
                    Selected: {selected.collection} #{selected.tokenId} · state source{' '}
                    {selected.stateSource === 'onchain' ? 'LIVE · ONCHAIN' : 'SIMULATED'} · artwork{' '}
                    {selected.imageUrl ? 'LIVE · OPENSEA' : 'placeholder'}.
                  </p>
                ) : null}
              </div>
            </div>
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
          <span>
            Rare Friends protocol data is read-only from Robinhood Chain. Rare Friends is a separate project;
            Rare Advance does not replace it.
          </span>
        </div>
      </footer>
    </div>
  )
}
