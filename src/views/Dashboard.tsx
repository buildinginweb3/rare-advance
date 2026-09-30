import { useMemo, useState } from 'react'
import { Device } from '../components/Device'
import { FriendArt } from '../components/FriendArt'
import { Badge, Lcd, Note, Notice, Panel, RfChip, SectionTitle, Stat, StatBlock } from '../components/ui'
import { formatRF, formatRFCompact, formatWeight, formatDuration, formatBpsAsPercent } from '../math/rf'
import { streamRemainingMs } from '../chain/reads'
import { NO_PROMISE_COPY, SIMULATED_QUOTES_LABEL } from '../economy/rareAdvanceConfig'
import { availableActions } from '../protocol/actions'
import { useDispatch, useSession, selectedFriend, sessionNowMs, type ViewId } from '../session/store'
import { DEMO_WALLET_LABEL } from '../session/demoData'
import { quoteFromSimulatedPool } from '../economy/advance'
import { SIMULATED_POOL_QUOTES } from '../economy/rareAdvanceConfig'
import { DEMO_NOTE } from '../content/copy'

function FriendCard({
  friend,
  selected,
  onSelect,
  nowMs,
}: {
  friend: import('../types').FriendPosition
  selected: boolean
  onSelect: () => void
  nowMs: number
}) {
  const remaining = streamRemainingMs(friend.rewards.streamFinishUnix, nowMs)
  const actions = availableActions(friend)
  const claimable = friend.rewards.claimableRfWei
  const streaming = friend.rewards.streamingRfWei

  return (
    <button
      type="button"
      className="fcard"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`friend-card-${friend.key}`}
      aria-label={`Select ${friend.collection} number ${friend.tokenId}`}
    >
      <span className="fcard-art">
        <FriendArt friend={friend} size={76} />
      </span>
      <span className="fcard-body">
        <span className="fcard-name">
          {friend.collection} #{friend.tokenId}
        </span>
        <span className="row-tight" style={{ marginBottom: 4 }}>
          <span className="tiny">{friend.activated ? 'ACTIVE' : 'INACTIVE'}</span>
          {friend.collection === 'Genesis' ? (
            <span className="tiny">GENESIS</span>
          ) : friend.temporary ? (
            // A temporary Friend has no fixed generation onchain.
            <span className="tiny">TEMPORARY · GEN ?</span>
          ) : (
            <span className="tiny">GEN {friend.generation}</span>
          )}
          {friend.collection === 'Generations' && !friend.temporary ? (
            <span className="tiny">TIER {friend.tier ?? '—'}</span>
          ) : null}
        </span>
        <Stat
          label="Reward weight"
          provenance={friend.weight}
          value={formatWeight(friend.weightMicros, 2)}
        />
        <Stat
          label="Claimable RF"
          provenance={friend.rewards.claimableRf}
          value={claimable === null ? 'NO REWARD POSITION' : `${formatRF(claimable, 3)} RF`}
          valueTestId="friend-claimable"
        />
        <Stat
          label="Streaming RF"
          provenance={friend.rewards.streamingRf}
          value={streaming === null ? 'Unavailable' : `${formatRF(streaming, 2)} RF`}
        />
        {friend.rewards.claimableWethWei !== null ? (
          <Stat
            label="WETH rewards"
            provenance={friend.rewards.claimableWeth}
            value={`${formatRF(friend.rewards.claimableWethWei, 6)} WETH`}
            hint="· not financeable"
          />
        ) : null}
        <Stat
          label="Stream remaining"
          value={remaining === null ? '—' : formatDuration(remaining)}
        />
        {actions.length > 0 ? (
          <span className="tiny" style={{ display: 'block', marginTop: 4 }}>
            NEXT: {actions.map((a) => a.title).join(' · ')}
          </span>
        ) : friend.collection === 'Genesis' && friend.activated ? (
          <span className="tiny" style={{ display: 'block', marginTop: 4 }}>
            GENESIS IS FULLY WEIGHTED
          </span>
        ) : null}
        <span className="row-tight" style={{ marginTop: 4 }}>
          {/* A DEMO Friend is never badged LIVE. Provenance follows the actual
              source of the value, never the surrounding mode. */}
          <Badge
            provenance={friend.stateSource === 'onchain' ? 'onchain' : 'simulated'}
            label={friend.stateSource === 'onchain' ? 'STATE · LIVE ONCHAIN' : 'STATE · SIMULATED'}
          />
          <Badge
            provenance={friend.artSource === 'onchain' ? 'onchain' : friend.artSource === 'opensea' ? 'opensea' : 'simulated'}
            label={
              friend.artSource === 'onchain'
                ? 'ART · LIVE ONCHAIN'
                : friend.artSource === 'opensea'
                  ? 'ART · OPENSEA'
                  : 'ART · PLACEHOLDER'
            }
          />
        </span>
      </span>
    </button>
  )
}

export function DashboardView() {
  const state = useSession()
  const dispatch = useDispatch()
  const nowMs = sessionNowMs(state)
  const friend = selectedFriend(state)
  const [showMarket, setShowMarket] = useState(true)

  const liveFields = state.live.status === 'ready'
  const demo = state.mode === 'demo'

  const marketQuotes = useMemo(() => {
    if (!friend) return []
    const eligible = friend.rewards.streamingRfWei ?? 0n
    if (eligible <= 0n) return []
    const duration = streamRemainingMs(friend.rewards.streamFinishUnix, nowMs) ?? 0n
    return SIMULATED_POOL_QUOTES.map((q) => ({
      def: q,
      quote: quoteFromSimulatedPool(eligible, duration, q.key),
    })).filter((x) => x.quote !== null)
  }, [friend, nowMs])

  return (
    <div className="stack">
      {/* ---------------- hero ---------------- */}
      <Panel dark>
        <div className="grid-hero">
          <div className="stack">
            <h1 className="h1">RARE ADVANCE</h1>
            <p className="h3" style={{ lineHeight: 1.9, color: 'var(--paper)' }}>
              Your Friend is already earning.
              <br />
              Don&apos;t wait to get paid.
            </p>
            <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 460 }}>
              Turn streaming $RAREFRIENDS rewards into liquidity today — or explore financing the actions
              that increase your Friend&apos;s reward weight.
            </p>
            <div className="row" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => dispatch({ type: 'enter-demo' })}
                data-testid="try-demo"
              >
                TRY DEMO
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => dispatch({ type: 'enter-live' })}
                data-testid="connect-wallet"
              >
                CONNECT WALLET
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--paper)', borderColor: 'var(--gray-1)' }}
                onClick={() => dispatch({ type: 'set-view', view: 'how' })}
                data-testid="hero-how"
              >
                HOW IT WORKS
              </button>
            </div>
            <Note dark>{DEMO_NOTE}</Note>
          </div>

          <div className="stack">
            <Device
              friend={friend}
              view={state.view}
              mode={state.mode}
              live={state.live}
              advance={state.advances[0] ?? null}
              onNavigate={(v: ViewId) => dispatch({ type: 'set-view', view: v })}
            />
            {friend ? (
              <div className="lcd" data-testid="hero-friend-readout">
                <div className="lcd-label">
                  <span>SELECTED FRIEND</span>
                  <Badge provenance={friend.stateSource} />
                </div>
                <Stat
                  label="Reward weight"
                  provenance={friend.weight}
                  value={formatWeight(friend.weightMicros, 2)}
                />
                <Stat
                  label="Claimable RF"
                  provenance={friend.rewards.claimableRf}
                  value={
                    friend.rewards.claimableRfWei === null
                      ? 'NO REWARD POSITION'
                      : `${formatRF(friend.rewards.claimableRfWei, 3)} RF`
                  }
                />
                <Stat
                  label="Streaming RF"
                  provenance={friend.rewards.streamingRf}
                  value={
                    friend.rewards.streamingRfWei === null
                      ? 'Unavailable'
                      : `${formatRF(friend.rewards.streamingRfWei, 2)} RF`
                  }
                />
                <Stat
                  label="Stream remaining"
                  value={
                    friend.rewards.streamFinishUnix === null
                      ? '—'
                      : formatDuration(streamRemainingMs(friend.rewards.streamFinishUnix, nowMs) ?? 0n)
                  }
                />
                <Stat
                  label="WETH rewards"
                  provenance={friend.rewards.claimableWeth}
                  value={
                    friend.rewards.claimableWethWei === null
                      ? '—'
                      : `${formatRF(friend.rewards.claimableWethWei, 6)} WETH`
                  }
                  hint="· not financeable"
                />
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      {/* ---------------- mode banner ---------------- */}
      <Panel
        title="STATUS"
        right={
          <>
            <Badge provenance={demo ? 'simulated' : 'onchain'} label={demo ? 'SIMULATED DEMO' : 'LIVE READ-ONLY'} large />
          </>
        }
      >
        <div className="grid-3">
          <StatBlock
            label="Mode"
            value={demo ? DEMO_WALLET_LABEL : 'CONNECTED WALLET'}
            provenance={demo ? 'simulated' : 'onchain'}
          />
          <StatBlock
            label="Protocol state"
            testId="protocol-state"
            value={
              demo
                ? 'DEMO SCENARIO'
                : liveFields && state.live.blockNumber
                  ? `READ AT BLOCK ${state.live.blockNumber.toLocaleString('en-US')}`
                  : 'Unavailable'
            }
            provenance={demo ? 'simulated' : liveFields ? 'onchain' : 'simulated'}
            hint={demo ? 'No chain is being read' : 'Robinhood Chain mainnet'}
          />
          <StatBlock
            label="Total active weight"
            testId="total-active-weight"
            provenance={state.live.totalActiveWeightProvenance}
            value={
              state.live.totalActiveWeightMicros === null
                ? 'Unavailable'
                : formatWeight(state.live.totalActiveWeightMicros, 2)
            }
            hint="Genesis + Generations share one pool"
          />
        </div>
        {demo ? (
          <div style={{ marginTop: 8 }}>
            <Notice tone="warn">
              Demo Mode is a <strong>SIMULATED DEMO WALLET</strong>. Friends, balances, reward streams and
              pool figures are synthetic and follow real protocol rules. No Rare Friends ownership is implied.
            </Notice>
          </div>
        ) : null}
      </Panel>

      {/* ---------------- live data honesty block ---------------- */}
      {!demo ? (
        <Panel title="LIVE DATA AVAILABLE">
          <div className="grid-3">
            <Lcd
              label="TOTAL ACTIVE WEIGHT"
              right={<Badge provenance={state.live.totalActiveWeightProvenance} />}
              value={state.live.totalActiveWeightMicros === null ? 'Unavailable' : formatWeight(state.live.totalActiveWeightMicros, 2)}
              small
            />
            <Lcd
              label="RF STREAM REMAINING"
              right={<Badge provenance={state.live.rfStream.remainderWei === null ? 'simulated' : 'onchain'} />}
              value={state.live.rfStream.remainderWei === null ? 'Unavailable' : `${formatRFCompact(state.live.rfStream.remainderWei)} RF`}
              small
            />
            <Lcd
              label="RF STREAM RATE"
              right={<Badge provenance={state.live.rfStream.rateWeiPerSec === null ? 'simulated' : 'onchain'} />}
              value={
                state.live.rfStream.rateWeiPerSec === null
                  ? 'Unavailable'
                  : `${formatRF(state.live.rfStream.rateWeiPerSec, 2)} RF/s`
              }
              small
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Note>
              <strong>ADVANCE MODEL:</strong> a Friend&apos;s currently-streaming slice is{' '}
              <em>MODELED</em> as <code>friendWeight / totalActiveWeight &times; stream remainder</code> using
              verified onchain values. The contracts expose a per-Friend claimable figure but no per-Friend
              forward projection, so this is never labelled LIVE.
            </Note>
          </div>
          <div style={{ marginTop: 8 }}>
            <Note>{NO_PROMISE_COPY.simulation}</Note>
          </div>
        </Panel>
      ) : null}

      {/* ---------------- my friends ---------------- */}
      <section aria-labelledby="my-friends">
        <SectionTitle
          right={
            <span className="tiny muted">
              {state.friends.length} {state.friends.length === 1 ? 'FRIEND' : 'FRIENDS'}
            </span>
          }
        >
          <span id="my-friends">MY FRIENDS</span>
        </SectionTitle>
        {state.friends.length === 0 ? (
          <Notice tone="info">
            {demo
              ? 'Demo Mode has no Friends loaded. Select TRY DEMO.'
              : 'No Rare Friends were found for this wallet. Every entry is verified with a direct onchain ownerOf() read before it is shown.'}
          </Notice>
        ) : (
          <div className="grid-3">
            {state.friends.map((f) => (
              <FriendCard
                key={f.key}
                friend={f}
                selected={f.key === state.selectedFriendKey}
                onSelect={() => dispatch({ type: 'select-friend', key: f.key })}
                nowMs={nowMs}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- market quote ---------------- */}
      {friend && friend.rewards.streamingRfWei !== null && friend.rewards.streamingRfWei > 0n ? (
        <Panel
          title="REWARD STREAM"
          right={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMarket((v) => !v)}
              aria-expanded={showMarket}
            >
              {showMarket ? 'HIDE' : 'SHOW'} QUOTES
            </button>
          }
        >
          <div className="grid-2">
            <Lcd
              label="ELIGIBLE STREAMING RF"
              right={<Badge provenance={friend.rewards.streamingRf} />}
              value={`${formatRF(friend.rewards.streamingRfWei, 2)} RF`}
              sub={
                <>
                  <RfChip /> {friend.collection} #{friend.tokenId} · weight{' '}
                  {formatWeight(friend.weightMicros, 2)}
                </>
              }
            />
            <div className="panel-recess">
              <div className="lcd-label">
                <span>REWARD POSITION</span>
              </div>
              <Stat
                label="Claimable RF"
                provenance={friend.rewards.claimableRf}
                value={
                  friend.rewards.claimableRfWei === null
                    ? 'NO REWARD POSITION'
                    : `${formatRF(friend.rewards.claimableRfWei, 3)} RF`
                }
              />
              <Stat
                label="Streaming RF"
                provenance={friend.rewards.streamingRf}
                value={
                  friend.rewards.streamingRfWei === null
                    ? 'Unavailable'
                    : `${formatRF(friend.rewards.streamingRfWei, 2)} RF`
                }
              />
              <Stat
                label="Stream remaining"
                value={
                  friend.rewards.streamFinishUnix === null
                    ? '—'
                    : formatDuration(streamRemainingMs(friend.rewards.streamFinishUnix, nowMs) ?? 0n)
                }
              />
            </div>
          </div>

          {showMarket ? (
            <div style={{ marginTop: 10 }}>
              <div className="lcd-label">
                <span>{SIMULATED_QUOTES_LABEL}</span>
                <Badge provenance="simulated" />
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <caption className="sr-only">Simulated pool quotes for the selected reward stream</caption>
                  <thead>
                    <tr>
                      <th scope="col">Pool</th>
                      <th scope="col" className="num">
                        Receive now
                      </th>
                      <th scope="col" className="num">
                        Settlement
                      </th>
                      <th scope="col" className="num">
                        Discount
                      </th>
                      <th scope="col" className="num">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketQuotes.map(({ def, quote }) => (
                      <tr key={def.key} data-testid={`quote-row-${def.key}`}>
                        <th scope="row">{def.label}</th>
                        <td className="num">{formatRF(quote!.youReceiveNowWei, 2)} RF</td>
                        <td className="num">{formatRF(quote!.settlementWei, 2)} RF</td>
                        <td className="num">{formatBpsAsPercent(def.discountBps)}</td>
                        <td className="num">{formatDuration(quote!.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 6 }}>
                <Note>
                  These are quotes from a single simulated pool model, not separate counterparties. No named
                  party here is a real person or a real market maker.
                </Note>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => dispatch({ type: 'set-view', view: 'advance' })}
                  data-testid="goto-advance"
                >
                  GET YOUR RF NOW
                </button>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
