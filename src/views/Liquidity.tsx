/**
 * LIQUIDITY MARKET
 * ================
 *
 * The LP side of the economy. Deliberately SECONDARY to the holder flow: this
 * is where you set the terms you are willing to offer.
 *
 * Everything on this page is a SIMULATED pool in a SIMULATED market. No real RF
 * moves, no real WETH moves, no approvals, no transfers.
 */

import { useMemo, useState, type CSSProperties } from 'react'
import { Badge, Lcd, Note, Notice, Panel, SectionTitle, Stat } from '../components/ui'
import { formatBpsAsPercent, formatRF, parseRF } from '../math/rf'
import { MARKET_LIMITS_COPY, PoolCreateWizard } from '../components/PoolCreateWizard'
import {
  canContribute,
  lpAvailableWei,
  lpDeployedWei,
  lpCount,
  openPositions,
  poolTotalLiquidityWei,
  settledPositions,
  termsAreMutable,
} from '../economy/pools/engine'
import { poolUtilizationBps as poolUtil, visiblePools } from '../economy/pools/market'
import { describeTerms } from '../economy/pools/terms'
import { LOCAL_LP_ID } from '../economy/pools/seed'
import type { Pool } from '../economy/pools/types'
import { useMarket, useMarketDispatch, useMarketSummary } from '../session/marketStore'

type Tab = 'all' | 'stream' | 'growth' | 'mine'

export function LiquidityView() {
  const market = useMarket()
  const dispatch = useMarketDispatch()
  const summary = useMarketSummary()
  const [tab, setTab] = useState<Tab>('all')
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const pools = useMemo(() => {
    const visible = visiblePools(market.pools, LOCAL_LP_ID)
    if (tab === 'stream') return visible.filter((p) => p.kind !== 'growth')
    if (tab === 'growth') return visible.filter((p) => p.kind !== 'stream')
    if (tab === 'mine') {
      return market.pools.filter(
        (p) => market.userPoolIds.includes(p.id) || Boolean(p.lps[LOCAL_LP_ID]) || p.creatorLpId === LOCAL_LP_ID,
      )
    }
    return visible
  }, [market.pools, market.userPoolIds, tab])

  const selected = market.pools.find((p) => p.id === selectedPoolId) ?? null

  return (
    <div className="stack">
      <Panel dark>
        <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
          LIQUIDITY
        </h1>
        <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 460, marginTop: 6 }}>
          Supply simulated RF to fund reward advances. Set the terms you are willing to offer, and holders
          choose between pools.
        </p>
      </Panel>

      <Panel title="THE SIMULATED MARKET" right={<Badge provenance="simulated" label="SIMULATED" />}>
        <div className="grid-3">
          <Lcd label="POOLS" value={String(summary.poolCount)} small testId="market-pool-count" />
          <Lcd label="RF IN POOLS" value={`${formatRF(summary.totalLiquidityWei, 0)} RF`} small testId="market-total" />
          <Lcd label="AVAILABLE" value={`${formatRF(summary.availableWei, 0)} RF`} small testId="market-available" />
          <Lcd label="DEPLOYED IN FINANCING" value={`${formatRF(summary.deployedWei, 0)} RF`} small testId="market-deployed" />
          <Lcd label="ACTIVE FINANCING" value={String(summary.activePositions)} small testId="market-active" />
          <Lcd label="SETTLED" value={String(summary.settledPositions)} small testId="market-settled" />
        </div>
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          These pools are simulated examples in this browser. They are not real market makers and no named
          party is a real person.
        </p>
      </Panel>

      {notice ? (
        <Notice tone="info">
          {notice}{' '}
          <button type="button" className="btn btn-sm" onClick={() => setNotice(null)}>
            OK
          </button>
        </Notice>
      ) : null}

      {market.lastError ? (
        <Notice tone="warn">
          {market.lastError.message} {market.lastError.hint}{' '}
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'set-error', error: null })}>
            OK
          </button>
        </Notice>
      ) : null}

      {wizardOpen ? (
        <PoolCreateWizard
          onCancel={() => setWizardOpen(false)}
          onCreated={(poolId) => {
            setWizardOpen(false)
            setSelectedPoolId(poolId)
            setNotice('YOUR SIMULATED POOL was created. It is stored in this browser only.')
          }}
        />
      ) : null}

      <Panel
        title="POOLS"
        right={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setWizardOpen(true)}
            data-testid="open-create-pool"
          >
            CREATE A POOL
          </button>
        }
      >
        <div className="btn-group" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} role="tablist" aria-label="Pool filters">
          {(
            [
              ['all', 'ALL'],
              ['stream', 'STREAM'],
              ['growth', 'GROWTH'],
              ['mine', 'MY POOLS'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className="btn btn-outline btn-sm btn-toggle"
              onClick={() => setTab(id)}
              data-testid={`pool-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="stack" style={{ marginTop: 10 }}>
          {pools.length === 0 ? (
            <Notice tone="info">No pools in this view yet. Create one to set your own terms.</Notice>
          ) : (
            pools.map((pool) => (
              <PoolRow key={pool.id} pool={pool} onOpen={() => setSelectedPoolId(pool.id)} />
            ))
          )}
        </div>
      </Panel>

      {selected ? (
        <PoolDetail
          pool={selected}
          onClose={() => setSelectedPoolId(null)}
          onChanged={(msg) => setNotice(msg)}
        />
      ) : null}

      <Panel title="WHAT A LIQUIDITY PROVIDER EARNS">
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
        <div style={{ marginTop: 8 }}>
          <Note>
            No yield is promised and no APY is shown, because a short advance cannot honestly be annualised.
            What is real is the RF premium, the discount and the remaining stream duration. A pool may sit
            unused: contributing RF does not guarantee it is ever deployed.
          </Note>
        </div>
        <div style={{ marginTop: 6 }}>
          <Note>{MARKET_LIMITS_COPY}</Note>
        </div>
      </Panel>
    </div>
  )
}

/** One label + one figure, laid out tightly instead of stretched. */
function Term({ label, value }: { label: string; value: string }) {
  return (
    <span className="term">
      <span className="tiny muted">{label}</span>
      <span className="term-value">{value}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function PoolRow({ pool, onOpen }: { pool: Pool; onOpen: () => void }) {
  const isYours = Boolean(pool.lps[LOCAL_LP_ID]) || pool.creatorLpId === LOCAL_LP_ID
  const kindLabel = pool.kind === 'both' ? 'STREAM + GROWTH' : pool.kind === 'stream' ? 'STREAM' : 'GROWTH'
  return (
    <button type="button" className="fcard" onClick={onOpen} data-testid={`pool-row-${pool.id}`}>
      <span className="fcard-body">
        <span className="fcard-name">{pool.name}</span>
        <span className="row-tight" style={{ marginBottom: 4 }}>
          <Badge provenance="simulated" label="SIMULATED" />
          {isYours ? <Badge provenance="simulated" label="YOUR POOL" /> : null}
          {pool.access.visibility === 'private' ? <Badge provenance="simulated" label="PRIVATE" /> : null}
          {pool.status === 'winding-down' ? <Badge provenance="simulated" label="WINDING DOWN" /> : null}
          <span className="tiny">{kindLabel}</span>
        </span>
        <div className="term-grid">
          <Term label="Available" value={`${formatRF(pool.cashRfWei, 0)} RF`} />
          <Term label="LP premium" value={formatBpsAsPercent(pool.terms.streamPremiumBps)} />
          <Term label="WETH share" value={formatBpsAsPercent(pool.terms.growthWethShareBps)} />
          <Term label="Max finance" value={formatBpsAsPercent(pool.terms.growthMaxFinanceBps)} />
          <Term label="Open" value={String(openPositions(pool).length)} />
          <Term label="Settled" value={String(settledPositions(pool).length)} />
        </div>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function PoolDetail({
  pool,
  onClose,
  onChanged,
}: {
  pool: Pool
  onClose: () => void
  onChanged: (msg: string) => void
}) {
  const dispatch = useMarketDispatch()
  const [amount, setAmount] = useState('5000')
  const [withdrawAmount, setWithdrawAmount] = useState('')

  const yourAvailable = lpAvailableWei(pool, LOCAL_LP_ID)
  const yourDeployed = lpDeployedWei(pool, LOCAL_LP_ID)
  const yourAccount = pool.lps[LOCAL_LP_ID]
  const mayContribute = canContribute(pool, LOCAL_LP_ID)

  const parsed = (raw: string): bigint | null => {
    const m = /^(\d*)(\.\d*)?$/.exec(raw.trim())
    if (!m || (!m[1] && !m[2])) return null
    const int = m[1] || '0'
    const frac = (m[2] ?? '').replace('.', '').padEnd(18, '0').slice(0, 18)
    return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
  }
  const amountWei = parsed(amount)
  const withdrawWei = parsed(withdrawAmount)

  return (
    <Panel
      title={pool.name}
      testId="pool-detail"
      right={
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-testid="close-pool-detail">
          CLOSE
        </button>
      }
    >
      <div className="row-tight" style={{ marginBottom: 10 }}>
        <Badge provenance="simulated" label="SIMULATED POOL" />
        {pool.access.visibility === 'private' ? (
          <Badge provenance="simulated" label={`PRIVATE · CODE ${pool.access.inviteCode}`} />
        ) : (
          <Badge provenance="simulated" label="PUBLIC" />
        )}
        <Badge provenance="simulated" label={`CREATOR ${pool.creatorLpId === LOCAL_LP_ID ? 'YOU' : pool.lps[pool.creatorLpId]?.displayName ?? pool.creatorLpId}`} />
        {pool.termsLocked ? (
          <Badge provenance="simulated" label="TERMS LOCKED" />
        ) : termsAreMutable(pool) ? (
          <Badge provenance="simulated" label="TERMS EDITABLE" />
        ) : null}
      </div>

      <div className="grid-3">
        <Lcd label="TOTAL RF LIQUIDITY" value={`${formatRF(poolTotalLiquidityWei(pool), 0)} RF`} small />
        <Lcd label="AVAILABLE" value={`${formatRF(pool.cashRfWei, 0)} RF`} small />
        <Lcd label="DEPLOYED" value={`${formatRF(pool.positions.reduce((a, p) => a + (p.principalWei - p.principalRepaidWei), 0n), 0)} RF`} small />
        <Lcd label="LP COUNT" value={String(lpCount(pool))} small />
        <Lcd label="ACTIVE POSITIONS" value={String(openPositions(pool).length)} small />
        <Lcd label="UTILIZATION" value={formatBpsAsPercent(poolUtil(pool))} small />
      </div>

      <SectionTitle right={<span className="tiny muted">CREATOR-SET</span>}>
        <span className="h3">TERMS</span>
      </SectionTitle>
      <div className="grid-2">
        {pool.kind !== 'growth' ? (
          <div className="panel-recess">
            <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
              STREAM ADVANCES
            </div>
            {describeTerms(pool.terms, 'stream').map((l) => (
              <Stat key={l.label} label={l.label} value={l.value} />
            ))}
          </div>
        ) : null}
        {pool.kind !== 'stream' ? (
          <div className="panel-recess">
            <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
              GROWTH FINANCING
            </div>
            {describeTerms(pool.terms, 'growth').map((l) => (
              <Stat key={l.label} label={l.label} value={l.value} />
            ))}
            <Stat
              label="Eligible actions"
              value={
                pool.terms.eligibleGenerations === null
                  ? `All generations · ${pool.terms.eligibleActions.length} action types`
                  : `Gens ${pool.terms.eligibleGenerations.join(', ')} · ${pool.terms.eligibleActions.length} action types`
              }
            />
          </div>
        ) : null}
      </div>

      {pool.termsLocked ? (
        <Note>
          TERMS LOCKED — this pool has other contributors or open financing, so the economic terms cannot
          change. That protects the LPs who already committed RF. Create a new pool instead if you want
          different terms.
        </Note>
      ) : null}

      <SectionTitle>
        <span className="h3">LIQUIDITY PROVIDERS</span>
      </SectionTitle>
      <div className="table-scroll">
        <table className="tbl" data-testid="lp-table">
          <thead>
            <tr>
              <th scope="col">LP</th>
              <th scope="col" className="num">
                Contributed
              </th>
              <th scope="col" className="num">
                Available
              </th>
              <th scope="col" className="num">
                RF premium earned
              </th>
              <th scope="col" className="num">
                WETH earned
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.values(pool.lps).map((l) => (
              <tr key={l.id} data-testid={`lp-row-${l.id}`}>
                <th scope="row">{l.id === LOCAL_LP_ID ? 'You' : l.displayName}</th>
                <td className="num">{formatRF(l.contributedWei - l.withdrawnWei, 0)} RF</td>
                <td className="num">{formatRF(lpAvailableWei(pool, l.id), 0)} RF</td>
                <td className="num">{formatRF(l.rfPremiumEarnedWei, 2)} RF</td>
                <td className="num">{formatRF(l.wethEarnedWei, 6)} WETH</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <SectionTitle>
            <span className="h3">ADD LIQUIDITY</span>
          </SectionTitle>
          {mayContribute ? (
            <>
              <div className="btn-group" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {['1000', '5000', '10000'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="btn btn-outline btn-sm btn-toggle"
                    aria-pressed={amount === v}
                    onClick={() => setAmount(v)}
                    data-testid={`contribute-preset-${v}`}
                  >
                    {formatRF(parseRF(v), 0)} RF
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <label className="tiny" htmlFor="contribute-custom">
                  CUSTOM RF
                </label>
                <input
                  id="contribute-custom"
                  style={inputStyle}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="contribute-custom"
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-block"
                  disabled={amountWei === null || amountWei <= 0n}
                  onClick={() => {
                    if (!amountWei) return
                    dispatch({ type: 'contribute', poolId: pool.id, amountWei })
                    onChanged(`Added ${formatRF(amountWei, 0)} RF to ${pool.name}. Terms are now locked.`)
                  }}
                  data-testid="contribute-submit"
                >
                  ADD SIMULATED LIQUIDITY
                </button>
              </div>
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                You are opting into these exact terms:{' '}
                {describeTerms(pool.terms, pool.kind === 'growth' ? 'growth' : 'stream')
                  .map((l) => `${l.label} ${l.value}`)
                  .join(' · ')}
                . Your earnings are proportional to the positions your RF helps fund.
              </p>
            </>
          ) : (
            <Notice tone="warn">
              This is a private pool that only its creator can fund. You need an invite to add RF.
            </Notice>
          )}
        </div>

        <div>
          <SectionTitle>
            <span className="h3">YOUR POSITION</span>
          </SectionTitle>
          {yourAccount ? (
            <>
              <Stat label="Contributed" provenance="simulated" value={`${formatRF(yourAccount.contributedWei - yourAccount.withdrawnWei, 0)} RF`} />
              <Stat label="Available to withdraw" provenance="simulated" value={`${formatRF(yourAvailable, 0)} RF`} />
              <Stat label="Deployed in open positions" provenance="simulated" value={`${formatRF(yourDeployed, 0)} RF`} />
              <Stat label="RF premium earned" provenance="simulated" value={`${formatRF(yourAccount.rfPremiumEarnedWei, 2)} RF`} />
              <Stat label="WETH earned" provenance="simulated" value={`${formatRF(yourAccount.wethEarnedWei, 6)} WETH`} />
              <div className="row" style={{ marginTop: 6 }}>
                <label className="tiny" htmlFor="withdraw-custom">
                  WITHDRAW RF
                </label>
                <input
                  id="withdraw-custom"
                  style={inputStyle}
                  inputMode="decimal"
                  placeholder={formatRF(yourAvailable, 0)}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  data-testid="withdraw-custom"
                />
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={yourAvailable <= 0n}
                  onClick={() => {
                    dispatch({ type: 'withdraw', poolId: pool.id, amountWei: yourAvailable })
                    onChanged(`Withdrew ${formatRF(yourAvailable, 0)} RF.`)
                  }}
                  data-testid="withdraw-max"
                >
                  WITHDRAW ALL AVAILABLE
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={withdrawWei === null || withdrawWei <= 0n || withdrawWei > yourAvailable}
                  onClick={() => {
                    if (!withdrawWei) return
                    dispatch({ type: 'withdraw', poolId: pool.id, amountWei: withdrawWei })
                    onChanged(`Withdrew ${formatRF(withdrawWei, 0)} RF.`)
                  }}
                  data-testid="withdraw-submit"
                >
                  WITHDRAW
                </button>
              </div>
            </>
          ) : (
            <Notice tone="info">
              You have not added RF to this pool yet.
            </Notice>
          )}
        </div>
      </div>

      {pool.positions.length > 0 ? (
        <>
          <SectionTitle>
            <span className="h3">FINANCING POSITIONS</span>
          </SectionTitle>
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col">Funded by</th>
                  <th scope="col" className="num">
                    Principal
                  </th>
                  <th scope="col" className="num">
                    Repaid
                  </th>
                </tr>
              </thead>
              <tbody>
                {pool.positions.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      {p.kind === 'stream' ? 'Stream' : `Growth · ${p.actionKind}`}
                    </th>
                    <td>
                      {p.funding.map((f) => `${pool.lps[f.lpId]?.displayName ?? f.lpId} ${Number(f.shareBps) / 100}%`).join(' · ')}
                    </td>
                    <td className="num">{formatRF(p.principalWei, 2)} RF</td>
                    <td className="num">
                      {formatRF(p.principalRepaidWei, 2)} / {formatRF(p.principalWei, 2)} RF
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            Each position records WHO funded it. Later arrivals never receive earnings from a position they did
            not fund.
          </Note>
        </>
      ) : null}
    </Panel>
  )
}

const inputStyle: CSSProperties = {
  font: 'inherit',
  padding: '8px',
  width: 140,
  border: '2px solid var(--ink)',
  background: 'var(--paper)',
  minHeight: 36,
}
