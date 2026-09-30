import type { ReactNode } from 'react'
import type { DataProvenance } from '../types'
import { PROVENANCE_LABEL } from '../types'

/**
 * Data provenance is a product feature, not a decoration. Every meaningful
 * number carries one, and provenance is never encoded by color alone: each
 * badge has a distinct fill pattern AND its own text.
 */
export function Badge({
  provenance,
  label,
  large,
  invert,
}: {
  provenance?: DataProvenance
  label?: string
  large?: boolean
  invert?: boolean
}) {
  const text = label ?? (provenance ? PROVENANCE_LABEL[provenance] : '')
  if (!text) return null
  const cls = ['badge', provenance ? `badge-${provenance}` : '', large ? 'badge-lg' : '', invert ? 'badge-invert' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} data-provenance={provenance ?? 'none'}>
      {text}
    </span>
  )
}

export function Lcd({
  label,
  value,
  right,
  sub,
  small,
  children,
  id,
  valueTestId,
  testId,
}: {
  label: string
  value?: ReactNode
  right?: ReactNode
  sub?: ReactNode
  small?: boolean
  children?: ReactNode
  id?: string
  valueTestId?: string
  /** Test hook on the whole cell. */
  testId?: string
}) {
  return (
    <div className="lcd" data-testid={testId}>
      <div className="lcd-label">
        <span>{label}</span>
        {right}
      </div>
      {value !== undefined ? (
        <div
          className={small ? 'lcd-value lcd-value-sm mono-num' : 'lcd-value mono-num'}
          id={id}
          data-testid={valueTestId}
        >
          {value}
        </div>
      ) : null}
      {sub ? <div className="tiny muted" style={{ marginTop: 4 }}>{sub}</div> : null}
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  provenance,
  hint,
  valueTestId,
}: {
  label: ReactNode
  value: ReactNode
  provenance?: DataProvenance
  hint?: ReactNode
  valueTestId?: string
}) {
  return (
    <div className="stat">
      <span className="stat-key">
        {label}
        {provenance ? <Badge provenance={provenance} /> : null}
      </span>
      <span className="stat-val" data-testid={valueTestId}>
        {value}
        {hint ? <span className="tiny muted"> {hint}</span> : null}
      </span>
    </div>
  )
}

/** A stacked label / value / badge block, for dense dashboard headers. */
export function StatBlock({
  label,
  value,
  provenance,
  hint,
  testId,
}: {
  label: string
  value: ReactNode
  provenance?: DataProvenance
  hint?: ReactNode
  testId?: string
}) {
  return (
    <div className="sblock" data-testid={testId}>
      <div className="sblock-label">
        <span>{label}</span>
        {provenance ? <Badge provenance={provenance} /> : null}
      </div>
      <div className="sblock-value mono-num">{value}</div>
      {hint ? <div className="tiny muted">{hint}</div> : null}
    </div>
  )
}

export function Note({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={dark ? 'note note-dark' : 'note'} style={{ margin: 0 }}>
      {children}
    </p>
  )
}

export function Notice({ tone, children }: { tone: 'info' | 'warn' | 'error'; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="h3" aria-hidden="true">
        {tone === 'error' ? '!!' : tone === 'warn' ? '!' : 'i'}
      </span>
      <span className="tiny" style={{ flex: '1 1 auto' }}>
        {children}
      </span>
    </div>
  )
}

export function Panel({
  title,
  right,
  children,
  dark,
  id,
  testId,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  dark?: boolean
  id?: string
  testId?: string
}) {
  return (
    <section className={dark ? 'panel-dark' : 'panel'} id={id} data-testid={testId}>
      {title ? (
        <div className="panel-head">
          <h2 className="h2">{title}</h2>
          <span className="spacer" />
          {right}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div
      className="pbar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
    >
      <div className="pbar-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}

/** The little RF token sprite used next to RF amounts. */
export function RfChip({ label }: { label?: string }) {
  return (
    <span className="rf-sprite" aria-hidden="true">
      <span className="rf-chip" />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

export function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flow-arrow" aria-hidden="true">
      {label ? <span className="flow-arrow-label">{label}</span> : null}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-title">
      <h2 className="h2">{children}</h2>
      <span className="spacer" />
      {right}
    </div>
  )
}
