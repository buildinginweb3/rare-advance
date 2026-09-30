/**
 * CREATE A POOL
 * =============
 *
 * A short wizard, one step at a time. The holder path never touches this.
 *
 * No real RF moves. This creates a SIMULATED pool stored in this browser only.
 */

import { useState, type CSSProperties } from 'react'
import { Badge, Note, Notice, Panel, SectionTitle, Stat } from './ui'
import { BPS_SCALE, formatBpsAsPercent, formatRF, parseRF } from '../math/rf'
import { MAX_LP_PREMIUM_BPS, MAX_WETH_SHARE_BPS } from '../economy/marketLimits'
import {
  describeTerms,
  validateTerms,
  PREMIUM_PRESETS,
  PROTOCOL_STREAM_DURATION_MS,
  DEFAULT_MAX_FINANCE_BPS,
  RF_ROUTING_PRESETS,
  WETH_SHARE_PRESETS,
} from '../economy/pools/terms'
import type { GrowthActionKind } from '../types'
import type { PoolAccess, PoolKind, PoolTerms } from '../economy/pools/types'
import { nextUserPoolId, useMarket, useMarketDispatch } from '../session/marketStore'

export const MARKET_LIMITS_COPY =
  `You can set any number, including an absurd one. A pool priced out of the market simply gets no borrowers — that is the market working.`

const ACTIONS: { id: GrowthActionKind; label: string }[] = [
  { id: 'activate', label: 'Genesis activation' },
  { id: 'hardwire', label: 'Hardwire' },
  { id: 'reactivate', label: 'Reactivation' },
  { id: 'promote', label: 'Promotion' },
  { id: 'upgrade', label: 'Tier upgrade' },
]

const CAPITAL_PRESETS = ['1000', '5000', '10000', '25000'] as const

function parseRf(raw: string): bigint | null {
  const m = /^(\d*)(\.\d*)?$/.exec(raw.trim())
  if (!m || (!m[1] && !m[2])) return null
  const int = m[1] || '0'
  const frac = (m[2] ?? '').replace('.', '').padEnd(18, '0').slice(0, 18)
  return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
}

export function PoolCreateWizard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (poolId: string) => void
}) {
  const market = useMarket()
  const dispatch = useMarketDispatch()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [liquidityAccess, setLiquidityAccess] = useState<'creator-only' | 'invited'>('invited')
  const [borrowerAccess, setBorrowerAccess] = useState<'invited' | 'anyone-with-link'>('invited')
  const [kind, setKind] = useState<PoolKind>('stream')
  const [capital, setCapital] = useState<string>('5000')
  const [streamPremiumBps, setStreamPremiumBps] = useState(400n)
  const [feeBps, setFeeBps] = useState(100n)
  const [growthPremiumBps, setGrowthPremiumBps] = useState(500n)
  // A pool funds what an action needs. There is deliberately no "maximum
  // financing" knob: refusing to lend more would not protect the pool, since
  // every borrower repays the same RF premium on whatever they took.
  const [rfRoutingBps, setRfRoutingBps] = useState(7_500n)
  const [wethShareBps, setWethShareBps] = useState(0n)
  const [actions, setActions] = useState<GrowthActionKind[]>(ACTIONS.map((a) => a.id))

  const capitalWei = parseRf(capital)

  const terms: PoolTerms = {
    streamPremiumBps,
    rareAdvanceFeeBps: feeBps,
    maxAdvanceShareBps: BPS_SCALE,
    maxStreamPositionWei: 50_000n * 10n ** 18n,
    growthPremiumBps,
    growthMaxFinanceBps: DEFAULT_MAX_FINANCE_BPS,
    growthRfRoutingBps: rfRoutingBps,
    growthWethShareBps: wethShareBps,
    growthMaxPositionWei: 50_000n * 10n ** 18n,
    eligibleActions: actions,
    eligibleGenerations: null,
  }

  const validation = validateTerms(terms)

  const access: PoolAccess = {
    visibility,
    inviteCode: visibility === 'private' ? `SIM${String(market.seq).padStart(4, '0')}` : null,
    privateLiquidityAccess: liquidityAccess,
    privateBorrowerAccess: borrowerAccess,
    allowlistedLps: visibility === 'private' ? ['you'] : [],
  }

  const steps = ['NAME', 'ACCESS', 'WHAT IT FUNDS', 'ADD RF', 'SET TERMS', 'REVIEW']

  return (
    <Panel
      title="CREATE A POOL"
      testId="pool-wizard"
      right={<Badge provenance="simulated" label={`STEP ${step + 1} OF ${steps.length}`} large />}
    >
      <Note>
        A SIMULATED pool, stored in this browser only. No real RF moves. {MARKET_LIMITS_COPY}
      </Note>

      <ol className="tiny" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: '10px 0' }}>
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            style={{
              border: '1px solid var(--ink)',
              padding: '3px 6px',
              fontFamily: 'var(--font-pixel)',
              fontSize: 7,
              background: i === step ? 'var(--ink)' : 'var(--paper)',
              color: i === step ? 'var(--paper)' : 'var(--ink)',
            }}
          >
            {s}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div>
          <SectionTitle>
            <span className="h3">POOL NAME</span>
          </SectionTitle>
          <input
            aria-label="Pool name"
            style={inputStyleWide}
            placeholder="e.g. Syrup RF Pool"
            value={name}
            maxLength={28}
            onChange={(e) => setName(e.target.value)}
            data-testid="wizard-name"
          />
        </div>
      ) : null}

      {step === 1 ? (
        <div>
          <SectionTitle>
            <span className="h3">WHO CAN USE THIS POOL?</span>
          </SectionTitle>
          <div className="grid-2">
            <ChoiceCard
              title="PUBLIC"
              body="Discoverable by everyone. Anyone can contribute RF and any eligible borrower can choose it."
              selected={visibility === 'public'}
              onSelect={() => setVisibility('public')}
              testId="access-public"
            />
            <ChoiceCard
              title="PRIVATE"
              body="Not publicly discoverable. Access needs an invite code."
              selected={visibility === 'private'}
              onSelect={() => setVisibility('private')}
              testId="access-private"
            />
          </div>
          {visibility === 'private' ? (
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div>
                <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
                  WHO CAN PROVIDE LIQUIDITY?
                </div>
                <div className="btn-group" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-toggle"
                    aria-pressed={liquidityAccess === 'creator-only'}
                    onClick={() => setLiquidityAccess('creator-only')}
                    data-testid="liq-creator-only"
                  >
                    CREATOR ONLY
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-toggle"
                    aria-pressed={liquidityAccess === 'invited'}
                    onClick={() => setLiquidityAccess('invited')}
                    data-testid="liq-invited"
                  >
                    INVITED LPs
                  </button>
                </div>
              </div>
              <div>
                <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
                  WHO CAN USE THE CAPITAL?
                </div>
                <div className="btn-group" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-toggle"
                    aria-pressed={borrowerAccess === 'invited'}
                    onClick={() => setBorrowerAccess('invited')}
                    data-testid="borrow-invited"
                  >
                    INVITED
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-toggle"
                    aria-pressed={borrowerAccess === 'anyone-with-link'}
                    onClick={() => setBorrowerAccess('anyone-with-link')}
                    data-testid="borrow-link"
                  >
                    ANYONE WITH LINK
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <SectionTitle>
            <span className="h3">WHAT CAN THE POOL FINANCE?</span>
          </SectionTitle>
          <div className="grid-3">
            <ChoiceCard
              title="STREAM ADVANCES"
              body="Discounted sale of RF that is already streaming."
              selected={kind === 'stream'}
              onSelect={() => setKind('stream')}
              testId="kind-stream"
            />
            <ChoiceCard
              title="FRIEND GROWTH"
              body="Finances activation, hardwire, reactivation, promotion and upgrades."
              selected={kind === 'growth'}
              onSelect={() => setKind('growth')}
              testId="kind-growth"
            />
            <ChoiceCard
              title="BOTH"
              body="Capital can fund either market."
              selected={kind === 'both'}
              onSelect={() => setKind('both')}
              testId="kind-both"
            />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <SectionTitle>
            <span className="h3">ADD RF</span>
          </SectionTitle>
          <div className="btn-group" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {CAPITAL_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                className="btn btn-outline btn-sm btn-toggle"
                aria-pressed={capital === v}
                onClick={() => setCapital(v)}
                data-testid={`capital-${v}`}
              >
                {formatRF(parseRF(v), 0)} RF
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <label className="tiny" htmlFor="wizard-capital">
              CUSTOM RF
            </label>
            <input
              id="wizard-capital"
              style={inputStyleWide}
              inputMode="decimal"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              data-testid="wizard-capital"
            />
          </div>
          <p className="tiny muted">
            Simulated RF. Nothing is deposited anywhere and no approval is requested.
          </p>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="stack">
          {kind !== 'growth' ? (
            <div className="panel-recess">
              <div className="h3" style={{ fontSize: 8, marginBottom: 6 }}>
                STREAM ADVANCE TERMS
              </div>
              <BpsPicker
                label="LP PREMIUM"
                hint="Your share of the settled advance. Not a guaranteed return."
                value={streamPremiumBps}
                presets={PREMIUM_PRESETS}
                max={MAX_LP_PREMIUM_BPS}
                onChange={setStreamPremiumBps}
                testIdPrefix="stream-premium"
              />
              <BpsPicker
                label="RARE ADVANCE FEE"
                hint="Rare Advance economic fee. Modelled as an RF burn."
                value={feeBps}
                presets={[0n, 100n, 200n]}
                max={MAX_LP_PREMIUM_BPS}
                onChange={setFeeBps}
                testIdPrefix="stream-fee"
              />
              <p className="tiny muted" style={{ margin: '6px 0 0' }}>
                Rare Friends streams last seven days, so a Stream Advance has a {Number(PROTOCOL_STREAM_DURATION_MS / 86_400_000n)}-day
                maximum term.
              </p>
            </div>
          ) : null}

          {kind !== 'stream' ? (
            <div className="panel-recess">
              <div className="h3" style={{ fontSize: 8, marginBottom: 6 }}>
                GROWTH FINANCING TERMS
              </div>
              <BpsPicker
                label="LP PREMIUM"
                hint="Premium on the RF you finance."
                value={growthPremiumBps}
                presets={PREMIUM_PRESETS}
                max={MAX_LP_PREMIUM_BPS}
                onChange={setGrowthPremiumBps}
                testIdPrefix="growth-premium"
              />
              <BpsPicker
                label="RF REWARD ROUTING"
                hint="Share of the Friend's future RF rewards that repays you."
                value={rfRoutingBps}
                presets={RF_ROUTING_PRESETS}
                max={BPS_SCALE}
                onChange={setRfRoutingBps}
                testIdPrefix="growth-routing"
              />
              <BpsPicker
                label="WETH SHARE WHILE FINANCING IS ACTIVE"
                hint="The pool receives this percentage of modeled WETH rewards while Growth financing remains unpaid. Once financing settles, the Friend keeps 100% again."
                value={wethShareBps}
                presets={WETH_SHARE_PRESETS}
                max={MAX_WETH_SHARE_BPS}
                onChange={setWethShareBps}
                testIdPrefix="growth-weth"
              />
              <div className="h3" style={{ fontSize: 8, margin: '10px 0 4px' }}>
                ELIGIBLE ACTIONS
              </div>
              <div className="row-tight">
                {ACTIONS.map((a) => {
                  const on = actions.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="btn btn-outline btn-sm btn-toggle"
                      aria-pressed={on}
                      onClick={() => setActions((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                      data-testid={`action-${a.id}`}
                    >
                      {a.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {validation.errors.length > 0 ? (
            <Notice tone="error">
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {validation.warnings.length > 0 ? <Notice tone="warn">{validation.warnings.join(' ')}</Notice> : null}
        </div>
      ) : null}

      {step === 5 ? (
        <div data-testid="wizard-review">
          <SectionTitle right={<Badge provenance="simulated" label={visibility.toUpperCase()} />}>
            <span className="h3">{(name.trim() || 'My Simulated Pool').toUpperCase()}</span>
          </SectionTitle>
          <p className="tiny muted">YOU ARE OFFERING</p>
          {kind !== 'growth' ? (
            <>
              <div className="h3" style={{ fontSize: 8, margin: '8px 0 4px' }}>
                REWARD ADVANCES
              </div>
              <div className="panel-recess">
                {describeTerms(terms, 'stream').map((l) => (
                  <Stat key={l.label} label={l.label} value={l.value} />
                ))}
              </div>
            </>
          ) : null}
          {kind !== 'stream' ? (
            <>
              <div className="h3" style={{ fontSize: 8, margin: '10px 0 4px' }}>
                FRIEND GROWTH
              </div>
              <div className="panel-recess">
                {describeTerms(terms, 'growth').map((l) => (
                  <Stat key={l.label} label={l.label} value={l.value} />
                ))}
                <Stat label="Eligible actions" value={actions.map((a) => ACTIONS.find((x) => x.id === a)?.label).join(', ') || 'None'} />
              </div>
            </>
          ) : null}
          <div className="panel-recess" style={{ marginTop: 8 }}>
            <Stat label="Starting liquidity" provenance="simulated" value={capitalWei ? `${formatRF(capitalWei, 0)} RF` : '—'} />
          </div>
          <Note>
            OTHER USERS CAN add RF to this pool and borrow according to these terms. Once someone else
            contributes, or a financing position opens, these terms become LOCKED so nobody can change the
            deal after the fact.
          </Note>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        {step > 0 ? (
          <button type="button" className="btn btn-outline" onClick={() => setStep((s) => s - 1)} data-testid="wizard-back">
            BACK
          </button>
        ) : null}
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="btn"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 3 && (capitalWei === null || capitalWei <= 0n)}
            data-testid="wizard-next"
          >
            NEXT
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={!validation.ok || capitalWei === null || capitalWei <= 0n}
            onClick={() => {
              if (!capitalWei) return
              const newId = nextUserPoolId(market.seq)
              dispatch({
                type: 'create-pool',
                name: name.trim() || 'My Simulated Pool',
                kind,
                capitalWei,
                terms,
                access,
              })
              // The reducer prepends, so the new pool is the first entry.
              onCreated(newId)
            }}
            data-testid="wizard-create"
          >
            CREATE SIMULATED POOL
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onCancel} data-testid="wizard-cancel">
          CANCEL
        </button>
      </div>
    </Panel>
  )
}

function ChoiceCard({
  title,
  body,
  selected,
  onSelect,
  testId,
}: {
  title: string
  body: string
  selected: boolean
  onSelect: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      className="fcard"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={testId}
      style={{ alignItems: 'flex-start' }}
    >
      <span className="fcard-body">
        <span className="fcard-name">{title}</span>
        <span className="tiny">{body}</span>
      </span>
    </button>
  )
}

function BpsPicker({
  label,
  hint,
  value,
  presets,
  max,
  onChange,
  testIdPrefix,
}: {
  label: string
  hint: string
  value: bigint
  presets: readonly bigint[]
  max: bigint
  onChange: (v: bigint) => void
  testIdPrefix: string
}) {
  const step = presets.length > 0 ? presets[1]! - presets[0]! : 100n
  // Typed input is kept as a raw string so a half-typed "12." or "" does not
  // fight the cursor. It is only committed once it parses.
  const [typed, setTyped] = useState('')

  function commitTyped() {
    const raw = typed.trim().replace('%', '')
    if (raw === '') { setTyped(''); return }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) { setTyped(''); return }
    const bps = Math.round(n * 100) // 12.5% -> 1250 bps
    onChange(bps > max ? max : BigInt(bps))
    setTyped('')
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="tiny h3" style={{ fontSize: 8 }}>
          {label}
        </span>
        <span className="mono-num" style={{ fontWeight: 700 }} data-testid={`${testIdPrefix}-value`}>
          {formatBpsAsPercent(value)}
        </span>
      </div>
      <div className="btn-group" style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}>
        {presets.map((p) => (
          <button
            key={String(p)}
            type="button"
            className="btn btn-outline btn-sm btn-toggle"
            aria-pressed={value === p}
            onClick={() => onChange(p)}
            data-testid={`${testIdPrefix}-${p}`}
          >
            {formatBpsAsPercent(p)}
          </button>
        ))}
      </div>

      {/* Steppers AND free typing: presets are a shortcut, not the only way. */}
      <div className="row-tight" style={{ marginTop: 5 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange(value > step ? value - step : 0n)}
          aria-label={`Decrease ${label}`}
          data-testid={`${testIdPrefix}-minus`}
        >
          −
        </button>
        <input
          className="term-input"
          inputMode="decimal"
          aria-label={`${label} percent`}
          placeholder={formatBpsAsPercent(value).replace('%', '')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitTyped() }
            if (e.key === 'Escape') setTyped('')
          }}
          data-testid={`${testIdPrefix}-input`}
        />
        <span className="tiny muted">%</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange(value + step > max ? max : value + step)}
          aria-label={`Increase ${label}`}
          data-testid={`${testIdPrefix}-plus`}
        >
          +
        </button>
      </div>

      {hint ? <p className="tiny muted" style={{ margin: '4px 0 0' }}>{hint}</p> : null}
    </div>
  )
}

const inputStyleWide: CSSProperties = {
  font: 'inherit',
  padding: '10px',
  width: '100%',
  maxWidth: 340,
  border: '2px solid var(--ink)',
  background: 'var(--paper)',
  minHeight: 40,
}
