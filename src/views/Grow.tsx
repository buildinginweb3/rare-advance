/**
 * GROW — THE FRIEND'S NEXT STEP
 * =============================
 *
 * Rare Friends has activation, hardwiring, reactivation, promotion and tiers.
 * Showing all of that at once is how this screen became intimidating, so the
 * selected Friend decides what appears, and only valid actions are ever offered.
 *
 * Flow:
 *   what can this Friend do next  ->  EXPLORE FINANCING  ->  choose a pool
 *   ->  PAY SOME NOW  ->  SEE ESTIMATE
 *
 * The complete protocol table lives behind VIEW RARE FRIENDS RULES.
 */

import { useMemo, useState } from 'react'
import { Badge, Note, Notice, Panel, Stat } from '../components/ui'
import { formatBpsAsPercent, formatRF, formatWeight, formatWeightDelta, mulBps, parseRF as parseRf, BPS_SCALE } from '../math/rf'
import { availableActions, genesisFullyWeighted, plannerOptions, promotionCostFor } from '../protocol/actions'
import { GENERATION_SCHEDULE, GENESIS, MAX_TIER } from '../protocol/rareFriendsConfig'
import { growthOffers, type GrowthOffer } from '../economy/pools/market'
import { minOwnerContributionBps } from '../economy/pools/terms'
import { parseWeight } from '../math/rf'
import { useDispatch, useSession, selectedFriend } from '../session/store'
import { LOCAL_LP_ID, useMarket, useMarketDispatch } from '../session/marketStore'
import { GROW_HEADLINE } from '../content/copy'
import { FriendSwitcher } from '../components/FriendSwitcher'
import type { GrowthAction } from '../types'

/** Simple term: how much modeled WETH this Friend earns over the financing. */
const MODEL_WETH_PER_DAY = 5n * 10n ** 16n // 0.05 WETH per day

export function GrowView() {
  const state = useSession()
  const market = useMarket()
  const friend = selectedFriend(state)

  const actions = useMemo(() => (friend ? availableActions(friend) : []), [friend])
  const planner = useMemo(() => (friend ? plannerOptions(friend) : []), [friend])
  const [financeActionId, setFinanceActionId] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  return (
    <div className="stack">
      <Panel dark>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)', margin: 0 }}>
            {GROW_HEADLINE}
          </h1>
          {friend ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSwitcherOpen(true)}
              data-testid="open-friend-switcher"
            >
              CHANGE FRIEND
            </button>
          ) : null}
        </div>
        <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 440, marginTop: 6 }}>
          Rare Friends can spend RF to increase a Friend&apos;s reward weight. Rare Advance explores whether
          future rewards could help finance that cost.
        </p>
      </Panel>

      <Panel title="HOW IT WORKS">
        <div className="mini-flow">
          {['PAY SOME NOW', 'RARE ADVANCE', 'GROW FRIEND', 'MORE REWARD WEIGHT', 'FUTURE REWARDS', 'MODELED REPAYMENT'].map(
            (n, i) => (
              <div key={n} className="mini-flow-node">
                <span className="h3" style={{ fontSize: 7 }}>
                  {n}
                </span>
                {i < 5 ? <span className="mini-flow-arrow" aria-hidden="true" /> : null}
              </div>
            ),
          )}
        </div>
        <Note>
          SIMULATED CONCEPT. No Rare Friends action is taken and no RF is spent. The Rare Friends contracts do
          not currently support the reward routing this models.
        </Note>
      </Panel>

      {switcherOpen ? (
        <FriendSwitcher onClose={() => setSwitcherOpen(false)} />
      ) : null}

      {!friend ? (
        <Notice tone="info">Choose a Friend to see what it can do next.</Notice>
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
          title="WHAT CAN THIS FRIEND DO NEXT?"
          right={
            <span className="tiny muted">
              {friend.collection === 'Genesis' ? 'GENESIS' : `GEN ${friend.generation}`}
              {friend.tier !== null ? ` · TIER ${friend.tier}` : ''} · {friend.activated ? 'ACTIVE' : 'INACTIVE'}
            </span>
          }
        >
          <div className="stack">
            {actions.map((a) => (
              <ActionCard
                key={a.id}
                action={a}
                onExplore={() => a.costKnown && setFinanceActionId(a.id)}
                expanded={financeActionId === a.id}
                market={market}
              />
            ))}
          </div>
        </Panel>
      ) : null}

      {friend && friend.collection === 'Generations' && planner.length > 0 ? (
        <Panel
          title="WHAT COULD I BECOME?"
          right={<Badge provenance="simulated" label="PLANNER" />}
        >
          <PlannerSummary options={planner} />
        </Panel>
      ) : null}

      <Panel
        title="RARE FRIENDS RULES"
        right={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRules((v) => !v)} data-testid="toggle-rules">
            {showRules ? 'HIDE' : 'VIEW RARE FRIENDS RULES'}
          </button>
        }
      >
        {!showRules ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            The complete official protocol cost and weight table, and the rules Rare Advance follows, are here.
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="tbl" data-testid="generation-table">
                <caption className="sr-only">Rare Friends Generations protocol cost and weight table</caption>
                <thead>
                  <tr>
                    <th scope="col">Gen</th>
                    <th scope="col" className="num">Hardwire</th>
                    <th scope="col" className="num">Reactivate</th>
                    <th scope="col" className="num">Promote to</th>
                    <th scope="col" className="num">Tier 0</th>
                    <th scope="col" className="num">Tier 4</th>
                  </tr>
                </thead>
                <tbody>
                  {GENERATION_SCHEDULE.map((s) => (
                    <tr key={s.generation} data-testid={`gen-row-${s.generation}`}>
                      <th scope="row">GEN {s.generation}</th>
                      <td className="num">{formatRF(parseRf(s.hardwire), 4)} RF</td>
                      <td className="num">{formatRF(parseRf(s.reactivate), 4)} RF</td>
                      <td className="num">
                        {s.generation > 1 ? `${s.generation - 1} · ${formatRF(parseRf(promotionCostFor(s.generation)), 0)} RF` : '—'}
                      </td>
                      <td className="num">{formatWeight(parseWeight(s.tierWeights[0]!), 6)}</td>
                      <td className="num">{formatWeight(parseWeight(s.tierWeights[MAX_TIER]!), 6)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">GENESIS</th>
                    <td className="num">{formatRF(parseRf(GENESIS.activationCost), 0)} RF</td>
                    <td className="num strike">no path</td>
                    <td className="num strike">no path</td>
                    <td className="num">{formatWeight(parseWeight(GENESIS.activeRewardWeight), 0)}</td>
                    <td className="num strike">no path</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="tiny" style={{ marginTop: 8, paddingLeft: 16, lineHeight: 1.8 }}>
              <li>A direct transfer or sale clears activation and upgrades.</li>
              <li>Reactivation restarts at tier 0. Previous upgrade payments are not refunded or credited.</li>
              <li>Promotion resets tier to 0 and can never move a Generation into Genesis.</li>
              <li>Upgrades are sequential: tier n to n+1 only.</li>
              <li>Every payment splits 50% RF burned and 50% RF reward funding.</li>
              <li>Reward weight is allocation weight, not tokens, yield, return or ROI.</li>
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action card
// ---------------------------------------------------------------------------

function ActionCard({
  action,
  onExplore,
  expanded,
  market,
}: {
  action: GrowthAction
  onExplore: () => void
  expanded: boolean
  market: ReturnType<typeof useMarket>
}) {
  const d = action.effect.weightAfterMicros - action.effect.weightBeforeMicros
  return (
    <div className="panel" data-testid={`action-${action.kind}`}>
      <div className="panel-head">
        <h3 className="h3">{action.title}</h3>
        <span className="spacer" />
        <Badge provenance="protocol" label="PROTOCOL ACTION" />
      </div>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        {action.subject}
      </p>

      {action.costKnown ? (
        <>
          <div className="grid-2">
            <Stat label="Cost" value={`${formatRF(action.effect.costWei, 4)} RF`} />
            <div>
              <Stat label="Reward weight" value={`${formatWeight(action.effect.weightBeforeMicros, 6)} → ${formatWeight(action.effect.weightAfterMicros, 6)}`} />
              <Stat label="Change" value={formatWeightDelta(d)} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={onExplore} data-testid={`explore-financing-${action.kind}`}>
              EXPLORE FINANCING
            </button>
          </div>
        </>
      ) : (
        <Note>
          Your live RF balance selects the highest generation you can afford, so the exact cost is only known at
          the moment of the transaction. Rare Advance does not model financing for it.
        </Note>
      )}

      {expanded && action.costKnown ? (
        <FinancingSheet action={action} market={market} />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Financing sheet
// ---------------------------------------------------------------------------

function FinancingSheet({ action, market }: { action: GrowthAction; market: ReturnType<typeof useMarket> }) {
  const dispatch = useDispatch()
  const marketDispatch = useMarketDispatch()
  const [contributionBps, setContributionBps] = useState<bigint>(2_500n)
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [showEstimate, setShowEstimate] = useState(false)

  const cost = action.effect.costWei
  const youPay = (cost * contributionBps) / BPS_SCALE
  const generation = action.effect.weightBeforeMicros > 0n && action.friendKey.startsWith('Generations')
    ? Number(action.friendKey.split(':')[1] ?? 0)
    : Number(/GEN (\d)/.exec(action.subject)?.[1] ?? 0)

  const offers: GrowthOffer[] = useMemo(
    () =>
      growthOffers(market.pools, {
        friendKey: action.friendKey,
        actionKind: action.kind,
        actionCostWei: cost,
        ownerContributionWei: youPay,
        generation,
        borrowerLpId: LOCAL_LP_ID,
        modeledWethForFriendWei: MODEL_WETH_PER_DAY * 30n,
      }),
    [market.pools, action.friendKey, action.kind, cost, generation, youPay],
  )

  const offer = offers.find((o) => o.poolId === selectedPoolId) ?? offers[0] ?? null

  // When nothing is offered, say WHY. "Try something else" is useless advice if
  // the real obstacle is that every pool is too small for this action.
  const financedAmount = cost - youPay
  const biggestPool = useMemo(
    () =>
      market.pools.reduce(
        (max, p) => (p.kind !== 'stream' && p.terms.growthMaxPositionWei > max ? p.terms.growthMaxPositionWei : max),
        0n,
      ),
    [market.pools],
  )
  const nothingToFinance = financedAmount <= 0n
  const tooBigForAnyPool = !nothingToFinance && financedAmount > biggestPool
  const pool = offer ? market.pools.find((p) => p.id === offer.poolId) : undefined
  const financed = offer ? offer.poolFinancesWei : cost - youPay
  const weightAfter = action.effect.weightAfterMicros
  const weightIncreasePct =
    action.effect.weightBeforeMicros > 0n
      ? ((weightAfter - action.effect.weightBeforeMicros) * 10_000n) / action.effect.weightBeforeMicros
      : null

  return (
    <div className="panel-recess" style={{ marginTop: 10 }} data-testid="finance-sheet">
      <div className="h3" style={{ fontSize: 8, marginBottom: 6 }}>
        {action.title.toUpperCase()} · COST {formatRF(cost, 4)} RF
      </div>

      <div className="h3" style={{ fontSize: 8, margin: '10px 0 4px' }}>
        HOW MUCH DO YOU WANT TO PAY TODAY?
      </div>
      <div className="btn-group" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} role="group" aria-label="Contribution presets">
        {(
          [
            [0n, '0%'],
            [2_500n, '25%'],
            [5_000n, '50%'],
            [BPS_SCALE, '100%'],
          ] as [bigint, string][]
        ).map(([v, label]) => (
          <button
            key={label}
            type="button"
            className="btn btn-outline btn-sm btn-toggle"
            aria-pressed={contributionBps === v}
            onClick={() => setContributionBps(v)}
            data-testid={`contribute-${label.replace('%', '')}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 8 }}>
        <Stat label="You pay today" value={`${formatRF(youPay, 4)} RF`} />
        <Stat label="Rare Advance models financing" provenance="simulated" value={`${formatRF(cost - youPay, 4)} RF`} />
      </div>

      <div className="h3" style={{ fontSize: 8, margin: '12px 0 4px' }}>
        CHOOSE A POOL
      </div>
      {offers.length === 0 ? (
        <Notice tone="warn">
          {nothingToFinance ? (
            <>You have chosen to pay the full cost yourself, so there is nothing left to finance. Lower your
            contribution to see which pools would fund it.</>
          ) : tooBigForAnyPool ? (
            <>
              No pool can fund an action this large. This action needs {formatRF(financedAmount, 2)} RF and the
              largest eligible pool funds up to {formatRF(biggestPool, 0)} RF. Pay more yourself, or create a
              bigger pool in LIQUIDITY.
            </>
          ) : (
            <>
              No pool offers these terms for this action. Try a different contribution, or create a pool in
              LIQUIDITY.
            </>
          )}
        </Notice>
      ) : (
        <div className="stack" data-testid="growth-offers">
          {offers.map((o) => (
            <button
              key={o.poolId}
              type="button"
              className="fcard offer-card"
              aria-pressed={offer?.poolId === o.poolId}
              onClick={() => setSelectedPoolId(o.poolId)}
              data-testid={`growth-offer-${o.poolId}`}
            >
              <span className="fcard-body">
                <span className="row-tight" style={{ marginBottom: 4 }}>
                  {o.privatePool ? <Badge provenance="simulated" label="PRIVATE" /> : null}
                  {o.badges.map((b) => (
                    <Badge key={b} provenance="simulated" label={b} />
                  ))}
                </span>
                <span className="fcard-name">{o.poolName}</span>
                <span className="offer-grid">
                  <span>
                    <span className="tiny muted">YOU PAY TODAY</span>
                    <span className="offer-figure">{formatRF(o.youPayTodayWei, 2)} RF</span>
                  </span>
                  <span>
                    <span className="tiny muted">POOL FUNDS</span>
                    <span className="offer-figure">{formatRF(o.poolFinancesWei, 2)} RF</span>
                  </span>
                  <span>
                    <span className="tiny muted">RF REPAYMENT TARGET</span>
                    <span className="offer-figure">{formatRF(o.repaymentTargetWei, 2)} RF</span>
                  </span>
                  <span>
                    <span className="tiny muted">WETH SHARE</span>
                    <span className="offer-figure">{formatBpsAsPercent(o.wethShareBps)}</span>
                  </span>
                </span>
                <span className="tiny muted" style={{ display: 'block', marginTop: 4 }}>
                  While active: {formatBpsAsPercent(o.rfRoutingBps)} RF rewards repay the pool ·{' '}
                  {formatBpsAsPercent(o.wethShareBps)} of modeled WETH rewards goes to the pool
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {offer ? (
        <>
          <div className="panel-recess" style={{ marginTop: 8 }}>
            <Stat
              label="Reward weight after the action"
              value={`${formatWeight(action.effect.weightBeforeMicros, 6)} → ${formatWeight(weightAfter, 6)}`}
            />
            {weightIncreasePct !== null ? (
              <Stat label="Weight change" value={formatBpsAsPercent(weightIncreasePct)} hint="· allocation weight, not a guaranteed earning increase" />
            ) : null}
          </div>

          <div className="panel-recess" style={{ marginTop: 8 }}>
            <div className="h3" style={{ fontSize: 7, marginBottom: 4 }}>
              THE EXISTING RARE FRIENDS ACTION DOES THIS ANYWAY
            </div>
            <Stat label="Protocol RF burn" provenance="protocol" value={`${formatRF(action.effect.protocolBurnWei, 4)} RF`} />
            <Stat label="Protocol RF reward funding" provenance="protocol" value={`${formatRF(action.effect.protocolRewardFundingWei, 4)} RF`} />
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              This is the existing Rare Friends protocol split. Rare Advance does not add to it and never merges
              the two.
            </p>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowEstimate((v) => !v)}
              data-testid="toggle-estimate"
            >
              {showEstimate ? 'HIDE ESTIMATE' : 'SEE ESTIMATE'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={youPay < mulBps(cost, minOwnerContributionBps(pool?.terms ?? actionTerms(action)))}
              onClick={() => {
                marketDispatch({
                  type: 'open-growth',
                  poolId: offer.poolId,
                  positionId: `gp-${Date.now().toString(36)}`,
                  friendKey: action.friendKey,
                  actionId: action.id,
                  actionKind: action.kind,
                  actionCostWei: cost,
                  generation,
                  ownerContributionWei: youPay,
                  protocolBurnWei: action.effect.protocolBurnWei,
                  protocolRewardFundingWei: action.effect.protocolRewardFundingWei,
                  rfRepaymentPerDayWei: 25n * 10n ** 18n,
                  wethPerDayWei: MODEL_WETH_PER_DAY,
                })
                dispatch({ type: 'set-view', view: 'advance' })
              }}
              data-testid="confirm-growth-finance"
            >
              CONFIRM SIMULATED FINANCING
            </button>
          </div>

          {showEstimate ? (
            <div className="panel-recess" style={{ marginTop: 8 }} data-testid="growth-estimate">
              <div className="h3" style={{ fontSize: 7, marginBottom: 4 }}>
                MODELED REPAYMENT
              </div>
              <Stat label="You pay today" provenance="simulated" value={`${formatRF(youPay, 4)} RF`} />
              <Stat label="Pool finances" provenance="simulated" value={`${formatRF(financed, 4)} RF`} />
              <Stat label="LP premium on financed RF" provenance="simulated" value={`${formatRF(offer.lpPremiumWei, 4)} RF`} />
              <Stat label="RF repayment target" provenance="simulated" value={`${formatRF(offer.repaymentTargetWei, 4)} RF`} />
              <Stat label="RF rewards routed to repayment" provenance="simulated" value={formatBpsAsPercent(offer.rfRoutingBps)} />
              <Stat label="RF rewards to the Friend" provenance="simulated" value={formatBpsAsPercent(BPS_SCALE - offer.rfRoutingBps)} />
              <Stat label="Modeled WETH to the pool" provenance="simulated" value={`${formatRF(offer.modeledWethToPoolWei, 6)} WETH`} />
              <Stat label="Modeled WETH kept by the Friend" provenance="simulated" value={`${formatRF(offer.modeledWethToOwnerWei, 6)} WETH`} />
              <p className="tiny muted" style={{ margin: '6px 0 0' }}>
                WETH is tracked separately from RF and is never converted into it. Once RF repayment finishes,
                the WETH share ends immediately and the Friend keeps 100% again.
              </p>
              <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                MODELED, NOT GUARANTEED. Reward share also depends on total active weight and funded activity.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function actionTerms(action: GrowthAction) {
  return {
    streamPremiumBps: 0n,
    rareAdvanceFeeBps: 0n,
    maxAdvanceShareBps: BPS_SCALE,
    maxStreamPositionWei: 1n,
    growthPremiumBps: 0n,
    growthMaxFinanceBps: BPS_SCALE,
    growthRfRoutingBps: BPS_SCALE,
    growthWethShareBps: 0n,
    growthMaxPositionWei: 1n,
    eligibleActions: [action.kind],
    eligibleGenerations: null,
  }
}

function PlannerSummary({ options }: { options: ReturnType<typeof plannerOptions> }) {
  const [index, setIndex] = useState(0)
  const o = options[index]
  if (!o) return null
  const d = o.weightAfterMicros - o.weightBeforeMicros
  return (
    <div data-testid="planner-card">
      <div className="btn-group" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
        {options.map((p, i) => (
          <button
            key={p.title}
            type="button"
            className="btn btn-outline btn-sm btn-toggle"
            aria-pressed={index === i}
            onClick={() => setIndex(i)}
            data-testid={`planner-${i}`}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div className="panel-recess" style={{ marginTop: 8 }}>
        <Stat label="Protocol cost" value={`${formatRF(o.costWei, 4)} RF`} />
        <Stat label="New weight" value={formatWeight(o.weightAfterMicros, 6)} />
        <Stat label="Weight delta" value={formatWeightDelta(d)} />
      </div>
      <Note>Sequential upgrades cannot be skipped and impossible promotions are not offered.</Note>
    </div>
  )
}
