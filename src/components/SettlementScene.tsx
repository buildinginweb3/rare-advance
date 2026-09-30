/**
 * SETTLEMENT SCENE
 * ================
 *
 * A short, tasteful pixel scene: the Friend, the reward stream, the advance
 * pool, then the three-way split. A tiny flame marks the modelled RF burn.
 * No confetti, no casino effects, bounded and short, and fully suppressed
 * under prefers-reduced-motion.
 */

import { useEffect, useState } from 'react'
import { FriendArt } from './FriendArt'
import { Badge, Note } from './ui'
import { formatRF } from '../math/rf'
import { ADVANCE_MARKET_TERMS } from '../economy/rareAdvanceConfig'
import { reconcileSettlement } from '../economy/advance'
import type { AdvancePosition, FriendPosition } from '../types'

export function SettlementScene({
  advance,
  friend,
  onDone,
}: {
  advance: AdvancePosition
  friend: FriendPosition | null
  onDone: () => void
}) {
  const [step, setStep] = useState(0)
  const { principalWei, lpSpreadWei, burnWei } = reconcileSettlement(advance.quote)

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(1), 500),
      window.setTimeout(() => setStep(2), 1300),
      window.setTimeout(() => setStep(3), 2100),
      window.setTimeout(onDone, 3400),
    ]
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [onDone])

  return (
    <div className="settle" data-testid="settlement-scene" role="status" aria-live="polite">
      <div className="lcd-label">
        <span>SETTLEMENT · SIMULATED</span>
        <Badge provenance="simulated" />
      </div>

      <div className="settle-stage">
        {/* the Friend */}
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 96 }}>
            {friend ? <FriendArt friend={friend} size={96} /> : null}
          </div>
          <span className="h3" style={{ fontSize: 8, marginTop: 4 }}>
            {friend ? `${friend.collection} #${friend.tokenId}` : 'FRIEND'}
          </span>
        </div>

        <div className="flow-arrow">
          <span className="flow-arrow-label">REWARD STREAM</span>
        </div>

        {/* the stream with packets */}
        <div className="stream" style={{ height: 34, opacity: step >= 1 ? 1 : 0.45 }}>
          <div className="stream-pipe" />
          {step >= 1 ? (
            <>
              <span className="stream-packet" style={{ animationDuration: '0.9s' }} />
              <span className="stream-packet" style={{ animationDuration: '0.9s', animationDelay: '0.3s' }} />
              <span className="stream-packet" style={{ animationDuration: '0.9s', animationDelay: '0.6s' }} />
            </>
          ) : null}
        </div>

        <div className="flow-arrow">
          <span className="flow-arrow-label">ADVANCE POOL</span>
        </div>

        <div className="panel-recess" style={{ width: '100%' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="h3" style={{ fontSize: 8 }}>
              YOU RECEIVED
            </span>
            <span className="lcd-value lcd-value-sm mono-num">{formatRF(principalWei, 2)} RF</span>
          </div>
        </div>

        {/* split */}
        <div className="settle-split" style={{ width: '100%', opacity: step >= 3 ? 1 : 0.3 }}>
          <div className="settle-block">
            <div className="h3" style={{ fontSize: 7 }}>
              PRINCIPAL
            </div>
            <div className="mono-num" style={{ fontWeight: 700 }}>
              {formatRF(principalWei, 2)} RF
            </div>
            <div className="tiny muted">returns to pool</div>
          </div>
          <div className="settle-block">
            <div className="h3" style={{ fontSize: 7 }}>
              LP SPREAD
            </div>
            <div className="mono-num" style={{ fontWeight: 700 }}>
              {formatRF(lpSpreadWei, 2)} RF
            </div>
            <div className="tiny muted">liquidity providers</div>
          </div>
          <div className="settle-block settle-block-burn">
            <div className="flame" aria-hidden="true" />
            <div className="h3" style={{ fontSize: 7 }}>
              RF BURN
            </div>
            <div className="mono-num" style={{ fontWeight: 700 }}>
              {formatRF(burnWei, 2)} RF
            </div>
            <div className="tiny muted">modelled burn</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <Note>
          {formatRF(principalWei, 2)} + {formatRF(lpSpreadWei, 2)} + {formatRF(burnWei, 2)} ={' '}
          {formatRF(advance.quote.settlementWei, 2)} RF settlement. Rounding never creates value.
        </Note>
      </div>
    </div>
  )
}

export function AdvanceTermsNote() {
  return (
    <Note>
      {ADVANCE_MARKET_TERMS.label}: the holder receives 95% of the selected stream, liquidity providers earn
      4% as it settles, and 1% is modelled as a Rare Advance RF burn. These are demo terms, not production
      pricing.
    </Note>
  )
}
