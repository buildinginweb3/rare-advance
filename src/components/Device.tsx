/**
 * THE RARE ADVANCE DEVICE
 * =======================
 *
 * An original pixel handheld financial companion for Rare Friends. It is NOT a
 * copy of any existing device: the shape, the LCD layout, the button cluster
 * and every sprite here are original to this project.
 *
 *   top LCD    -> the selected Friend, alive
 *   bottom LCD -> its reward stream
 *   buttons    -> ADVANCE / GROW / POOL
 */

import { FriendArt } from './FriendArt'
import { Badge, RfChip } from './ui'
import { formatRF, formatRFCompact, formatWeight, formatWeightCompact } from '../math/rf'
import type { AdvancePosition, FriendPosition, LiveDataState, SessionMode } from '../types'
import type { ViewId } from '../session/store'

function lights(active: boolean[]) {
  return (
    <div className="lights" aria-hidden="true">
      {active.map((on, i) => (
        <span key={i} className={on ? 'light lit' : 'light dim'} />
      ))}
    </div>
  )
}

export function Device({
  friend,
  view,
  mode,
  live,
  advance,
  onNavigate,
}: {
  friend: FriendPosition | null
  view: ViewId
  mode: SessionMode
  live: LiveDataState
  advance: AdvancePosition | null
  onNavigate: (v: ViewId) => void
}) {
  const streaming = friend?.rewards.streamingRfWei ?? null
  const claimable = friend?.rewards.claimableRfWei ?? null
  const settled = advance ? (advance.settledWei * 100n) / (advance.quote.settlementWei || 1n) : 0n

  return (
    <div className="device" data-testid="device">
      <div className="device-shell">
        <div className="device-screws">
          <span className="screw" />
          <span className="h3" style={{ color: 'var(--paper)', fontSize: 8 }}>
            RARE ADVANCE
          </span>
          <span className="screw" />
        </div>

        <div className="device-plate">
          {/* ---- top LCD: the Friend ---- */}
          <div className="lcd" style={{ background: 'var(--paper)' }}>
            <div className="lcd-label">
              <span>{friend ? `${friend.collection} #${friend.tokenId}` : 'NO FRIEND'}</span>
              <span>
                {friend?.activated ? 'ACTIVE' : friend ? 'INACTIVE' : '—'}
                {friend && friend.collection === 'Generations'
                  ? friend.temporary
                    ? ' · TEMPORARY'
                    : ` · G${friend.generation}`
                  : ''}
                {friend?.tier !== null && friend?.tier !== undefined ? ` · T${friend.tier}` : ''}
              </span>
            </div>
            {friend ? (
              <>
                <div style={{ display: 'grid', placeItems: 'center', padding: '4px 0' }}>
                  <div style={{ width: '100%', maxWidth: 128 }}>
                    <FriendArt friend={friend} size={128} />
                  </div>
                </div>
                <div className="lcd-value lcd-value-sm mono-num" style={{ textAlign: 'center' }}>
                  {formatWeight(friend.weightMicros, 2)}
                </div>
                <div className="tiny muted" style={{ textAlign: 'center' }}>
                  reward weight · {friend.weight === 'onchain' ? 'LIVE' : friend.weight === 'simulated' ? 'SIMULATED' : 'MODELED'}
                </div>
              </>
            ) : (
              <div className="friend-art-fallback" style={{ padding: '18px 8px' }}>
                <span className="tiny muted">Select a Friend, or enter Demo Mode.</span>
              </div>
            )}
          </div>

          {/* ---- bottom LCD: the reward stream ---- */}
          <div className="lcd">
            <div className="lcd-label">
              <span>REWARD STREAM</span>
              <span>
                <Badge provenance={friend?.rewards.streamingRf ?? 'simulated'} />
              </span>
            </div>
            <div className="lcd-value mono-num">
              {streaming === null ? '—' : formatRFCompact(streaming)}
              <span style={{ fontSize: '0.55em' }}> RF</span>
            </div>
            <div className="stream" style={{ marginTop: 6 }} aria-hidden="true">
              <div className="stream-pipe" />
              {friend?.activated ? (
                <>
                  <span className="stream-packet" style={{ animationDuration: '3.4s' }} />
                  <span className="stream-packet" style={{ animationDuration: '4.6s', animationDelay: '1.1s' }} />
                  <span className="stream-packet" style={{ animationDuration: '5.8s', animationDelay: '2.3s' }} />
                </>
              ) : null}
            </div>
            <div className="tiny muted" style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <span>
                <RfChip /> CLAIMABLE {claimable === null ? '—' : `${formatRFCompact(claimable)} RF`}
              </span>
              <span>
                TOTAL ACTIVE W{' '}
                {live.totalActiveWeightMicros === null
                  ? '—'
                  : formatWeightCompact(live.totalActiveWeightMicros)}
              </span>
            </div>
          </div>

          {/* ---- button cluster ---- */}
          <div className="device-buttons">
            <button
              type="button"
              className="dev-btn"
              aria-pressed={view === 'advance'}
              onClick={() => onNavigate('advance')}
              data-testid="dev-advance"
            >
              ADVANCE
            </button>
            <button
              type="button"
              className="dev-btn"
              aria-pressed={view === 'grow'}
              onClick={() => onNavigate('grow')}
              data-testid="dev-grow"
            >
              GROW
            </button>
            <button
              type="button"
              className="dev-btn"
              aria-pressed={view === 'liquidity'}
              onClick={() => onNavigate('liquidity')}
              data-testid="dev-pool"
            >
              POOL
            </button>
          </div>

          <div className="device-screws">
            {lights([
              mode === 'demo',
              Boolean(friend?.activated),
              Boolean(advance),
              live.status === 'ready',
            ])}
            <span className="h3" style={{ color: 'var(--gray-2)', fontSize: 7 }}>
              {advance
                ? `SETTLED ${formatRF(advance.settledWei, 1)} / ${formatRF(advance.quote.settlementWei, 1)}`
                : mode === 'demo'
                  ? 'DEMO'
                  : 'LIVE'}
            </span>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Number(settled) / 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
