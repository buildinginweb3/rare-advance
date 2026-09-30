/**
 * HOME — THE FRIEND IS THE PRODUCT
 * ================================
 *
 * One Friend, one primary action, one next step.
 *
 * Reward weight, WETH, total network weight and pool utilisation are NOT on
 * this screen. They live behind DETAILS, GROW and LIQUIDITY where they belong.
 */

import { useMemo, useState } from 'react'
import { FriendArt } from '../components/FriendArt'
import { Badge, Notice, Panel, Stat } from '../components/ui'
import { FriendSwitcher } from '../components/FriendSwitcher'
import { formatDuration, formatRF, formatRFCompact, formatWeight } from '../math/rf'
import { availableActions } from '../protocol/actions'
import { streamRemainingMs } from '../chain/reads'
import { useDispatch, useSession, selectedFriend, sessionNowMs } from '../session/store'
import { LOCAL_LP_ID, useMarket } from '../session/marketStore'
import { isPositionSettled } from '../economy/pools/engine'
import { DEMO_WALLET_LABEL } from '../session/demoData'

export function DashboardView() {
  const state = useSession()
  const dispatch = useDispatch()
  const nowMs = sessionNowMs(state)
  const market = useMarket()
  const friend = selectedFriend(state)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const demo = state.mode === 'demo'
  const friends = state.friends

  const claimable = friend?.rewards.claimableRfWei ?? null
  const streaming = friend?.rewards.streamingRfWei ?? null
  const remaining = streamRemainingMs(friend?.rewards.streamFinishUnix ?? null, nowMs)
  const actions = useMemo(() => (friend ? availableActions(friend) : []), [friend])
  const nextAction = actions[0] ?? null

  const hasOpenPosition = market.pools.some(
    (p) => p.positions.some((x) => x.borrowerLpId === LOCAL_LP_ID && !isPositionSettled(x)),
  )

  return (
    <div className="stack">
      {!friend ? (
        <Panel title="MY FRIENDS" testId="home-empty">
          {friends.length === 0 ? (
            <div className="empty-state">
              <span className="h3">NO RARE FRIENDS FOUND</span>
              <p className="tiny">
                Rare Advance currently supports Rare Friends Genesis and Rare Friends Generations. This wallet
                does not hold any, or they could not be verified with a direct onchain read.
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => dispatch({ type: 'enter-demo' })}
                data-testid="empty-try-demo"
              >
                TRY DEMO INSTEAD
              </button>
            </div>
          ) : null}
        </Panel>
      ) : (
        <>
          {/* ---- the Friend ---- */}
          <Panel
            title="MY FRIEND"
            testId="friend-hero"
            right={
              friends.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSwitcherOpen(true)}
                  data-testid="open-friend-switcher"
                >
                  CHANGE FRIEND
                </button>
              ) : null
            }
          >
            <div className="friend-hero">
              <div className="friend-hero-art">
                <FriendArt friend={friend} size={152} />
              </div>
              <div>
                <div className="friend-hero-name">
                  {friend.collection} #{friend.tokenId}
                </div>
                <div className="friend-hero-meta">
                  <span className={friend.activated ? 'tag tag-on' : 'tag'}>
                    {friend.activated ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  {friend.collection === 'Genesis' ? (
                    <span className="tag">GENESIS</span>
                  ) : friend.temporary ? (
                    <span className="tag">TEMPORARY</span>
                  ) : (
                    <>
                      <span className="tag">GEN {friend.generation}</span>
                      <span className="tag">TIER {friend.tier ?? '—'}</span>
                    </>
                  )}
                </div>
                <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  {demo ? DEMO_WALLET_LABEL : 'LIVE READ-ONLY'}
                </p>
              </div>
            </div>
          </Panel>

          {/* ---- the two numbers that matter ---- */}
          <Panel title="YOUR RF" testId="your-rf">
            <div className="money-row">
              <div className="money">
                <div className="money-label">CLAIMABLE</div>
                <div className="money-value">
                  {claimable === null ? '—' : formatRF(claimable, 2)}
                  <span style={{ fontSize: '0.5em' }}> RF</span>
                </div>
                <div className="money-note">Ready to withdraw now</div>
              </div>
              <div className="money">
                <div className="money-label">STILL STREAMING</div>
                <div className="money-value">
                  {streaming === null ? '—' : formatRFCompact(streaming)}
                  <span style={{ fontSize: '0.5em' }}> RF</span>
                </div>
                <div className="money-note">
                  {remaining === null ? 'No active stream' : `Over ${formatDuration(remaining)}`}
                </div>
              </div>
            </div>

            <div className="money-actions">
              {hasOpenPosition ? (
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => dispatch({ type: 'set-view', view: 'advance' })}
                  data-testid="home-primary"
                >
                  MANAGE YOUR ACTIVE ADVANCE
                </button>
              ) : streaming !== null && streaming > 0n ? (
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => dispatch({ type: 'set-view', view: 'advance' })}
                  data-testid="home-primary"
                >
                  GET THIS STREAM EARLY
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => dispatch({ type: 'set-view', view: 'grow' })}
                  data-testid="home-primary"
                >
                  FINANCE YOUR FRIEND'S GROWTH
                </button>
              )}
            </div>
            {streaming !== null && streaming > 0n ? (
              <p className="tiny muted" style={{ marginTop: 6, marginBottom: 0 }}>
                Taking it early means giving up part of it. You can end the arrangement at any time and only
                pay the premium earned so far.
              </p>
            ) : null}
          </Panel>

          {/* ---- next step ---- */}
          <Panel title="NEXT STEP" testId="next-step">
            {nextAction ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="h3" style={{ fontSize: 10 }}>
                      {nextAction.title === 'UPGRADE'
                        ? `Upgrade to Tier ${(friend?.tier ?? 0) + 1}`
                        : nextAction.title === 'PROMOTE'
                          ? `Promote to Gen ${(friend?.generation ?? 2) - 1}`
                          : nextAction.title === 'HARDWIRE'
                            ? 'Hardwire this Friend'
                            : nextAction.title === 'REACTIVATE'
                              ? 'Reactivate this Friend'
                              : 'Activate this Genesis'}
                    </div>
                    <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                      {nextAction.costKnown
                        ? `${formatRF(nextAction.effect.costWei, 0)} RF`
                        : 'Cost depends on your RF balance'}
                    </p>
                  </div>
                  <Badge provenance="protocol" label="PROTOCOL ACTION" />
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ marginTop: 8 }}
                  onClick={() => dispatch({ type: 'set-view', view: 'grow' })}
                  data-testid="explore-growth"
                >
                  EXPLORE GROWTH
                </button>
              </>
            ) : (
              <Notice tone="info">
                {friend?.collection === 'Genesis'
                  ? 'GENESIS IS FULLY WEIGHTED. Genesis has no upgrades or promotions.'
                  : 'No further Rare Friends action is available at this Friend\'s current state.'}
              </Notice>
            )}
          </Panel>

          {/* ---- details, on demand ---- */}
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowDetails((v) => !v)}
              data-testid="toggle-home-details"
              aria-expanded={showDetails}
            >
              {showDetails ? 'HIDE DETAILS' : 'DETAILS'}
            </button>
            {showDetails && friend ? (
              <div className="panel-recess" style={{ marginTop: 8 }} data-testid="home-details">
                <Stat
                  label="Reward weight"
                  provenance={friend.weight}
                  value={formatWeight(friend.weightMicros, 6)}
                  hint="· determines this Friend's share of funded protocol rewards"
                />
                <Stat
                  label="Total active weight"
                  provenance={state.live.totalActiveWeightProvenance}
                  value={state.live.totalActiveWeightMicros === null ? 'Unavailable' : formatWeight(state.live.totalActiveWeightMicros, 2)}
                />
                <Stat
                  label="WETH rewards"
                  provenance={friend.rewards.claimableWeth}
                  value={friend.rewards.claimableWethWei === null ? '—' : `${formatRF(friend.rewards.claimableWethWei, 6)} WETH`}
                  hint="· WETH (wrapped ETH) · not financeable in v1"
                />
                {friend.rewards.streamingWethWei !== null ? (
                  <Stat
                    label="WETH still streaming"
                    provenance={friend.rewards.streamingWeth}
                    value={`${formatRF(friend.rewards.streamingWethWei, 6)} WETH`}
                  />
                ) : null}
                <Stat
                  label="Time left on this stream"
                  value={remaining === null ? 'No active stream' : formatDuration(remaining)}
                />
              </div>
            ) : null}
          </div>
        </>
      )}

      {switcherOpen ? <FriendSwitcher onClose={() => setSwitcherOpen(false)} /> : null}
    </div>
  )
}

/**
 * Friend switcher: a drawer, not a wall of financial cards. Each row is art,
 * identity and status only.
 */
