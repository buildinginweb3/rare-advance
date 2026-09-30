/**
 * SIMULATED MARKET STORE
 * ======================
 *
 * React state for the communal liquidity market. Everything here is SIMULATED
 * and local: no network, no contracts, no real RF or WETH.
 *
 * Persistence: user-created pools and contributions survive a reload via
 * localStorage. They are labelled "YOUR SIMULATED POOL" and are NOT shared with
 * anyone — a pool created here is a local simulation, not a global listing.
 */

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { PoolError, accrue, contribute, createPool, openGrowthPosition, openStreamPosition, repay, withdraw } from '../economy/pools/engine'
import { buildSeedMarket, LOCAL_LP_ID } from '../economy/pools/seed'
import type { GrowthPosition, Pool, PoolAccess, PoolKind, PoolTerms, Position } from '../economy/pools/types'
import { streamOffers, growthOffers, marketSummary, visiblePools, type GrowthRequest, type StreamRequest, type GrowthOffer, type StreamOffer } from '../economy/pools/market'
import { DEMO_EPOCH_MS } from './demoData'

const STORAGE_KEY = 'rare-advance:simulated-market:v1'
const YOU_NAME = 'You'

/** The single source of truth for user pool ids, shared with the creation wizard. */
export function nextUserPoolId(seq: number): string {
  return `pool-you-${seq}`
}

export interface MarketState {
  pools: Pool[]
  /** Pools this browser created. Not shared. */
  userPoolIds: string[]
  seq: number
  nowMs: number
  lastError: { id: string; message: string; hint: string } | null
  lastRepay?: RepayReceipt
}

export type MarketAction =
  | { type: 'reset' }
  | { type: 'set-error'; error: { id: string; message: string; hint: string } | null }
  | { type: 'advance-time'; deltaMs: bigint }
  | {
      type: 'create-pool'
      name: string
      kind: PoolKind
      capitalWei: bigint
      terms: PoolTerms
      access: PoolAccess
    }
  | { type: 'contribute'; poolId: string; amountWei: bigint }
  | { type: 'withdraw'; poolId: string; amountWei: bigint }
  | {
      type: 'open-stream'
      poolId: string
      positionId: string
      friendKey: string
      faceValueWei: bigint
      termMs: bigint
    }
  | {
      type: 'open-growth'
      poolId: string
      positionId: string
      friendKey: string
      actionId: string
      actionKind: GrowthPosition['actionKind']
      actionCostWei: bigint
      generation: number
      ownerContributionWei: bigint
      protocolBurnWei: bigint
      protocolRewardFundingWei: bigint
      rfRepaymentPerDayWei: bigint
      wethPerDayWei: bigint
    }
  | { type: 'repay'; positionId: string; amountWei: bigint }

function seedState(): MarketState {
  return {
    pools: buildSeedMarket(DEMO_EPOCH_MS),
    userPoolIds: [],
    seq: 1,
    nowMs: DEMO_EPOCH_MS,
    lastError: null,
  }
}

/** Patch one pool by id, or return the state untouched. */
function withPool(state: MarketState, poolId: string, fn: (p: Pool) => Pool): MarketState {
  let changed = false
  const pools = state.pools.map((p) => {
    if (p.id !== poolId) return p
    changed = true
    return fn(p)
  })
  return changed ? { ...state, pools } : state
}

function guard(state: MarketState, fn: () => MarketState): MarketState {
  try {
    return { ...fn(), lastError: null }
  } catch (err) {
    const pe = err as PoolError
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    return {
      ...state,
      lastError: {
        id: `me-${state.seq}`,
        message: message.replace(/^[A-Z ]+LOCKED\.\s*/i, ''),
        hint: pe?.code === 'terms-locked' ? 'Clone the pool to change its terms.' : 'Adjust the amount or pick another pool.',
      },
    }
  }
}

export function marketReducer(state: MarketState, action: MarketAction): MarketState {
  switch (action.type) {
    case 'reset':
      return seedState()

    case 'set-error':
      return { ...state, lastError: action.error }

    case 'advance-time': {
      let pools = state.pools
      for (const p of state.pools) {
        if (p.positions.length === 0) continue
        pools = pools.map((x) => (x.id === p.id ? accrue(x, action.deltaMs).pool : x))
      }
      return { ...state, pools, nowMs: state.nowMs + Number(action.deltaMs) }
    }

    case 'create-pool': {
      const id = nextUserPoolId(state.seq)
      const pool = createPool({
        id,
        name: action.name.trim() || 'My Simulated Pool',
        kind: action.kind,
        creatorLpId: LOCAL_LP_ID,
        creatorName: YOU_NAME,
        capitalWei: action.capitalWei,
        terms: action.terms,
        access: action.access,
        nowMs: state.nowMs,
        seeded: false,
      })
      return {
        ...state,
        pools: [pool, ...state.pools],
        userPoolIds: [...state.userPoolIds, id],
        seq: state.seq + 1,
        lastError: null,
      }
    }

    case 'contribute':
      return guard(state, () =>
        withPool(state, action.poolId, (p) => contribute(p, LOCAL_LP_ID, YOU_NAME, action.amountWei)),
      )

    case 'withdraw':
      return guard(state, () => withPool(state, action.poolId, (p) => withdraw(p, LOCAL_LP_ID, action.amountWei)))

    case 'open-stream':
      return guard(state, () =>
        withPool(state, action.poolId, (p) =>
          openStreamPosition(p, {
            id: action.positionId,
            friendKey: action.friendKey,
            borrowerLpId: LOCAL_LP_ID,
            faceValueWei: action.faceValueWei,
            termMs: action.termMs,
            nowMs: state.nowMs,
          }),
        ),
      )

    case 'open-growth':
      return guard(state, () =>
        withPool(state, action.poolId, (p) =>
          openGrowthPosition(p, {
            id: action.positionId,
            friendKey: action.friendKey,
            borrowerLpId: LOCAL_LP_ID,
            actionId: action.actionId,
            actionKind: action.actionKind,
            actionCostWei: action.actionCostWei,
            generation: action.generation,
            ownerContributionWei: action.ownerContributionWei,
            protocolBurnWei: action.protocolBurnWei,
            protocolRewardFundingWei: action.protocolRewardFundingWei,
            rfRepaymentPerDayWei: action.rfRepaymentPerDayWei,
            wethPerDayWei: action.wethPerDayWei,
            nowMs: state.nowMs,
          }),
        ),
      )

    case 'repay': {
      let pools = state.pools
      let applied = 0n
      let settled = false
      let quote = 0n
      for (const p of state.pools) {
        const pos = p.positions.find((x) => x.id === action.positionId)
        if (!pos) continue
        const result = repay(p, action.positionId, action.amountWei)
        pools = pools.map((x) => (x.id === p.id ? result.pool : x))
        applied = result.appliedWei
        settled = result.settled
        quote = result.payoffQuoteWei
        break
      }
      const withRepay = { ...state, pools, lastError: null, lastRepay: { appliedWei: applied, settled, payoffQuoteWei: quote } }
      return withRepay
    }

    default:
      return state
  }
}

export interface RepayReceipt {
  appliedWei: bigint
  settled: boolean
  payoffQuoteWei: bigint
}

/** Result of the most recent manual repayment, for the settlement animation. */
export function getLastRepay(state: MarketState): RepayReceipt | null {
  return state.lastRepay ?? null
}

export function clearLastRepay(state: MarketState): MarketState {
  const s: MarketState = { ...state }
  delete s.lastRepay
  return s
}

// ---------------------------------------------------------------------------
// Persistence — local, clearly labelled, never shared
// ---------------------------------------------------------------------------

interface PersistedMarket {
  version: 1
  pools: Pool[]
  userPoolIds: string[]
  seq: number
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? { __bigint: v.toString() } : v
}
function bigintReviver(_k: string, v: unknown) {
  if (v && typeof v === 'object' && '__bigint' in (v as Record<string, unknown>)) {
    return BigInt((v as Record<string, string>).__bigint as string)
  }
  return v
}

export function saveMarket(state: MarketState): void {
  try {
    if (typeof localStorage === 'undefined') return
    const payload: PersistedMarket = {
      version: 1,
      pools: state.pools.filter((p) => !p.seeded),
      userPoolIds: state.userPoolIds,
      seq: state.seq,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload, bigintReplacer))
  } catch {
    // Storage may be unavailable or full. The demo still works in memory.
  }
}

export function loadMarket(): Partial<MarketState> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw, bigintReviver) as PersistedMarket
    if (parsed?.version !== 1 || !Array.isArray(parsed.pools)) return null
    return { pools: parsed.pools, userPoolIds: parsed.userPoolIds ?? [], seq: parsed.seq ?? 100 }
  } catch {
    return null
  }
}

export function clearStoredMarket(): void {
  try {
    localStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const StateCtx = createContext<MarketState | null>(null)
const DispatchCtx = createContext<React.Dispatch<MarketAction> | null>(null)

export function MarketProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(marketReducer, undefined, () => {
    const base = seedState()
    const saved = loadMarket()
    if (!saved) return base
    // Seeded pools always come first and stay authoritative; only this browser's
    // own pools are restored, appended after them.
    const restored = (saved.pools ?? []).filter((p) => !p.seeded && p.id.startsWith('pool-you-'))
    return {
      ...base,
      pools: [...restored, ...base.pools],
      userPoolIds: restored.map((p) => p.id),
      seq: Math.max(base.seq, saved.seq ?? 1),
      lastError: null,
    }
  })

  // Persist only the pools this browser created, so seeded demo data stays
  // authoritative and a stale save can never shadow a protocol change.
  useEffect(() => {
    saveMarket(state)
  }, [state.pools, state.userPoolIds, state.seq])

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  )
}

export function useMarket(): MarketState {
  const s = useContext(StateCtx)
  if (!s) throw new Error('useMarket must be used inside MarketProvider')
  return s
}

export function useMarketDispatch(): React.Dispatch<MarketAction> {
  const d = useContext(DispatchCtx)
  if (!d) throw new Error('useMarketDispatch must be used inside MarketProvider')
  return d
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function useOffersForStream(req: StreamRequest | null): StreamOffer[] {
  const { pools } = useMarket()
  return useMemo(() => (req ? streamOffers(visiblePools(pools, req.borrowerLpId, req.inviteCode), req) : []), [pools, req])
}

export function useOffersForGrowth(req: GrowthRequest | null): GrowthOffer[] {
  const { pools } = useMarket()
  return useMemo(() => (req ? growthOffers(visiblePools(pools, req.borrowerLpId, req.inviteCode), req) : []), [pools, req])
}

export function useMarketSummary() {
  const { pools } = useMarket()
  return useMemo(() => marketSummary(pools), [pools])
}

/** All positions this browser has borrowed, across every pool. */
export function useMyPositions(): { pool: Pool; position: Position }[] {
  const { pools } = useMarket()
  return useMemo(() => {
    const out: { pool: Pool; position: Position }[] = []
    for (const pool of pools) {
      for (const position of pool.positions) {
        if (position.borrowerLpId === LOCAL_LP_ID) out.push({ pool, position })
      }
    }
    return out
  }, [pools])
}

export { LOCAL_LP_ID }
