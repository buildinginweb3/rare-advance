import { useState } from 'react'
import { Badge, Lcd, Note, Notice, Panel, SectionTitle, Stat } from '../components/ui'
import { formatBpsAsPercent, formatRF, parseRF } from '../math/rf'
import { LP_DEPOSIT_PRESETS, NO_PROMISE_COPY, SIMULATED_QUOTES_LABEL, ADVANCE_MARKET_TERMS } from '../economy/rareAdvanceConfig'
import { poolAvailable, poolUtilizationBps } from '../economy/pool'
import { useDispatch, useSession } from '../session/store'
import { LIQUIDITY_HEADLINE } from '../content/copy'

export function LiquidityView() {
  const state = useSession()
  const dispatch = useDispatch()
  const [amount, setAmount] = useState('5000')
  const util = poolUtilizationBps(state.pool)
  const available = poolAvailable(state.pool)

  const parsed = (() => {
    const m = /^(\d*)(\.\d*)?$/.exec(amount.trim())
    if (!m || (!m[1] && !m[2])) return null
    const int = m[1] || '0'
    const frac = (m[2] ?? '').replace('.', '').padEnd(18, '0').slice(0, 18)
    return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
  })()

  const shareAfter = (() => {
    const total = state.pool.totalLiquidityWei + (parsed ?? 0n)
    if (total <= 0n) return 0n
    return ((state.pool.userDepositWei + (parsed ?? 0n)) * 10_000n) / total
  })()

  return (
    <div className="stack">
      <Panel dark>
        <div className="stack">
          <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
            LIQUIDITY
          </h1>
          <p className="h3" style={{ fontSize: 9, color: 'var(--paper)' }}>
            {LIQUIDITY_HEADLINE}
          </p>
          <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 480 }}>
            Rare Advance has two sides. A holder turns future RF into liquidity now. A liquidity provider
            supplies RF and earns the spread as those streams settle. Both sides are simulated here.
          </p>
        </div>
      </Panel>

      <Panel
        title="LIQUIDITY POOL"
        testId="liquidity-pool"
        right={<Badge provenance="simulated" label={NO_PROMISE_COPY.poolTerms} large />}
      >
        <div className="grid-3">
          <Lcd label="TOTAL LIQUIDITY" value={`${formatRF(state.pool.totalLiquidityWei, 2)} RF`} small />
          <Lcd
            label="ADVANCES OUTSTANDING"
            value={`${formatRF(state.pool.advancesOutstandingWei, 2)} RF`}
            small
          />
          <Lcd label="AVAILABLE" value={`${formatRF(available, 2)} RF`} small />
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <Lcd
            label="UTILIZATION"
            value={formatBpsAsPercent(util)}
            small
            sub={<div className="meter" aria-hidden="true"><span style={{ width: `${Number(util) / 100}%` }} /></div>}
          />
          <Lcd label="LP SPREAD EARNED" value={`${formatRF(state.pool.lpSpreadEarnedWei, 2)} RF`} small />
          <Lcd
            label="RF BURNED BY RARE ADVANCE"
            value={`${formatRF(state.pool.rareAdvanceBurnedWei, 2)} RF`}
            small
          />
        </div>
        <div className="panel-recess" style={{ marginTop: 8 }}>
          <Stat
            label="RF financed into Rare Friends actions"
            provenance="simulated"
            value={`${formatRF(state.pool.rfFinancedIntoActionsWei, 2)} RF`}
          />
          <Stat
            label="Advances issued this pool"
            provenance="simulated"
            value={`${formatRF(state.pool.advancesIssuedWei, 2)} RF`}
          />
        </div>
      </Panel>

      <Panel title="PROVIDE SIMULATED LIQUIDITY" right={<Badge provenance="simulated" label="SIMULATED" />}>
        <div className="btn-group" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label="Deposit presets">
          {LP_DEPOSIT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-outline btn-sm btn-toggle"
              aria-pressed={amount === p}
              onClick={() => setAmount(p)}
              data-testid={`lp-preset-${p}`}
            >
              {formatRF(parseRF(p), 0)} RF
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <label className="tiny" htmlFor="lp-custom">
            CUSTOM RF
          </label>
          <input
            id="lp-custom"
            style={{
              font: 'inherit',
              padding: '8px',
              width: 150,
              border: '2px solid var(--ink)',
              background: 'var(--paper)',
              minHeight: 36,
            }}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="lp-custom"
          />
        </div>

        <div className="lcd" style={{ marginTop: 10 }}>
          <div className="lcd-label">
            <span>YOUR POOL SHARE</span>
            <Badge provenance="simulated" />
          </div>
          <div className="grid-2">
            <Lcd
              label="AFTER DEPOSIT"
              value={formatBpsAsPercent(shareAfter, 2)}
              small
              valueTestId="lp-preview-share"
            />
            <Lcd
              label="PRO RATA SHARE OF SPREAD EARNED"
              value={`${formatRF(
                (state.pool.lpSpreadEarnedWei * shareAfter) / 10_000n,
                3,
              )} RF`}
              small
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-block"
            disabled={parsed === null || parsed <= 0n}
            onClick={() => parsed && dispatch({ type: 'add-liquidity', amountWei: parsed })}
            data-testid="lp-provide"
          >
            PROVIDE SIMULATED LIQUIDITY
          </button>
        </div>

        {state.pool.userDepositWei > 0n ? (
          <div style={{ marginTop: 8 }} data-testid="lp-user-position">
            <Notice tone="info">
              Your simulated position: {formatRF(state.pool.userDepositWei, 2)} RF supplied ·{' '}
              {formatBpsAsPercent(state.pool.userDepositShareBps)} of the pool ·{' '}
              {formatRF(state.pool.userLpEarningsWei, 3)} RF of spread earned to date.
            </Notice>
          </div>
        ) : null}

        <div style={{ marginTop: 8 }}>
          <Note>
            No yield is promised here. No APY is shown, because a five-day advance cannot honestly be
            annualised. What is real is the RF spread, the discount and the remaining stream duration.
          </Note>
        </div>
        <div style={{ marginTop: 6 }}>
          <Note>
            {ADVANCE_MARKET_TERMS.label}: LP spread {formatBpsAsPercent(ADVANCE_MARKET_TERMS.lpSpreadBps)} and
            Rare Advance burn {formatBpsAsPercent(ADVANCE_MARKET_TERMS.rareAdvanceBurnBps)} of each settled
            advance. {SIMULATED_QUOTES_LABEL} are not real counterparties.
          </Note>
        </div>
      </Panel>

      <Panel title="TWO SIDES OF THE SAME ECONOMY">
        <div className="grid-2">
          <div className="panel-recess">
            <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
              HOLDER
            </div>
            <p className="tiny" style={{ margin: 0 }}>
              future RF → liquidity now
            </p>
          </div>
          <div className="panel-recess">
            <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
              LP
            </div>
            <p className="tiny" style={{ margin: 0 }}>
              RF liquidity → spread later
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

export function HowItWorksView() {
  const nodes = [
    'RARE FRIENDS ACTIVITY',
    'RF / WETH REWARD FUNDING',
    'ACTIVE FRIENDS',
    '7-DAY REWARD STREAM',
    'RARE ADVANCE',
    'LIQUIDITY TODAY',
    'STREAM SETTLEMENT',
  ]
  const ext = [
    'LIQUIDITY',
    'FINANCE GROWTH ACTION',
    'ACTIVATE / HARDWIRE / PROMOTE / UPGRADE',
    'RF BURN + REWARD FUNDING',
    'MORE REWARD WEIGHT',
    'FUTURE REWARDS',
    'REPAY FINANCING',
  ]
  return (
    <div className="stack">
      <Panel dark>
        <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
          HOW RARE ADVANCE FITS
        </h1>
        <p className="h3" style={{ fontSize: 9, color: 'var(--paper)' }}>
          Tomorrow&apos;s rewards. Today&apos;s liquidity.
        </p>
      </Panel>

      <div className="grid-2">
        <Panel title="THE ADVANCE">
          <div className="flow-diagram">
            {nodes.map((n, i) => (
              <div key={n}>
                {i > 0 ? <div className="flow-arrow" aria-hidden="true" /> : null}
                <div className={i === 4 ? 'flow-node flow-node-dark' : 'flow-node'}>
                  <span className="h3" style={{ fontSize: 7 }}>
                    {n}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="THE EXTENSION" right={<Badge provenance="simulated" label="SIMULATED" />}>
          <div className="flow-diagram">
            {ext.map((n, i) => (
              <div key={n}>
                {i > 0 ? <div className="flow-arrow" aria-hidden="true" /> : null}
                <div className={i === 1 || i === 6 ? 'flow-node flow-node-dark' : 'flow-node'}>
                  <span className="h3" style={{ fontSize: 7 }}>
                    {n}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="WHAT THIS IS, PRECISELY">
        <div className="grid-2">
          <div>
            <SectionTitle right={<Badge provenance="protocol" label="OFFICIAL PROTOCOL" />}>
              <span className="h3">Rare Friends already has</span>
            </SectionTitle>
            <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>RF-consuming activation, hardwire, promotion and upgrade actions</li>
              <li>Reward weights that decide each active Friend&apos;s share</li>
              <li>Shared RF and WETH reward streams</li>
              <li>Seven-day streaming of allocated rewards</li>
              <li>NFT-owned reward positions that follow the token</li>
            </ul>
          </div>
          <div>
            <SectionTitle right={<Badge provenance="simulated" label="RARE ADVANCE" />}>
              <span className="h3">Rare Advance adds</span>
            </SectionTitle>
            <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>Liquidity against allocated RF streams</li>
              <li>An RF liquidity provider market</li>
              <li>Modeled reward-stream settlement</li>
              <li>Future financing for actions that create additional reward weight</li>
            </ul>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Note>
            This does not guarantee profitability. The loop only works if future reward funding actually
            arrives, and reward funding depends on protocol activity.
          </Note>
        </div>
      </Panel>
    </div>
  )
}
