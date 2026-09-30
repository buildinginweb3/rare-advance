/**
 * ACTIVATION FINANCE HERO
 * ======================
 *
 * The idea has to be understandable instantly. This is the visual example:
 * an inactive Genesis, partially funded from your own RF, activating now and
 * repaying from the rewards the new weight creates.
 */

import { Badge, FlowArrow, Lcd, Note, Stat } from './ui'
import { formatRF, formatWeight } from '../math/rf'
import { ACTIVATION_FINANCE_HERO, GROW_FINANCE, NO_PROMISE_COPY } from '../economy/rareAdvanceConfig'
import { parseRF, parseWeight, formatBpsAsPercent } from '../math/rf'
import { ACTIVATION_HERO_CAPTION } from '../content/copy'
import { sessionInsight, useSession } from '../session/store'

export function ActivationHero() {
  const cost = parseRF(ACTIVATION_FINANCE_HERO.actionCost)
  const yours = parseRF(ACTIVATION_FINANCE_HERO.yourContribution)
  const financed = parseRF(ACTIVATION_FINANCE_HERO.financed)
  const fromW = parseWeight(ACTIVATION_FINANCE_HERO.fromWeight)
  const toW = parseWeight(ACTIVATION_FINANCE_HERO.toWeight)

  return (
    <div className="panel" data-testid="activation-hero">
      <div className="panel-head">
        <h2 className="h3">{ACTIVATION_FINANCE_HERO.generationLabel}</h2>
        <span className="spacer" />
        <Badge provenance="simulated" label="SIMULATED CONCEPT" large />
      </div>

      <div className="grid-2">
        <div className="flow-diagram">
          <div className="flow-node">
            <div className="h3" style={{ fontSize: 7 }}>
              ACTIVATION COST
            </div>
            <div className="lcd-value lcd-value-sm mono-num">{formatRF(cost, 0)} RF</div>
          </div>
          <FlowArrow />
          <div className="flow-node">
            <div className="h3" style={{ fontSize: 7 }}>
              YOUR RF
            </div>
            <div className="lcd-value lcd-value-sm mono-num">{formatRF(yours, 0)} RF</div>
          </div>
          <FlowArrow label="FINANCE" />
          <div className="flow-node flow-node-dark">
            <div className="h3" style={{ fontSize: 7 }}>
              RARE ADVANCE
            </div>
            <div className="lcd-value lcd-value-sm mono-num">{formatRF(financed, 0)} RF</div>
          </div>
        </div>

        <div className="stack">
          <FlowArrow label="ACTIVATE" />
          <Lcd
            label="REWARD WEIGHT"
            right={<Badge provenance="simulated" />}
            value={`${formatWeight(fromW, 0)} → ${formatWeight(toW, 0)}`}
            sub="Allocation weight created by the action, not a guaranteed return."
          />
          <FlowArrow label="REPAY" />
          <div className="flow-node">
            <div className="h3" style={{ fontSize: 7 }}>
              {formatBpsAsPercent(GROW_FINANCE.repaymentRoutingBps, 0)} OF MODELED FUTURE RF REPAYS FINANCING
            </div>
            <div className="tiny muted">
              The Friend keeps earning the other {formatBpsAsPercent(GROW_FINANCE.ownerRoutingBps, 0)} while the
              financing repays itself.
            </div>
          </div>
          <FlowArrow />
          <div className="flow-node flow-node-dark">
            <div className="h3" style={{ fontSize: 7 }}>
              FINANCING SETTLED
            </div>
            <div className="lcd-value lcd-value-sm">100% OF FUTURE REWARDS REMAIN WITH THE FRIEND</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <p className="h3" style={{ fontSize: 10 }}>
          {ACTIVATION_HERO_CAPTION}
        </p>
        <div style={{ marginTop: 6 }}>
          <Note>
            SIMULATED CONCEPT · NO REAL ACTIVATION OR FINANCING OCCURS. A production version needs a
            protocol-supported reward-routing, assignment or escrow mechanism, and must define transfer
            behaviour while financing is outstanding.
          </Note>
        </div>
        <div style={{ marginTop: 6 }}>
          <Note>{NO_PROMISE_COPY.simulation}</Note>
        </div>
      </div>
    </div>
  )
}

export function InsightPanel() {
  const state = useSession()
  const i = sessionInsight(state)
  return (
    <div className="panel" data-testid="insight-panel">
      <div className="panel-head">
        <h2 className="h2">ECONOMIC INSIGHT</h2>
        <span className="spacer" />
        <Badge provenance="simulated" label="THIS SESSION · SIMULATED" large />
      </div>
      <div className="grid-3">
        <Lcd label="ADVANCES ISSUED" value={`${formatRF(i.advancesIssuedWei, 2)} RF`} small />
        <Lcd label="LIQUIDITY SUPPLIED" value={`${formatRF(i.liquiditySuppliedWei, 2)} RF`} small />
        <Lcd label="LP SPREAD GENERATED" value={`${formatRF(i.lpSpreadGeneratedWei, 2)} RF`} small />
        <Lcd label="RARE ADVANCE RF BURNED" value={`${formatRF(i.rareAdvanceBurnedWei, 2)} RF`} small />
        <Lcd
          label="RF FINANCED INTO RARE FRIENDS ACTIONS"
          value={`${formatRF(i.rfFinancedIntoActionsWei, 2)} RF`}
          small
        />
        <Lcd
          label="UNDERLYING PROTOCOL EFFECT"
          right={<Badge provenance="simulated" />}
          sub={
            <div style={{ marginTop: 4 }}>
              <Stat
                label="Protocol RF burn from funded actions"
                provenance="simulated"
                value={`${formatRF(i.underlyingProtocolBurnWei, 2)} RF`}
              />
              <Stat
                label="Underlying RF reward funding"
                provenance="simulated"
                value={`${formatRF(i.underlyingRewardFundingWei, 2)} RF`}
              />
            </div>
          }
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <Note>
          These totals are cumulative for this browser session only. They are not protocol-wide real data and
          they are not a measure of anything outside this demo.
        </Note>
      </div>
    </div>
  )
}

