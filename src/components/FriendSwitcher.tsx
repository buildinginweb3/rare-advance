/**
 * FRIEND SWITCHER
 * ================
 *
 * Choosing which Rare Friend you are acting for. Shared by every screen that
 * acts on a Friend, so Grow can switch Friends exactly like HOME can.
 */

import { useDispatch, useSession } from '../session/store'
import { FriendArt } from './FriendArt'
import { Notice } from './ui'

export function FriendSwitcher({ onClose }: { onClose: () => void }) {
  const state = useSession()
  const dispatch = useDispatch()

  return (
    <div
      className="drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a Rare Friend"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="drawer" data-testid="friend-switcher">
        <div className="drawer-head">
          <h2 className="h3" style={{ fontSize: 10 }}>
            MY FRIENDS
          </h2>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-testid="close-switcher">
            CLOSE
          </button>
        </div>
        <div className="stack">
          {state.friends.length === 0 ? (
            <Notice tone="info">No Rare Friends loaded.</Notice>
          ) : (
            state.friends.map((f) => (
              <button
                key={f.key}
                type="button"
                className="fcard"
                aria-pressed={f.key === state.selectedFriendKey}
                style={{ alignItems: 'center' }}
                onClick={() => {
                  dispatch({ type: 'select-friend', key: f.key })
                  onClose()
                }}
                data-testid={`switcher-${f.key}`}
              >
                <span className="fcard-art" style={{ width: 52, aspectRatio: '1' }}>
                  <FriendArt friend={f} size={52} animated={false} />
                </span>
                <span className="fcard-body">
                  <span className="fcard-name" style={{ fontSize: 8 }}>
                    {f.collection} #{f.tokenId}
                  </span>
                  <span className="row-tight">
                    <span className={f.activated ? 'tag tag-on' : 'tag'}>
                      {f.activated ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    {f.collection === 'Genesis' ? (
                      <span className="tag">GENESIS</span>
                    ) : f.temporary ? (
                      <span className="tag">TEMPORARY</span>
                    ) : (
                      <>
                        <span className="tag">GEN {f.generation}</span>
                        <span className="tag">TIER {f.tier ?? '—'}</span>
                      </>
                    )}
                  </span>
                  {actionsLabel(f.activated, f.collection, f.generation, f.temporary) ? (
                    <span className="tiny muted" style={{ display: 'block', marginTop: 3 }}>
                      {actionsLabel(f.activated, f.collection, f.generation, f.temporary)}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function actionsLabel(
  activated: boolean,
  collection: string,
  generation: number,
  temporary: boolean,
): string | null {
  if (temporary) return 'Can hardwire'
  if (collection === 'Genesis') return activated ? 'Fully weighted' : 'Can activate'
  if (!activated) return 'Can reactivate'
  const bits: string[] = []
  if (generation > 1) bits.push('Can promote')
  bits.push('Can upgrade')
  return bits.join(' · ')
}
