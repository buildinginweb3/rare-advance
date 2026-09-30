import { useMemo, useState } from 'react'
import { Badge, Lcd, Note, Notice, Panel, ProgressBar, RfChip, SectionTitle, Stat } from '../components/ui'
import { SettlementScene, AdvanceTermsNote } from '../components/SettlementScene'
import { Device } from '../components/Device'
import { formatBpsAsPercent, formatDuration, formatRF, formatWeight, percentWhole, BPS_SCALE } from '../math/rf'
import { ADVANCE_PRESETS, ADVANCE_MARKET_TERMS, SIMULATED_QUOTES_LABEL, SIMULATED_POOL_QUOTES, NO_PROMISE_COPY, SIM_TIME_STEP_MS } from '../economy/rareAdvanceConfig'
import { quoteAdvance, quoteFromSimulatedPool, validateSelection, reconcileSettlement, remainingAt, isSettled, selectionToWei } from '../economy/advance'
import { canFill, poolAvailable } from '../economy/pool'
import { streamRemainingMs } from '../chain/reads'
import { useDispatch, useSession, selectedFriend, sessionNowMs, advanceFor, type ViewId } from '../session/store'
import { ADVANCE_HEADLINE, ADVANCE_SUB, NOT_A_LOAN } from '../content/copy'
import type { AdvancePosition, DataProvenance } from '../types'

export function AdvanceView() {
  const state = useSession()
  const dispatch = useDispatch()
  const nowMs = sessionNowMs(state)
  const friend = selectedFriend(state)
  const latest = advanceFor(state, state.selectedFriendKey)
  const advanceOpen = latest !== null && latest.stage !== 'settled'

  const [bps, setBps] = useState<bigint>(10_000n)
  const [custom, setCustom] = useState('')
  /** An explicitly entered face value overrides the slider, so a user can
   *  request an exact RF amount instead of a basis-point slice. */
  const [customFace, setCustomFace] = useState<bigint | null>(null)

  const streamRemaining = streamRemainingMs(friend?.rewards.streamFinishUnix ?? null, nowMs)
  const eligible = friend?.rewards.streamingRfWei ?? null
  const eligibleWei = eligible === null ? 0n : eligible

  const faceValue = useMemo(
    () => (customFace !== null ? customFace : eligible === null ? 0n : selectionToWei(eligibleWei, bps)),
    [customFace, eligible, eligibleWei, bps],
  )

  const quote = useMemo(
    () => quoteAdvance(faceValue, BPS_SCALE, streamRemaining ?? 0n),
    [faceValue, streamRemaining],
  )

  const validation = validateSelection(faceValue, eligibleWei)
  const fillable = canFill(state.pool, quote.youReceiveNowWei)
  const simulatedQuotes = useMemo(() => {
    if (eligibleWei <= 0n) return []
    return SIMULATED_POOL_QUOTES.map((q) => ({
      def: q,
      quote: quoteFromSimulatedPool(eligibleWei, streamRemaining ?? 0n, q.key),
    })).filter((x) => x.quote !== null)
  }, [eligibleWei, streamRemaining])

  const noStream = eligible === null || eligibleWei === 0n

  return (
    <div className="stack">
      <Panel dark>
        <div className="grid-hero">
          <div className="stack">
            <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
              {ADVANCE_HEADLINE}
            </h1>
            <p className="h3" style={{ fontSize: 9, color: 'var(--paper)' }}>
              {ADVANCE_SUB}
            </p>
            <ul className="tiny" style={{ margin: 0, paddingLeft: 16, color: 'var(--gray-2)', lineHeight: 1.8 }}>
              {NOT_A_LOAN.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <Device
            friend={friend}
            view={state.view}
            mode={state.mode}
            live={state.live}
            advance={latest}
            onNavigate={(v: ViewId) => dispatch({ type: 'set-view', view: v })}
          />
        </div>
      </Panel>

      {!friend ? (
        <Notice tone="info">Select a Friend on the dashboard first.</Notice>
      ) : null}

      {friend && noStream ? (
        <Panel title={`${friend.collection} #${friend.tokenId}`}>
          <Notice tone="warn">
            {eligible === null
              ? 'Reward stream unavailable. The per-Friend forward stream could not be derived from current protocol state.'
              : friend.activated
                ? 'This Friend currently has no streaming RF attributable to it. Reward streams are funded by protocol activity and can be empty between streams.'
                : 'This Friend is not active, so it has no reward weight and no stream. Activate or reactivate it in GROW to create weight.'}
          </Notice>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'set-view', view: 'grow' })}
            >
              GO TO GROW
            </button>
          </div>
        </Panel>
      ) : null}

      {/* ------------- active / settled advance ------------- */}
      {latest ? <ActiveAdvanceCard position={latest} /> : null}

      {/* ------------- quote ------------- */}
      {friend && !noStream && !advanceOpen ? (
        <Panel
          title={`${friend.collection} #${friend.tokenId}`}
          right={
            <Badge
              provenance={friend.stateSource}
              label={friend.stateSource === 'onchain' ? 'STATE · LIVE ONCHAIN' : 'STATE · SIMULATED'}
            />
          }
        >
          <div className="grid-2">
            <Lcd
              label="REWARD WEIGHT"
              right={<Badge provenance={friend.weight} />}
              value={formatWeight(friend.weightMicros, 2)}
              small
            />
            <Lcd
              label="STREAM REMAINING"
              right={<Badge provenance={friend.rewards.streamingRf} />}
              value={formatDuration(streamRemaining ?? 0n)}
              small
            />
          </div>

          <div className="panel-recess" style={{ marginTop: 10 }}>
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
              label="Streaming RF (eligible)"
              provenance={friend.rewards.streamingRf}
              value={`${formatRF(eligibleWei, 2)} RF`}
            />
            <Stat
              label="Stream remaining"
              value={formatDuration(streamRemaining ?? 0n)}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="lcd-label">
              <span>SELECT A SLICE OF THE STREAM</span>
              {customFace !== null ? <Badge provenance="simulated" label="CUSTOM AMOUNT" /> : undefined}
              <Badge provenance="simulated" label={ADVANCE_MARKET_TERMS.label} />
            </div>
            <label className="sr-only" htmlFor="advance-bps">
              Percentage of the streaming reward to advance
            </label>
            <input
              id="advance-bps"
              className="slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Number(bps / 100n)}
              onChange={(e) => {
                setCustom('')
                setCustomFace(null)
                setBps(BigInt(e.target.value) * 100n)
              }}
              aria-valuetext={`${Number(bps / 100n)} percent of the streaming reward`}
            />
            <div className="btn-group" role="group" aria-label="Advance presets">
              {ADVANCE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="btn btn-outline btn-sm btn-toggle"
                  aria-pressed={bps === p.bps}
                  onClick={() => {
                    setBps(p.bps)
                    setCustom('')
                    setCustomFace(null)
                  }}
                  data-testid={`preset-${p.label.replace('%', '').toLowerCase()}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <label className="tiny" htmlFor="advance-custom">
                CUSTOM RF
              </label>
              <input
                id="advance-custom"
                className="mono-num"
                style={{
                  font: 'inherit',
                  padding: '8px',
                  width: 140,
                  border: '2px solid var(--ink)',
                  background: 'var(--paper)',
                  minHeight: 36,
                }}
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
                  try {
                    const v = parseCustom(custom)
                    if (v <= 0n) return
                    setCustomFace(v)
                    if (eligibleWei > 0n) setBps((v * BPS_SCALE) / eligibleWei)
                  } catch {
                    /* leave selection unchanged on invalid input */
                  }
                }}
                data-testid="advance-custom-apply"
              >
                APPLY
              </button>
            </div>
          </div>

          <div className="lcd" style={{ marginTop: 12 }} data-testid="advance-quote">
            <div className="lcd-label">
              <span>QUOTE</span>
              <Badge provenance="simulated" label="SIMULATED" />
            </div>
            <div className="grid-3">
              <Lcd label="STREAM SELECTED" value={`${formatRF(quote.faceValueWei, 2)} RF`} small />
              <Lcd
                label="YOU RECEIVE NOW"
                value={`${formatRF(quote.youReceiveNowWei, 2)} RF`}
                small
                valueTestId="quote-receive"
              />
              <Lcd
                label="SETTLEMENT"
                value={`${formatRF(quote.settlementWei, 2)} RF`}
                small
                valueTestId="quote-settlement"
              />
            </div>
            <div className="panel-recess" style={{ marginTop: 8 }}>
              <Stat
                label="Liquidity provider earns"
                provenance="simulated"
                value={`${formatRF(quote.lpSpreadWei, 2)} RF`}
                hint={`· ${formatBpsAsPercent(quote.lpSpreadBps)}`}
                valueTestId="quote-lp"
              />
              <Stat
                label="Rare Advance RF burn"
                provenance="simulated"
                value={`${formatRF(quote.rareAdvanceBurnWei, 2)} RF`}
                hint={`· ${formatBpsAsPercent(quote.rareAdvanceBurnBps)}`}
                valueTestId="quote-burn"
              />
              <Stat label="Discount" value={formatBpsAsPercent(quote.discountBps)} />
              <Stat label="Time remaining" value={formatDuration(quote.durationMs)} valueTestId="quote-duration" />
            </div>
            <div style={{ marginTop: 8 }}>
              <AdvanceTermsNote />
            </div>
          </div>

          {validation ? (
            <div style={{ marginTop: 8 }}>
              <Notice tone="warn">{validation.message}</Notice>
            </div>
          ) : null}
          {!fillable && !validation ? (
            <div style={{ marginTop: 8 }}>
              <Notice tone="warn">
                The simulated pool has {formatRF(poolAvailable(state.pool), 0)} RF available, which is less than
                this quote requires. Reduce the selection.
              </Notice>
            </div>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-block"
              disabled={Boolean(validation) || !fillable}
              onClick={() => {
                dispatch({
                  type: 'take-advance',
                  friendKey: friend.key,
                  faceValueWei: quote.faceValueWei,
                  durationMs: quote.durationMs,
                })
                setBps(10_000n)
                setCustom('')
                setCustomFace(null)
              }}
              data-testid="take-advance"
            >
              TAKE SIMULATED ADVANCE
            </button>
          </div>

          {simulatedQuotes.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="lcd-label">
                <span>{SIMULATED_QUOTES_LABEL}</span>
                <Badge provenance="simulated" />
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <caption className="sr-only">Simulated pool quotes</caption>
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
                    {simulatedQuotes.map(({ def, quote: q }) => (
                      <tr key={def.key}>
                        <th scope="row">{def.label}</th>
                        <td className="num">{formatRF(q!.youReceiveNowWei, 2)} RF</td>
                        <td className="num">{formatRF(q!.settlementWei, 2)} RF</td>
                        <td className="num">{formatBpsAsPercent(def.discountBps)}</td>
                        <td className="num">{formatDuration(q!.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* ------------- history ------------- */}
      {state.advances.length > 0 ? (
        <section aria-labelledby="advance-history">
          <SectionTitle>
            <span id="advance-history">SESSION ADVANCES</span>
          </SectionTitle>
          <div className="stack">
            {state.advances.map((a) => (
              <div className="panel" key={a.id} data-testid={`advance-${a.id}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="h3">{a.friendKey}</span>
                  <Badge
                    provenance="simulated"
                    label={a.stage === 'settled' ? 'SETTLED ✓ · SIMULATED' : 'ACTIVE · SIMULATED'}
                    large
                  />
                </div>
                <div className="panel-recess" style={{ marginTop: 6 }}>
                  <Stat label="Received today" provenance="simulated" value={`${formatRF(a.quote.youReceiveNowWei, 2)} RF`} />
                  <Stat
                    label="Remaining settlement"
                    provenance="simulated"
                    value={`${formatRF(remainingAt(a.quote, a.elapsedMs), 2)} RF`}
                  />
                  <Stat
                    label="Settled"
                    provenance="simulated"
                    value={`${formatRF(a.settledWei, 2)} / ${formatRF(a.quote.settlementWei, 2)} RF`}
                  />
                  <Stat
                    label="Time remaining"
                    value={isSettled(a.quote, a.elapsedMs) ? '0m' : formatDuration(a.quote.durationMs - a.elapsedMs)}
                  />
                </div>
                <div style={{ marginTop: 6 }}>
                  <ProgressBar
                    pct={percentWhole(a.settledWei, a.quote.settlementWei)}
                    label="Advance settlement progress"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Panel title="WHAT THIS IS NOT">
        <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
          <li>No NFT floor oracle. No NFT liquidation. No LTV. No margin call.</li>
          <li>No credit score and no monthly repayments.</li>
          <li>Not a lending dashboard: the financed asset is a streaming RF receivable, not a token price.</li>
        </ul>
        <div style={{ marginTop: 8 }}>
          <Note>{NO_PROMISE_COPY.weightNotYield}</Note>
        </div>
      </Panel>
    </div>
  )
}

function parseCustom(raw: string): bigint {
  const m = /^(\d*)(\.\d*)?$/.exec(raw.trim())
  if (!m || (!m[1] && !m[2])) throw new Error('invalid')
  const int = m[1] || '0'
  const frac = (m[2] ?? '').replace('.', '').padEnd(18, '0').slice(0, 18)
  return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
}

function ActiveAdvanceCard({ position: active }: { position: AdvancePosition }) {
  const state = useSession()
  const dispatch = useDispatch()
  const friend = state.friends.find((f) => f.key === state.selectedFriendKey) ?? null
  const sceneId = state.settlementSceneFor
  const { principalWei, lpSpreadWei, burnWei } = reconcileSettlement(active.quote)
  const progressPct =
    active.quote.settlementWei > 0n
      ? Number((active.settledWei * 10_000n) / active.quote.settlementWei) / 100
      : 0

  const settled = isSettled(active.quote, active.elapsedMs)
  return (
    <Panel
      title={settled ? 'ADVANCE SETTLED' : 'ADVANCE ACTIVE'}
      right={
        <Badge
          provenance="simulated"
          label={settled ? 'SETTLED ✓ · SIMULATED' : 'ACTIVE · SIMULATED'}
          large
        />
      }
      testId="advance-card"
    >
      {sceneId === active.id ? (
        <SettlementScene
          advance={active}
          friend={friend}
          onDone={() => dispatch({ type: 'open-scene', id: null })}
        />
      ) : null}

      <div className="grid-2" style={{ marginTop: sceneId === active.id ? 10 : 0 }}>
        <Lcd
          label="RECEIVED TODAY"
          right={<Badge provenance="simulated" />}
          value={`${formatRF(active.quote.youReceiveNowWei, 2)} RF`}
        />
        <Lcd
          label="REMAINING SETTLEMENT"
          right={<Badge provenance="simulated" />}
          value={`${formatRF(remainingAt(active.quote, active.elapsedMs), 2)} RF`}
          sub={
            <>
              <RfChip /> {active.quote.settlementWei > 0n ? formatRF(active.quote.settlementWei, 0) : '0'} RF stream
            </>
          }
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <ProgressBar
          pct={percentWhole(active.settledWei, active.quote.settlementWei)}
          label="Advance settlement progress"
        />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <span className="tiny mono-num" data-testid="advance-settled">
            SETTLED {formatRF(active.settledWei, 2)} / {formatRF(active.quote.settlementWei, 2)} RF
          </span>
          <span className="tiny mono-num" data-testid="advance-time-remaining">
            TIME REMAINING {isSettled(active.quote, active.elapsedMs) ? '0m' : formatDuration(active.quote.durationMs - active.elapsedMs)}
          </span>
        </div>
      </div>

      <div className="panel-recess" style={{ marginTop: 8 }}>
        <Stat label="LP spread on settlement" provenance="simulated" value={`${formatRF(lpSpreadWei, 2)} RF`} />
        <Stat label="RF burn on settlement" provenance="simulated" value={`${formatRF(burnWei, 2)} RF`} />
        <Stat label="Principal returned to pool" provenance="simulated" value={`${formatRF(principalWei, 2)} RF`} />
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => dispatch({ type: 'simulate-time' })}
          data-testid="simulate-time"
        >
          SIMULATE TIME (+{SIM_TIME_STEP_MS / 3_600_000}H)
        </button>
        <span className="tiny muted" style={{ flex: '1 1 160px' }}>
          Simulated clock only. {state.mode === 'demo' ? 'Demo time is deterministic.' : 'No real elapsed time is used in live mode.'}
        </span>
      </div>

      {settled ? (
        <div style={{ marginTop: 10 }} data-testid="advance-settled-banner">
          <Notice tone="info">
            <strong>SETTLED ✓</strong> · {formatRF(active.settledWei, 2)} RF settled. LP earned{' '}
            {formatRF(lpSpreadWei, 2)} RF and {formatRF(burnWei, 2)} RF is modelled as a Rare Advance burn.
            Progress: {progressPct}%.
          </Notice>
        </div>
      ) : null}

      <div style={{ marginTop: 8 }}>
        <Note>{NO_PROMISE_COPY.simulation}</Note>
      </div>
      <div style={{ marginTop: 6 }}>
        <Note>{NO_PROMISE_COPY.transferRisk}</Note>
      </div>
    </Panel>
  )
}

export const ADVANCE_PROVENANCE: DataProvenance = 'simulated'
