import { useMemo, useState } from 'react'
import { Badge, Lcd, Note, Notice, Panel, RfChip, Stat } from '../components/ui'
import { Device } from '../components/Device'
import { GROW_CONTRIBUTION_PRESETS, GROW_FINANCE, NO_PROMISE_COPY, SIM_TIME_STEP_MS } from '../economy/rareAdvanceConfig'
import {
  formatBpsAsPercent,
  formatDurationLong,
  formatShare,
  formatRF,
  formatWeight,
  formatWeightDelta,
  mulBps,
  BPS_SCALE,
  parseRF,
  parseWeight,
} from '../math/rf'
import { availableActions, genesisFullyWeighted, plannerOptions, type PlannerOption } from '../protocol/actions'
import { GENERATION_SCHEDULE, GENESIS, MAX_TIER } from '../protocol/rareFriendsConfig'
import { promotionCostFor } from '../protocol/actions'
import { breakdownFinance, modelPayback, quoteGrowthFinance } from '../economy/growth'
import { useDispatch, useSession, selectedFriend, sessionNowMs, type ViewId } from '../session/store'
import { ACTIVATION_HERO_CAPTION, GROW_HEADLINE, GROW_SUB } from '../content/copy'
import { ActivationHero } from '../components/ActivationHero'

export function GrowView() {
  const state = useSession()
  const dispatch = useDispatch()
  const friend = selectedFriend(state)
  const nowMs = sessionNowMs(state)
  const actions = useMemo(() => (friend ? availableActions(friend) : []), [friend])
  const planner = useMemo(() => (friend ? plannerOptions(friend) : []), [friend])
  const [activeActionId, setActiveActionId] = useState<string | null>(null)
  const [plannerIndex, setPlannerIndex] = useState(0)

  const financeState = state.finances.find((f) => f.friendKey === state.selectedFriendKey) ?? null

  return (
    <div className="stack">
      <Panel dark>
        <div className="grid-hero">
          <div className="stack">
            <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
              {GROW_HEADLINE}
            </h1>
            <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 420 }}>
              {GROW_SUB}
            </p>
            <Note dark>
              SIMULATED CONCEPT · This section models FUTURE ACTIVATION FINANCE. No Rare Friends action is
              taken, no RF is spent, and the Rare Friends contracts do not currently support the reward routing
              this model assumes.
            </Note>
            <div className="row">
              <span className="tiny" style={{ color: 'var(--paper)' }}>
                SELECTED
              </span>
              <span className="h3" style={{ fontSize: 9, color: 'var(--paper)' }}>
                {friend ? `${friend.collection} #${friend.tokenId}` : 'NONE'}
              </span>
              {friend ? <Badge provenance={friend.weight} /> : null}
            </div>
          </div>
          <Device
            friend={friend}
            view={state.view}
            mode={state.mode}
            live={state.live}
            advance={null}
            onNavigate={(v: ViewId) => dispatch({ type: 'set-view', view: v })}
          />
        </div>
      </Panel>

      <ActivationHero />

      {!friend ? (
        <Notice tone="info">Select a Friend on the dashboard to see its valid Rare Friends actions.</Notice>
      ) : null}

      {friend && actions.length === 0 ? (
        <Panel title={friend.collection === 'Genesis' ? 'GENESIS' : `${friend.collection} #${friend.tokenId}`}>
          <Notice tone="info">
            {genesisFullyWeighted(friend)
              ? 'GENESIS IS FULLY WEIGHTED. Genesis has no hardwire, no promotion and no tier upgrades. A direct sale or transfer clears activation, so a new owner activates again.'
              : 'No further Rare Friends action is available for this Friend at its current state.'}
          </Notice>
        </Panel>
      ) : null}

      {friend && actions.length > 0 ? (
        <Panel
          title="VALID ACTIONS"
          right={
            <Badge
              provenance={friend.stateSource === 'onchain' ? 'onchain' : 'simulated'}
              label={friend.stateSource === 'onchain' ? 'STATE · LIVE ONCHAIN' : 'STATE · SIMULATED'}
            />
          }
        >
          <div className="lcd" style={{ marginBottom: 10 }}>
            <div className="lcd-label">
              <span>SELECTED FRIEND</span>
              <span>
                {friend.activated ? 'ACTIVE' : 'INACTIVE'}
                {friend.collection === 'Generations'
                  ? friend.temporary
                    ? ' · TEMPORARY'
                    : ` · GEN ${friend.generation}`
                  : ''}
                {friend.tier !== null ? ` · TIER ${friend.tier}` : ''}
              </span>
            </div>
            <div className="lcd-value lcd-value-sm">{friend.collection} #{friend.tokenId}</div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              Current weight {formatWeight(friend.weightMicros, 2)} ·{' '}
              {friend.weight === 'onchain' ? 'LIVE · ONCHAIN' : friend.weight === 'simulated' ? 'SIMULATED' : 'MODELED'}
            </div>
          </div>

          <div className="grid-2">
            {actions.map((a) => {
              const d = a.effect.weightAfterMicros - a.effect.weightBeforeMicros
              return (
                <div className="panel" key={a.id} data-testid={`action-${a.kind}`}>
                  <div className="panel-head">
                    <h3 className="h3">{a.title}</h3>
                    <span className="spacer" />
                    <Badge provenance="protocol" label="PROTOCOL ACTION" />
                  </div>
                  <p className="tiny muted" style={{ marginTop: 0 }}>
                    {a.subject}
                  </p>
                  <div className="panel-recess">
                    <Stat
                      label="Current weight"
                      provenance={friend.weight}
                      value={formatWeight(a.effect.weightBeforeMicros, 6)}
                    />
                    <Stat label="New weight" value={formatWeight(a.effect.weightAfterMicros, 6)} />
                    <Stat
                      label="Action cost"
                      value={a.costKnown ? `${formatRF(a.effect.costWei, 4)} RF` : 'BALANCE-DEPENDENT'}
                    />
                    {a.costKnown ? (
                      <>
                        <Stat label="New weight" value={formatWeight(a.effect.weightAfterMicros, 6)} />
                        <Stat label="Weight change" value={formatWeightDelta(d)} />
                      </>
                    ) : null}
                  </div>
                  {a.costKnown ? (
                    <div className="panel-recess" style={{ marginTop: 6 }}>
                      <div className="h3" style={{ fontSize: 7, marginBottom: 4 }}>
                        RARE FRIENDS PROTOCOL EFFECT
                      </div>
                      <Stat
                        label="RF burned"
                        provenance="protocol"
                        value={`${formatRF(a.effect.protocolBurnWei, 4)} RF`}
                      />
                      <Stat
                        label="RF reward funding"
                        provenance="protocol"
                        value={`${formatRF(a.effect.protocolRewardFundingWei, 4)} RF`}
                      />
                    </div>
                  ) : null}
                  <ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 15, lineHeight: 1.7 }}>
                    {a.consequences.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  {a.costKnown ? (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-block"
                        onClick={() => setActiveActionId(a.id)}
                        data-testid={`model-financing-${a.kind}`}
                      >
                        MODEL FINANCING
                      </button>
                    </div>
                  ) : (
                    <div className="note" style={{ marginTop: 8 }}>
                      Rare Advance does not model financing for this action because the protocol does not
                      determine a single cost from onchain state. Your live RF balance selects the generation at
                      the moment of the transaction.
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {activeActionId
            ? (() => {
                const a = actions.find((x) => x.id === activeActionId)
                if (!a || !a.costKnown) return null
                return <FinancingPanel actionId={activeActionId} onClose={() => setActiveActionId(null)} nowMs={nowMs} />
              })()
            : null}
        </Panel>
      ) : null}

      {/* ---------- What could I become? ---------- */}
      {friend && friend.collection === 'Generations' && planner.length > 0 ? (
        <Panel title="WHAT COULD I BECOME?" right={<Badge provenance="simulated" label="PLANNER" />}>
          <div className="btn-group" style={{ gridTemplateColumns: `repeat(${Math.min(planner.length, 3)}, minmax(0, 1fr))` }} role="group" aria-label="Planner options">
            {planner.map((p, i) => (
              <button
                key={p.title}
                type="button"
                className="btn btn-outline btn-sm btn-toggle"
                aria-pressed={plannerIndex === i}
                onClick={() => setPlannerIndex(i)}
                data-testid={`planner-${i}`}
              >
                {p.title}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <PlannerCard option={planner[plannerIndex]} nowMs={nowMs} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Note>
              Sequential upgrades cannot be skipped and impossible promotions are not offered. Promotion resets
              tier to 0, so the upgrade path has to be planned again afterwards.
            </Note>
          </div>
        </Panel>
      ) : null}

      {/* ---------- generation schedule reference ---------- */}
      <Panel
        title="GENERATION ECONOMICS"
        testId="generation-table"
        right={<Badge provenance="protocol" label="OFFICIAL PROTOCOL TABLE" />}
      >
        <div className="table-scroll">
          <table className="tbl">
            <caption className="sr-only">Rare Friends Generations protocol cost and weight table</caption>
            <thead>
              <tr>
                <th scope="col">Gen</th>
                <th scope="col" className="num">
                  Hardwire
                </th>
                <th scope="col" className="num">
                  Reactivate
                </th>
                <th scope="col" className="num">
                  Promote to
                </th>
                <th scope="col" className="num">
                  Tier 0
                </th>
                <th scope="col" className="num">
                  Tier 4
                </th>
              </tr>
            </thead>
            <tbody>
              {GENERATION_SCHEDULE.map((s) => {
                const promote =
                  s.generation > 1
                    ? `${s.generation - 1} · ${formatRF(parseRF(promotionCostFor(s.generation)), 0)} RF`
                    : '—'
                return (
                  <tr key={s.generation} data-testid={`gen-row-${s.generation}`}>
                    <th scope="row">GEN {s.generation}</th>
                    <td className="num">{formatRF(parseRF(s.hardwire), 4)} RF</td>
                    <td className="num">{formatRF(parseRF(s.reactivate), 4)} RF</td>
                    <td className="num">{promote}</td>
                    <td className="num">{formatWeight(parseWeight(s.tierWeights[0]), 6)}</td>
                    <td className="num">{formatWeight(parseWeight(s.tierWeights[MAX_TIER]), 6)}</td>
                  </tr>
                )
              })}
              <tr>
                <th scope="row">GENESIS</th>
                <td className="num">{formatRF(parseRF(GENESIS.activationCost), 0)} RF</td>
                <td className="num strike">no path</td>
                <td className="num strike">no path</td>
                <td className="num">{formatWeight(parseWeight(GENESIS.activeRewardWeight), 0)}</td>
                <td className="num strike">no path</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8 }}>
          <Note>
            Every payment splits 50% RF burned and 50% RF reward funding. Reward weight is allocation weight,
            not tokens, yield or return.
          </Note>
        </div>
      </Panel>

      {/* ---------- active financing ---------- */}
      {financeState ? <FinancePositionCard /> : null}
    </div>
  )
}

function PlannerCard({ option, nowMs }: { option: PlannerOption; nowMs: number }) {
  void nowMs
  const state = useSession()
  const d = option.weightAfterMicros - option.weightBeforeMicros
  // Reuse the single payback model rather than a second copy of the maths, so
  // the planner and the financing panel can never disagree.
  const rate = state.live.rfStream.rateWeiPerSec
  const total = state.live.totalActiveWeightMicros
  const premium = mulBps(option.costWei, GROW_FINANCE.premiumBps)
  const payback =
    rate !== null && total !== null
      ? modelPayback(
          option.costWei + premium,
          option.weightAfterMicros,
          option.weightBeforeMicros,
          total,
          rate,
        )
      : null

  return (
    <div className="panel" data-testid="planner-card">
      <div className="panel-head">
        <h3 className="h3">{option.title}</h3>
        <span className="spacer" />
        <Badge provenance="simulated" label="MODELED" />
      </div>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        {option.subject}
      </p>
      <div className="panel-recess">
        <Stat label="Protocol cost" value={`${formatRF(option.costWei, 4)} RF`} />
        <Stat label="Current weight" value={formatWeight(option.weightBeforeMicros, 6)} />
        <Stat label="New weight" value={formatWeight(option.weightAfterMicros, 6)} />
        <Stat label="Weight delta" value={formatWeightDelta(d)} />
        <Stat
          label="Simulated finance amount (50% contribution)"
          provenance="simulated"
          value={`${formatRF(option.costWei / 2n, 4)} RF`}
        />
        <Stat
          label="Modeled payback"
          provenance={payback === null ? 'simulated' : 'modeled'}
          value={
            payback === null
              ? 'DEMO SCENARIO'
              : formatDurationLong(payback.modeledPaybackSeconds * 1000n)
          }
        />
      </div>
      <div style={{ marginTop: 6 }}>
        <Note>{NO_PROMISE_COPY.advanceModel}</Note>
      </div>
    </div>
  )
}

function FinancingPanel({ actionId, onClose, nowMs }: { actionId: string; onClose: () => void; nowMs: number }) {
  const state = useSession()
  const dispatch = useDispatch()
  const friend = state.friends.find((f) => f.key === state.selectedFriendKey) ?? null
  const action = friend ? availableActions(friend).find((a) => a.id === actionId) : null
  const [contributionBps, setContributionBps] = useState<bigint>(0n)
  const [custom, setCustom] = useState('')
  const [customContribution, setCustomContribution] = useState<bigint | null>(null)

  if (!action) return null

  const cost = action.effect.costWei
  const contribution = customContribution ?? (cost * contributionBps) / BPS_SCALE
  const breakdown = breakdownFinance(action, contribution)
  const demoRate = state.mode === 'demo' ? state.live.rfStream.rateWeiPerSec : null
  void nowMs

  const quote = buildPreviewQuote(action, contribution, state, demoRate)

  return (
    <div className="lcd" style={{ marginTop: 12 }} data-testid="financing-panel">
      <div className="lcd-label">
        <span>ACTIVATION FINANCE · MODEL FINANCING</span>
        <Badge provenance="simulated" label="SIMULATED" />
      </div>

      <div className="grid-3">
        <Lcd label="ACTION" value={action.title} small sub={action.subject} />
        <Lcd label="ACTION COST" value={`${formatRF(cost, 4)} RF`} small />
        <Lcd label="YOUR CONTRIBUTION" value={`${formatRF(breakdown.userContributionWei, 4)} RF`} small />
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="lcd-label">
          <span>CONTRIBUTION</span>
        </div>
        <label className="sr-only" htmlFor="grow-bps">
          Your contribution to the action cost
        </label>
        <input
          id="grow-bps"
          className="slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Number(contributionBps / 100n)}
          onChange={(e) => {
            setCustom('')
            setCustomContribution(null)
            setContributionBps(BigInt(e.target.value) * 100n)
          }}
          aria-valuetext={`${Number(contributionBps / 100n)} percent contributed by you`}
        />
        <div className="btn-group" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} role="group" aria-label="Contribution presets">
          {GROW_CONTRIBUTION_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="btn btn-outline btn-sm btn-toggle"
              aria-pressed={contributionBps === p.bps}
              onClick={() => {
                setContributionBps(p.bps)
                setCustom('')
                setCustomContribution(null)
              }}
              data-testid={`contribution-${p.label.replace('%', '')}`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              try {
                const v = parseCustomRf(custom)
                setCustomContribution(v > cost ? cost : v)
                if (cost > 0n) setContributionBps((v * BPS_SCALE) / cost)
              } catch {
                /* unchanged */
              }
            }}
            data-testid="contribution-custom-apply"
          >
            {custom.trim() === '' ? 'CUSTOM' : 'APPLY'}
          </button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <label className="tiny" htmlFor="grow-custom">
            CUSTOM RF
          </label>
          <input
            id="grow-custom"
            style={{
              font: 'inherit',
              padding: '8px',
              width: 140,
              border: '2px solid var(--ink)',
              background: 'var(--paper)',
              minHeight: 36,
            }}
            inputMode="decimal"
            placeholder="e.g. 281.25"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            data-testid="contribution-custom"
          />
        </div>
      </div>

      <div className="panel-recess" style={{ marginTop: 10 }} data-testid="finance-quote">
        <Stat
          label="You contribute"
          provenance="simulated"
          value={`${formatRF(breakdown.userContributionWei, 4)} RF`}
        />
        <Stat
          label="Rare Advance finances"
          provenance="simulated"
          value={`${formatRF(breakdown.financedWei, 4)} RF`}
        />
        <Stat
          label="Financing premium (5% of financed)"
          provenance="simulated"
          value={`${formatRF(breakdown.premiumWei, 4)} RF`}
        />
        <Stat
          label="→ liquidity providers"
          provenance="simulated"
          value={`${formatRF(breakdown.premiumToLiquidityProvidersWei, 4)} RF`}
        />
        <Stat
          label="→ additional Rare Advance burn"
          provenance="simulated"
          value={`${formatRF(breakdown.premiumToRareAdvanceBurnWei, 4)} RF`}
        />
        <Stat
          label="Repayment target"
          provenance="simulated"
          value={`${formatRF(breakdown.repaymentTargetWei, 4)} RF`}
        />
      </div>

      <div className="grid-2" style={{ marginTop: 8 }}>
        <Lcd
          label="NEW REWARD WEIGHT"
          right={<Badge provenance="simulated" />}
          value={formatWeight(quote.weightAfterMicros, 6)}
          small
        />
        <Lcd
          label="WEIGHT INCREASE"
          right={<Badge provenance="simulated" />}
          value={quote.weightIncreaseBps === null ? 'from zero' : formatBpsAsPercent(quote.weightIncreaseBps)}
          small
        />
      </div>

      {/* payback */}
      <div className="panel-recess" style={{ marginTop: 8 }} data-testid="payback-panel">
        <div className="h3" style={{ fontSize: 7, marginBottom: 4 }}>
          MODELED PAYBACK
        </div>
        {quote.payback ? (
          <>
            <Stat
              label="Current total active weight"
              provenance={state.live.totalActiveWeightProvenance}
              value={formatWeight(quote.payback.totalActiveWeightMicros, 0)}
            />
            <Stat
              label="Post-action total active weight"
              provenance="modeled"
              value={formatWeight(quote.payback.postActionTotalActiveWeightMicros, 0)}
            />
            <Stat
              label="Post-action share of rewards"
              provenance="modeled"
              value={formatShare(quote.payback.postActionShareWad)}
              hint="· share of the funded reward pool"
            />
            <Stat
              label="Modeled RF per day"
              provenance="modeled"
              value={`${formatRF(quote.payback.modeledRfPerDayWei, 3)} RF`}
            />
            <Stat
              label="Repayment RF per day (75% routing)"
              provenance="modeled"
              value={`${formatRF(quote.payback.repaymentRfPerDayWei, 3)} RF`}
            />
            <Stat
              label="Modeled payback"
              provenance="modeled"
              valueTestId="payback-value"
              value={formatDurationLong(quote.payback.modeledPaybackSeconds * 1000n)}
              hint={
                quote.payback.modeledPaybackSeconds * 1000n > 3_650n * 86_400_000n
                  ? '· beyond any plausible horizon at the current stream rate'
                  : undefined
              }
            />
          </>
        ) : (
          <Notice tone="warn">
            Live protocol inputs are unavailable, so no payback figure is shown. A demo scenario is not
            presented as a live rate.
          </Notice>
        )}
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          <Badge provenance={quote.paybackProvenance} /> {NO_PROMISE_COPY.advanceModel}
        </p>
      </div>

      {/* routing */}
      <div className="panel-recess" style={{ marginTop: 8 }}>
        <div className="h3" style={{ fontSize: 7, marginBottom: 4 }}>
          REWARD ROUTING WHILE FINANCING IS OUTSTANDING
        </div>
        <Stat
          label="→ financing repayment"
          provenance="simulated"
          value={formatBpsAsPercent(GROW_FINANCE.repaymentRoutingBps, 0)}
        />
        <Stat
          label="→ Friend owner"
          provenance="simulated"
          value={formatBpsAsPercent(GROW_FINANCE.ownerRoutingBps, 0)}
        />
        <div className="tiny muted" style={{ marginTop: 4 }}>
          The Friend keeps earning while financing repays itself. After the repayment target is reached, 100%
          of future rewards remain with the Friend.
        </div>
      </div>

      {/* protocol split kept separate */}
      <div className="panel-recess" style={{ marginTop: 8 }}>
        <div className="h3" style={{ fontSize: 7, marginBottom: 4 }}>
          UNDERLYING RARE FRIENDS ACTION (SEPARATE FROM RARE ADVANCE)
        </div>
        <Stat
          label="Protocol RF burn (50% of action cost)"
          provenance="protocol"
          value={`${formatRF(action.effect.protocolBurnWei, 4)} RF`}
        />
        <Stat
          label="Protocol RF reward funding (50% of action cost)"
          provenance="protocol"
          value={`${formatRF(action.effect.protocolRewardFundingWei, 4)} RF`}
        />
        <div className="tiny muted" style={{ marginTop: 4 }}>
          These are the Rare Friends protocol economics. They are never combined with the Rare Advance
          financing premium burn.
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <Note>{NO_PROMISE_COPY.simulation}</Note>
      </div>
      <div style={{ marginTop: 6 }}>
        <Note>{NO_PROMISE_COPY.transferRisk}</Note>
      </div>
      <div style={{ marginTop: 6 }}>
        <Note>{NO_PROMISE_COPY.weightNotYield}</Note>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            dispatch({ type: 'take-finance', friendKey: action.friendKey, action, contributionWei: breakdown.userContributionWei })
            onClose()
          }}
          data-testid="confirm-finance"
        >
          CONFIRM SIMULATED FINANCING MODEL
        </button>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          CANCEL
        </button>
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>
        <RfChip /> {ACTIVATION_HERO_CAPTION} — simulation only.
      </p>
    </div>
  )
}

function buildPreviewQuote(
  action: import('../types').GrowthAction,
  contribution: bigint,
  state: ReturnType<typeof useSession>,
  demoRate: bigint | null,
) {
  return quoteGrowthFinance({
    action,
    userContributionWei: contribution,
    totalActiveWeightMicros: state.live.totalActiveWeightMicros,
    rfStreamRateWeiPerSec: state.live.rfStream.rateWeiPerSec ?? demoRate,
    demoRfStreamRateWeiPerSec: demoRate,
    totalActiveWeightProvenance: state.live.totalActiveWeightProvenance as 'onchain' | 'simulated',
  })
}

function parseCustomRf(raw: string): bigint {
  const m = /^(\d*)(\.\d*)?$/.exec(raw.trim())
  if (!m || (!m[1] && !m[2])) throw new Error('invalid')
  const int = m[1] || '0'
  const frac = (m[2] ?? '').replace('.', '').padEnd(18, '0').slice(0, 18)
  return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
}

function FinancePositionCard() {
  const state = useSession()
  const dispatch = useDispatch()
  const f = state.finances.find((x) => x.friendKey === state.selectedFriendKey) ?? null
  if (!f) return null
  const q = f.quote
  return (
    <Panel
      title="ACTIVATION FINANCE MODEL ACTIVE"
      right={<Badge provenance="simulated" label={f.settled ? 'SETTLED ✓ · SIMULATED' : 'SIMULATED'} large />}
    >
      <div className="grid-3">
        <Lcd label="FINANCED" value={`${formatRF(q.financedWei, 4)} RF`} small />
        <Lcd label="REPAID" value={`${formatRF(f.repaidWei, 4)} RF`} small />
        <Lcd
          label="OUTSTANDING"
          value={`${formatRF(q.repaymentTargetWei - f.repaidWei, 4)} RF`}
          small
        />
      </div>
      <div className="panel-recess" style={{ marginTop: 8 }}>
        <Stat label="Owner received while financing" provenance="simulated" value={`${formatRF(f.ownerReceivedWei, 4)} RF`} />
        <Stat label="Premium → liquidity providers" provenance="simulated" value={`${formatRF(q.premiumToLiquidityProvidersWei, 4)} RF`} />
        <Stat label="Premium → Rare Advance burn" provenance="simulated" value={`${formatRF(q.premiumToRareAdvanceBurnWei, 4)} RF`} />
        <Stat label="Routing to repayment" provenance="simulated" value={formatBpsAsPercent(q.repaymentRoutingBps, 0)} />
        <Stat label="Routing to owner" provenance="simulated" value={formatBpsAsPercent(q.ownerRoutingBps, 0)} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'simulate-time' })} data-testid="simulate-time-grow">
          SIMULATE TIME (+{SIM_TIME_STEP_MS / 3_600_000}H)
        </button>
        <span className="tiny muted">
          {f.settled ? 'FINANCING SETTLED · 100% of future rewards remain with the Friend.' : 'The Friend keeps earning while financing repays itself.'}
        </span>
      </div>
    </Panel>
  )
}
