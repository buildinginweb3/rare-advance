/**
 * ADVANCE — ONE DECISION AT A TIME
 * =================================
 *
 * The primary holder flow, in this order and nothing else:
 *
 *   1. YOUR STREAM          — how much RF is still streaming
 *   2. HOW MUCH DO YOU WANT EARLY  — 25 / 50 / 75 / MAX
 *   3. CHOOSE A POOL        — every eligible pool, compared factually, no verdict
 *   4. CONFIRM               — a short, comprehensible sheet
 *   5. WATCH IT SETTLE      — or pay it off early
 *
 * Everything technical (principal, discount basis points, funding snapshots,
 * pool utilisation) is behind VIEW DETAILS.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import { Badge, Lcd, Note, Notice, Panel, ProgressBar, RfChip, SectionTitle, Stat } from '../components/ui'
import { SettlementScene } from '../components/SettlementScene'
import { formatBpsAsPercent, formatDuration, formatRF, mulBps, BPS_SCALE } from '../math/rf'
import { ADVANCE_PRESETS, ADVANCE_MARKET_TERMS, SIM_TIME_STEP_MS } from '../economy/rareAdvanceConfig'
import {
  isPositionSettled,
  positionOutstandingRfWei,
  payoffQuoteWei,
} from '../economy/pools/engine'
import { streamOffers, type StreamOffer } from '../economy/pools/market'
import { streamRemainingMs } from '../chain/reads'
import { useDispatch, useSession, selectedFriend, sessionNowMs } from '../session/store'
import { LOCAL_LP_ID, useMarket, useMarketDispatch } from '../session/marketStore'
import { ADVANCE_HEADLINE, NOT_A_LOAN } from '../content/copy'
import { PROTOCOL_STREAM_DURATION_MS } from '../economy/pools/terms'
import type { Position } from '../economy/pools/types'

export function AdvanceView() {
  const state = useSession()
  const dispatch = useDispatch()
  const market = useMarket()
  const marketDispatch = useMarketDispatch()
  const nowMs = sessionNowMs(state)
  const friend = selectedFriend(state)

  const [bps, setBps] = useState<bigint>(10_000n)
  const [custom, setCustom] = useState('')
  const [customFace, setCustomFace] = useState<bigint | null>(null)
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const myPositions = useMemo(
    () => market.pools.flatMap((p) => p.positions.filter((x) => x.borrowerLpId === LOCAL_LP_ID)),
    [market.pools],
  )
  const openPosition = useMemo(() => myPositions.find((p) => !isPositionSettled(p)) ?? null, [myPositions])
  const settledPosition = useMemo(() => myPositions.find((p) => isPositionSettled(p)) ?? null, [myPositions])

  const streamRemaining = streamRemainingMs(friend?.rewards.streamFinishUnix ?? null, nowMs)
  const eligible = friend?.rewards.streamingRfWei ?? null
  const eligibleWei = eligible === null ? 0n : eligible

  const faceValue = customFace ?? (eligible === null ? 0n : mulBps(eligibleWei, bps))

  // Competing offers from every pool that can fund this.
  const offers: StreamOffer[] = useMemo(
    () =>
      streamOffers(
        market.pools,
        {
          friendKey: friend?.key ?? '',
          eligibleStreamingWei: faceValue,
          termMs: streamRemaining ?? PROTOCOL_STREAM_DURATION_MS,
          borrowerLpId: LOCAL_LP_ID,
        },
      ),
    [market.pools, friend?.key, faceValue, streamRemaining],
  )

  const offer = offers.find((o) => o.poolId === selectedPoolId) ?? offers[0] ?? null
  const noStream = eligible === null || eligibleWei === 0n

  return (
    <div className="stack">
      <Panel dark>
        <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
          {ADVANCE_HEADLINE}
        </h1>
        <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 440, marginTop: 6 }}>
          Get part of the RF your Friend has already earned, before the stream finishes paying it out.
        </p>
      </Panel>

      {!friend ? (
        <Notice tone="info">Select a Friend on HOME first.</Notice>
      ) : null}

      {friend && noStream ? (
        <Panel title={`${friend.collection} #${friend.tokenId}`} testId="advance-empty">
          <div className="empty-state">
            <span className="h3">NO RF AVAILABLE TO ADVANCE YET</span>
            <p className="tiny">
              This Friend does not currently have an eligible RF stream.
              {friend.activated
                ? ' Reward streams are funded by protocol activity and can be empty between streams.'
                : ' It is not active, so it has no reward weight and no stream.'}
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => dispatch({ type: 'set-view', view: 'dashboard' })}
                data-testid="choose-other-friend"
              >
                CHOOSE ANOTHER FRIEND
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => dispatch({ type: 'set-view', view: 'grow' })}
                data-testid="explore-grow"
              >
                EXPLORE GROW
              </button>
            </div>
          </div>
        </Panel>
      ) : null}

      {friend && !noStream && !openPosition ? (
        <>
          {/* ---- 1. your stream ---- */}
          <Panel title="YOUR STREAM" right={<Badge provenance={friend.rewards.streamingRf} />}>
            <Lcd
              label="STILL STREAMING"
              value={`${formatRF(eligibleWei, 2)} RF`}
              sub={
                <>
                  Over{' '}
                  {streamRemaining === null ? '7 days' : formatDuration(streamRemaining)} ·{' '}
                  {friend.collection} #{friend.tokenId}
                </>
              }
            />
          </Panel>

          {/* ---- 2. how much early ---- */}
          <Panel title="HOW MUCH DO YOU WANT EARLY?" right={<Badge provenance="simulated" label="SIMULATED" />}>
            <div className="btn-group" role="group" aria-label="Advance presets">
              {ADVANCE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="btn btn-outline btn-toggle"
                  aria-pressed={customFace === null && bps === p.bps}
                  onClick={() => {
                    setBps(p.bps)
                    setCustom('')
                    setCustomFace(null)
                    setSelectedPoolId(null)
                  }}
                  data-testid={`preset-${p.label.replace('%', '')}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label className="tiny" htmlFor="advance-custom">
                OR A SPECIFIC AMOUNT
              </label>
              <input
                id="advance-custom"
                style={inputStyle}
                inputMode="decimal"
                placeholder="e.g. 250"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                data-testid="advance-custom"
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const v = parseRf(custom)
                  if (v === null || v <= 0n) return
                  setCustomFace(v)
                  setSelectedPoolId(null)
                }}
                data-testid="advance-custom-apply"
              >
                USE
              </button>
            </div>
            {customFace !== null && customFace > eligibleWei ? (
              <Notice tone="warn">
                That is more than this Friend is currently streaming. Capped at {formatRF(eligibleWei, 2)} RF.
              </Notice>
            ) : null}
          </Panel>

          {/* ---- 3. choose a pool ---- */}
          <Panel
            title="CHOOSE A POOL"
            right={<span className="tiny muted">{offers.length} AVAILABLE</span>}
          >
            {offers.length === 0 ? (
              <Notice tone="warn">
                No pool can fund that amount right now. Try a smaller amount, or add liquidity in LIQUIDITY.
              </Notice>
            ) : (
              <>
                <div className="stack" data-testid="offers">
                  {offers.slice(0, 3).map((o) => (
                    <OfferCard
                      key={o.poolId}
                      offer={o}
                      selected={offer?.poolId === o.poolId}
                      onSelect={() => setSelectedPoolId(o.poolId)}
                    />
                  ))}
                </div>
                {offers.length > 3 ? (
                  <p className="tiny muted">
                    + {offers.length - 3} more pools available.{' '}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDetails(true)}>
                      VIEW DETAILS
                    </button>
                  </p>
                ) : null}
              </>
            )}
          </Panel>

          {/* ---- 4. confirm ---- */}
          {offer ? (
            confirming ? (
              <Panel title="GET RF EARLY" testId="advance-confirm">
                <div className="confirm-sheet">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="tiny">You receive now</span>
                    <span className="confirm-figure">{formatRF(offer.youGetNowWei, 2)} RF</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="tiny">Your stream settling later</span>
                    <span className="confirm-figure">{formatRF(offer.settlementWei, 2)} RF</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="tiny">Total cost</span>
                    <span className="confirm-figure">{formatRF(offer.maxCostWei, 2)} RF</span>
                  </div>
                </div>
                <Note>
                  No NFT moves. No real RF moves in this demo. You can pay this off early at any time.
                </Note>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-block"
                    onClick={() => {
                      marketDispatch({
                        type: 'open-stream',
                        poolId: offer.poolId,
                        positionId: `sp-${Date.now().toString(36)}`,
                        friendKey: friend.key,
                        faceValueWei: offer.settlementWei,
                        termMs: offer.termMs,
                      })
                      setConfirming(false)
                      setShowDetails(false)
                    }}
                    data-testid="confirm-advance"
                  >
                    CONFIRM SIMULATED ADVANCE
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)} data-testid="cancel-advance">
                    CANCEL
                  </button>
                </div>
              </Panel>
            ) : (
              <div className="cta-bar">
                <div>
                  <div className="tiny muted">YOU GET NOW</div>
                  <div className="cta-figure">{formatRF(offer.youGetNowWei, 2)} RF</div>
                  <div className="tiny muted">
                    {offer.poolName} · cost {formatRF(offer.maxCostWei, 2)} RF
                  </div>
                </div>
                <button
                  type="button"
                  className="btn cta-bar-btn"
                  onClick={() => setConfirming(true)}
                  data-testid="take-advance"
                >
                  GET {formatRF(offer.youGetNowWei, 0)} RF NOW
                </button>
              </div>
            )
          ) : null}

          {/* ---- details, on demand only ---- */}
          {showDetails && offer ? (
            <Panel title="DETAILS" testId="advance-details" right={<Badge provenance="simulated" />}>
              <div className="grid-2">
                <div className="panel-recess">
                  <Stat label="Stream value" value={`${formatRF(offer.settlementWei, 4)} RF`} />
                  <Stat label="You receive now" value={`${formatRF(offer.youGetNowWei, 4)} RF`} />
                  <Stat label="Pool principal" value={`${formatRF(offer.youGetNowWei, 4)} RF`} />
                  <Stat label="Settlement value" value={`${formatRF(offer.settlementWei, 4)} RF`} />
                </div>
                <div className="panel-recess">
                  <Stat label="LP premium" provenance="simulated" value={`${formatRF(offer.lpPremiumWei, 4)} RF · ${formatBpsAsPercent(offer.lpPremiumBps)}`} />
                  <Stat label="Rare Advance fee" provenance="simulated" value={`${formatRF(offer.rareAdvanceFeeWei, 4)} RF · ${formatBpsAsPercent(offer.rareAdvanceFeeBps)}`} />
                  <Stat label="Total cost" value={`${formatRF(offer.maxCostWei, 4)} RF`} />
                  <Stat label="Time left" value={formatDuration(offer.termMs)} />
                  <Stat label="Pool available" provenance="simulated" value={`${formatRF(offer.availableWei, 0)} RF`} />
                </div>
              </div>
              <Note>
                {ADVANCE_MARKET_TERMS.label}: the holder receives 95% of the stream, the pool takes its premium,
                and 1% is modelled as a Rare Advance burn. Pools set their own premium, so it varies by pool.
              </Note>
            </Panel>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDetails(true)} data-testid="show-advance-details">
              VIEW DETAILS
            </button>
          )}
        </>
      ) : null}

      {/* ---- an advance is already open ---- */}
      {openPosition ? <OpenPositionCard position={openPosition} onSimulate={() => marketDispatch({ type: 'advance-time', deltaMs: BigInt(SIM_TIME_STEP_MS) })} /> : null}

      {/* ---- recently settled ---- */}
      {settledPosition && !openPosition ? (
        <Panel title="SETTLED ✓" testId="advance-settled-banner">
          <p className="tiny" style={{ marginTop: 0 }}>
            Your last advance has been fully settled.
          </p>
          <div className="panel-recess">
            <Stat label="Settled from" value={settledPosition.kind === 'stream' ? 'your reward stream' : 'modeled rewards'} />
            <Stat label="Total cost" value={`${formatRF(settledPosition.maxLpPremiumWei, 2)} RF`} />
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'set-view', view: 'dashboard' })}
            data-testid="back-to-friend"
          >
            BACK TO MY FRIEND
          </button>
        </Panel>
      ) : null}

      <Panel title="WHAT THIS IS NOT">
        <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
          {NOT_A_LOAN.map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li>Reward weight is allocation weight, not tokens, yield, return or ROI.</li>
        </ul>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offer card
// ---------------------------------------------------------------------------

function OfferCard({
  offer,
  selected,
  onSelect,
}: {
  offer: StreamOffer
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className="fcard offer-card"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`offer-${offer.poolId}`}
    >
      <span className="fcard-body">
        <span className="row-tight" style={{ marginBottom: 4 }}>
          {offer.privatePool ? <Badge provenance="simulated" label="PRIVATE" /> : null}
          <Badge provenance="simulated" label={`LP PREMIUM ${formatBpsAsPercent(offer.lpPremiumBps)}`} />
        </span>
        <span className="fcard-name">{offer.poolName}</span>
        <span className="offer-grid">
          <span>
            <span className="tiny muted">YOU GET NOW</span>
            <span className="offer-figure">{formatRF(offer.youGetNowWei, 2)} RF</span>
          </span>
          <span>
            <span className="tiny muted">TOTAL COST</span>
            <span className="offer-figure">{formatRF(offer.maxCostWei, 2)} RF</span>
          </span>
          <span>
            <span className="tiny muted">SETTLEMENT</span>
            <span className="offer-figure">{formatRF(offer.settlementWei, 2)} RF</span>
          </span>
          <span>
            <span className="tiny muted">TIME LEFT</span>
            <span className="offer-figure">{formatDuration(offer.termMs)}</span>
          </span>
        </span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Open position + manual payoff
// ---------------------------------------------------------------------------

function OpenPositionCard({ position, onSimulate }: { position: Position; onSimulate: () => void }) {
  const market = useMarket()
  const marketDispatch = useMarketDispatch()
  const [showDetails, setShowDetails] = useState(false)
  const [payMode, setPayMode] = useState<bigint | null>(null)
  const [customPay, setCustomPay] = useState('')
  const [scene, setScene] = useState(false)

  const outstandingRf = positionOutstandingRfWei(position)
  const payoffQuote = payoffQuoteWei(position)
  const elapsedPct =
    position.kind === 'stream' && position.termMs > 0n
      ? Number((position.elapsedMs * 10_000n) / position.termMs)
      : 0
  const settledPct =
    position.principalWei > 0n
      ? Number(((position.principalWei + position.premiumPaidWei - outstandingRf) * 10_000n) / (position.principalWei + position.maxLpPremiumWei || 1n))
      : 0

  const pool = market.pools.find((p) => p.id === position.poolId)
  const funders = position.funding
    .map((f) => `${pool?.lps[f.lpId]?.displayName ?? f.lpId} ${Number(f.shareBps) / 100}%`)
    .join(' · ')

  const payAmount = (() => {
    if (payMode === null) return null
    if (payMode === BPS_SCALE) return payoffQuote
    return mulBps(outstandingRf, payMode)
  })()

  return (
    <Panel
      title="ADVANCE ACTIVE"
      testId="advance-active"
      right={<Badge provenance="simulated" label="SIMULATED" large />}
    >
      {scene ? (
        <SettlementScene
          advance={{
            id: position.id,
            friendKey: position.friendKey,
            quote: {
              faceValueWei: position.kind === 'stream' ? position.faceValueWei : position.principalWei + position.maxLpPremiumWei,
              youReceiveNowWei: position.principalWei,
              settlementWei: position.principalWei + position.maxLpPremiumWei,
              lpSpreadWei: position.maxLpPremiumWei,
              rareAdvanceBurnWei: position.kind === 'stream' ? position.rareAdvanceFeeWei : 0n,
              discountBps: position.maxLpPremiumWei > 0n ? 0n : 0n,
              lpSpreadBps: 0n,
              rareAdvanceBurnBps: 0n,
              durationMs: position.kind === 'stream' ? position.termMs : 0n,
              quoteKind: 'standard',
            },
            createdAtMs: position.createdAtMs,
            elapsedMs: position.elapsedMs,
            settledWei: position.principalRepaidWei,
            lpEarnedWei: 0n,
            burnWei: 0n,
            stage: 'active',
            simulated: true,
          }}
          friend={null}
          onDone={() => setScene(false)}
        />
      ) : null}

      <div className="grid-2">
        <Lcd label="YOU RECEIVED" value={`${formatRF(position.principalWei, 2)} RF`} sub={<>{<RfChip />} settled from the pool that funded you</>} />
        <Lcd
          label="STILL TO SETTLE"
          value={`${formatRF(outstandingRf, 2)} RF`}
          sub={<>TIME LEFT {position.kind === 'stream' && position.termMs > position.elapsedMs ? formatDuration(position.termMs - position.elapsedMs) : 'until you pay it off'}</>}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <ProgressBar pct={settledPct} label="Advance settlement progress" />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <span className="tiny mono-num" data-testid="advance-progress">
            {formatRF(position.principalRepaidWei, 2)} / {formatRF(position.principalWei, 2)} RF principal
          </span>
          <span className="tiny mono-num">{Number(elapsedPct) / 100}% of the term</span>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn" onClick={onSimulate} data-testid="simulate-time">
          SIMULATE TIME
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setScene(true)} data-testid="show-settlement-scene">
          SHOW SETTLEMENT
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDetails((v) => !v)} data-testid="toggle-advance-details">
          VIEW DETAILS
        </button>
      </div>

      {/* manual payoff */}
      <SectionTitle>
        <span className="h3">PAY OFF EARLY</span>
      </SectionTitle>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        Pay the RF you owe and get your reward stream back. You only pay the premium earned so far — the rest
        is never charged.
      </p>
      <div className="tiny mono-num" data-testid="advance-payoff-quote" style={{ margin: '6px 0 2px' }}>
        Full payoff today: {formatRF(payoffQuote, 2)} RF
      </div>
      <div className="btn-group" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} role="group" aria-label="Repayment amount">
        {(
          [
            [2_500n, '25%'],
            [5_000n, '50%'],
            [BPS_SCALE, 'PAY OFF'],
          ] as [bigint, string][]
        ).map(([v, label]) => (
          <button
            key={label}
            type="button"
            className="btn btn-outline btn-sm btn-toggle"
            aria-pressed={payMode === v}
            onClick={() => setPayMode(v)}
            data-testid={`repay-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-outline btn-sm btn-toggle"
          aria-pressed={payMode === -1n}
          onClick={() => setPayMode(-1n)}
          data-testid="repay-custom"
        >
          CUSTOM
        </button>
      </div>

      {payMode === -1n ? (
        <div className="row" style={{ marginTop: 6 }}>
          <label className="tiny" htmlFor="repay-custom-input">
            CUSTOM RF
          </label>
          <input
            id="repay-custom-input"
            style={inputStyle}
            inputMode="decimal"
            value={customPay}
            onChange={(e) => setCustomPay(e.target.value)}
            data-testid="repay-custom-input"
          />
        </div>
      ) : null}

      {payMode !== null ? (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny">
            {payMode === -1n
              ? `Repay ${customPay || '0'} RF`
              : payMode === BPS_SCALE
                ? `Full payoff: ${formatRF(payoffQuote, 2)} RF`
                : `Repay ${formatRF(payAmount ?? 0n, 2)} RF`}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={
              payMode === -1n
                ? (parseRf(customPay) ?? 0n) <= 0n
                : payAmount === null || payAmount <= 0n
            }
            onClick={() => {
              const amount = payMode === -1n ? (parseRf(customPay) ?? 0n) : (payAmount ?? 0n)
              if (amount <= 0n) return
              marketDispatch({ type: 'repay', positionId: position.id, amountWei: amount })
              setPayMode(null)
              setCustomPay('')
            }}
            data-testid="repay-submit"
          >
            SIMULATED REPAYMENT
          </button>
        </div>
      ) : null}

      {showDetails ? (
        <div className="panel-recess" style={{ marginTop: 10 }} data-testid="advance-open-details">
          <Stat label="Pool" provenance="simulated" value={pool?.name ?? '—'} />
          <Stat label="Funded by" provenance="simulated" value={funders} />
          <Stat label="Principal" value={`${formatRF(position.principalWei, 4)} RF`} />
          <Stat label="Premium paid so far" value={`${formatRF(position.premiumPaidWei, 4)} RF`} />
          <Stat label="Maximum LP premium" value={`${formatRF(position.maxLpPremiumWei, 4)} RF`} />
          <Stat
            label="Premium that stops accruing if you pay off now"
            value={`${formatRF(position.maxLpPremiumWei - position.premiumPaidWei, 4)} RF`}
          />
          {position.kind === 'growth' ? (
            <>
              <Stat label="RF repaid" value={`${formatRF(position.principalRepaidWei, 4)} / ${formatRF(position.repaymentTargetWei, 4)} RF`} />
              <Stat label="RF reward routing" value={formatBpsAsPercent(position.rfRoutingBps)} />
              <Stat label="WETH share while financing is active" value={formatBpsAsPercent(position.wethShareBps)} />
              <Stat label="WETH routed to the pool" value={`${formatRF(position.wethPoolWei, 6)} WETH`} />
              <Stat label="Protocol RF burn (underlying action)" provenance="protocol" value={`${formatRF(position.protocolBurnWei, 2)} RF`} />
              <Stat label="Protocol RF reward funding (underlying action)" provenance="protocol" value={`${formatRF(position.protocolRewardFundingWei, 2)} RF`} />
            </>
          ) : null}
        </div>
      ) : null}

      <Note>
        Financing can always be cleared. Once it is, every modeled RF and WETH reward route returns to the
        Friend.
      </Note>
    </Panel>
  )
}

function parseRf(raw: string): bigint | null {
  const m = /^(\d*)(\.\d*)?$/.exec(raw.trim())
  if (!m || (!m[1] && !m[2])) return null
  const int = m[1] || '0'
  const frac = (m[2] ?? '').replace('.', '').padEnd(18, '0').slice(0, 18)
  return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
}

const inputStyle: CSSProperties = {
  font: 'inherit',
  padding: '8px',
  width: 150,
  border: '2px solid var(--ink)',
  background: 'var(--paper)',
  minHeight: 40,
}
