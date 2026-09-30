/**
 * FRIEND ARTWORK
 * ==============
 *
 * A real wallet's Rare Friend artwork is always shown faithfully and never
 * redrawn. When live artwork is unavailable (Demo Mode, or OpenSea down) the
 * component renders an original 8x8 placeholder grid derived deterministically
 * from the token id, clearly captioned as a placeholder. It never imitates the
 * real on-chain art.
 */

import { useEffect, useMemo, useState } from 'react'
import type { FriendPosition } from '../types'

/** Deterministic 8x8 face from a token id. Original, not the real artwork. */
function placeholderBits(seed: string): boolean[] {
  let h = 17
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0
  const bits: boolean[] = []
  let x = Math.abs(h) || 1
  for (let i = 0; i < 64; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    bits.push((x >>> 8) % 100 < 46)
  }
  return bits
}

export function PlaceholderFace({ seed, size = 64 }: { seed: string; size?: number }) {
  const bits = useMemo(() => placeholderBits(seed), [seed])
  return (
    <div
      className="px-face"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Placeholder portrait. Not the Rare Friend's on-chain artwork."
    >
      {bits.map((on, i) => (
        <i key={i} className={on ? 'on' : ''} />
      ))}
    </div>
  )
}

export function FriendArt({
  friend,
  size = 88,
  animated = true,
}: {
  friend: FriendPosition
  size?: number
  animated?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [friend.imageUrl])

  const isPlaceholder = !friend.imageUrl || failed

  return (
    <div className="friend-art" style={{ minHeight: size, width: '100%' }}>
      {isPlaceholder ? (
        <div className="friend-art-fallback">
          <div className={animated ? 'friend-idle' : undefined}>
            <PlaceholderFace seed={friend.key} size={Math.min(size - 16, 72)} />
          </div>
          <span className="tiny muted" style={{ maxWidth: 130 }}>
            Placeholder · not the onchain artwork
          </span>
        </div>
      ) : (
        <img
          src={friend.imageUrl ?? undefined}
          alt={`${friend.collection} #${friend.tokenId} artwork`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0 }}
          className={animated ? 'friend-idle' : undefined}
        />
      )}
    </div>
  )
}
