/**
 * SESSION STORE
 * =============
 *
 * One reducer owns Demo Mode, Live Mode, the selected Friend, every simulated
 * advance, every simulated growth financing and the simulated pool.
 *
 * SAFETY: the store has no wallet client, no signer and no contract-write path.
 * Everything financial in here is a local state transition.
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import { DEMO_POOL_SEED_WEI, buildDemoFriends, buildDemoLiveState, demoStreamRemainingMs, DEMO_EPOCH_MS } from './demoData'
import { buildPool, addDeposit, EMPTY_POOL, type PoolSeed } from '../economy/pool'
import { quoteAdvance, reconcileSettlement, settledAt, isSettled } from '../economy/advance'
import { quoteGrowthFinance, routeFutureRewards, breakdownFinance } from '../economy/growth'
import { SIM_TIME_STEP_MS } from '../economy/rareAdvanceConfig'
import { BPS_SCALE, mulBps } from '../math/rf'
import type {
  AdvancePosition,
  FriendPosition,
  GrowthAction,
  GrowthFinancePosition,
  GrowthFinanceQuote,
  LiquidityPool,
  LiveDataState,
  SessionMode,
  SessionInsight,
  WalletState,
} from '../types'

export type ViewId = 'landing' | 'dashboard' | 'advance' | 'grow' | 'liquidity' | 'how'

export interface Notice {
  id: string
  tone: 'info' | 'warn' | 'error'
  text: string
}

export interface SessionState {
  mode: SessionMode
  /**
   * False only for the very first paint. The landing sells the idea in one
   * screen; TRY DEMO or CONNECT WALLET clears it and the holder dashboard takes
   * over. It is never shown again in the session.
   */
  landed: boolean
  view: ViewId
  selectedFriendKey: string | null
  friends: FriendPosition[]
  live: LiveDataState
  wallet: WalletState
  advances: AdvancePosition[]
  finances: GrowthFinancePosition[]
  pool: LiquidityPool
  /** simulated time offset in ms, advanced only by SIMULATE TIME */
  simOffsetMs: bigint
  notice: Notice | null
  settlementSceneFor: string | null
  seq: number
}

function demoState(): SessionState {
  const live = buildDemoLiveState(DEMO_EPOCH_MS)
  const friends = buildDemoFriends(DEMO_EPOCH_MS)
  return {
    mode: 'demo',
    landed: false,
    view: 'landing',
    selectedFriendKey: friends[0]?.key ?? null,
    friends,
    live,
    // Demo Mode never presents a connected wallet. The real wallet lives in the
    // wallet provider; in Demo Mode it is explicitly not connected.
    wallet: { status: 'idle', address: null, chainId: null, error: null, hint: null },
    advances: [],
    finances: [],
    pool: buildPool(DEMO_POOL_SEED_WEI as PoolSeed),
    simOffsetMs: 0n,
    notice: null,
    settlementSceneFor: null,
    seq: 1,
  }
}

export type SessionAction =
  | { type: 'enter-demo' }
  | { type: 'land' }
  | { type: 'enter-live' }
  | { type: 'set-view'; view: ViewId }
  | { type: 'select-friend'; key: string }
  | { type: 'set-friends'; friends: FriendPosition[] }
  | { type: 'set-live'; live: LiveDataState }
  | { type: 'set-live-error'; error: string }
  | { type: 'take-advance'; friendKey: string; faceValueWei: bigint; durationMs: bigint }
  | { type: 'open-scene'; id: string | null }
  | { type: 'take-finance'; friendKey: string; action: GrowthAction; contributionWei: bigint }
  | { type: 'add-liquidity'; amountWei: bigint }
  | { type: 'simulate-time' }
  | { type: 'set-notice'; notice: Notice | null }
  | { type: 'reset-session' }

/** The clock used everywhere. Demo time is deterministic and only moves on demand. */
export function sessionNowMs(state: SessionState): number {
  return state.mode === 'demo' ? DEMO_EPOCH_MS + Number(state.simOffsetMs) : Date.now()
}

function withInsight(state: SessionState, advances: AdvancePosition[], finances: GrowthFinancePosition[]): SessionState {
  return { ...state, advances, finances }
}

export function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'enter-demo':
      return { ...demoState(), landed: true, view: 'dashboard' }

    case 'land':
      return { ...state, landed: true, view: 'dashboard' }

    case 'enter-live':
      return {
        ...state,
        mode: 'live',
        landed: true,
        simOffsetMs: 0n,
        friends: [],
        advances: [],
        finances: [],
        settlementSceneFor: null,
        view: 'dashboard',
        notice: {
          id: 'live',
          tone: 'info',
          text: 'Live mode: read-only onchain and OpenSea data. Rare Advance financing remains simulated.',
        },
      }

    case 'set-view':
      return { ...state, view: action.view }

    case 'select-friend':
      return { ...state, selectedFriendKey: action.key, settlementSceneFor: null }

    case 'set-friends': {
      // Prefer keeping the current selection; otherwise select the first Friend
      // that is actually earning, so the reward path is immediately visible.
      const unchanged =
        state.friends.length === action.friends.length &&
        state.friends.every((f, i) => f.key === action.friends[i]!.key)
      const keepCurrent =
        state.selectedFriendKey !== null &&
        action.friends.some((f) => f.key === state.selectedFriendKey)
      const earning =
        action.friends.find((f) => f.activated && (f.rewards.streamingRfWei ?? 0n) > 0n) ??
        action.friends.find((f) => f.activated) ??
        action.friends[0]
      if (unchanged && keepCurrent) return state
      return {
        ...state,
        friends: action.friends,
        selectedFriendKey: keepCurrent ? state.selectedFriendKey : (earning?.key ?? null),
      }
    }

    case 'set-live':
      // Returning the SAME object when nothing changed keeps the sync effect in
      // App from re-running itself forever.
      if (state.live === action.live) return state
      return { ...state, live: action.live }

    case 'set-live-error':
      if (state.live.status === 'error' && state.live.error === action.error) return state
      return { ...state, live: { ...state.live, status: 'error', error: action.error } }

    case 'take-advance': {
      const friend = state.friends.find((f) => f.key === action.friendKey)
      if (!friend) return state
      const quote = quoteAdvance(action.faceValueWei, BPS_SCALE, action.durationMs)
      if (quote.settlementWei === 0n) {
        return { ...state, notice: { id: 'ra', tone: 'warn', text: 'Nothing to advance on this Friend.' } }
      }
      const position: AdvancePosition = {
        id: `adv-${state.seq}`,
        friendKey: action.friendKey,
        quote,
        createdAtMs: sessionNowMs(state),
        elapsedMs: 0n,
        settledWei: 0n,
        lpEarnedWei: 0n,
        burnWei: 0n,
        stage: 'active',
        simulated: true,
      }
      const { principalWei } = reconcileSettlement(quote)
      void principalWei
      return {
        ...state,
        seq: state.seq + 1,
        advances: [position, ...state.advances],
        settlementSceneFor: position.id,
        view: 'advance',
        notice: null,
      }
    }

    case 'open-scene':
      return { ...state, settlementSceneFor: action.id }

    case 'take-finance': {
      const live = state.live
      const quote: GrowthFinanceQuote = quoteGrowthFinance({
        action: action.action,
        userContributionWei: action.contributionWei,
        totalActiveWeightMicros: live.totalActiveWeightMicros,
        rfStreamRateWeiPerSec: live.rfStream.rateWeiPerSec,
        totalActiveWeightProvenance: live.totalActiveWeightProvenance as 'onchain' | 'simulated',
      })
      const position: GrowthFinancePosition = {
        id: `fin-${state.seq}`,
        friendKey: action.friendKey,
        quote,
        createdAtMs: sessionNowMs(state),
        elapsedMs: 0n,
        repaidWei: 0n,
        ownerReceivedWei: 0n,
        lpReceivedWei: 0n,
        burnWei: 0n,
        settled: false,
        simulated: true,
      }
      const poolSeed: PoolSeed = {
        totalLiquidityWei: state.pool.totalLiquidityWei + quote.financedWei,
        advancesOutstandingWei: state.pool.advancesOutstandingWei + quote.financedWei,
        lpSpreadEarnedWei: state.pool.lpSpreadEarnedWei + quote.premiumToLiquidityProvidersWei,
        rareAdvanceBurnedWei: state.pool.rareAdvanceBurnedWei + quote.premiumToRareAdvanceBurnWei,
        advancesIssuedWei: state.pool.advancesIssuedWei,
        rfFinancedIntoActionsWei: state.pool.rfFinancedIntoActionsWei + quote.financedWei,
        userDepositWei: state.pool.userDepositWei,
      }
      return {
        ...state,
        seq: state.seq + 1,
        finances: [position, ...state.finances],
        pool: buildPool(poolSeed),
        notice: {
          id: 'fin',
          tone: 'info',
          text: `SIMULATED financing model recorded for ${action.action.title}. No RF was spent and no action was taken.`,
        },
      }
    }

    case 'add-liquidity': {
      if (action.amountWei <= 0n) return state
      return { ...state, pool: addDeposit(state.pool, action.amountWei) }
    }

    case 'simulate-time': {
      const offset = state.simOffsetMs + BigInt(SIM_TIME_STEP_MS)
      const advances = state.advances.map((a) => {
        const elapsed = BigInt(sessionNowMs({ ...state, simOffsetMs: offset }) - a.createdAtMs)
        const settled = settledAt(a.quote, elapsed)
        const delta = settled - a.settledWei
        if (delta <= 0n) return { ...a, elapsedMs: elapsed }
        const { lpSpreadWei, burnWei, principalWei } = reconcileSettlement(a.quote)
        // Pro-rate each destination by the fraction of the face now settled.
        const scale = settled / a.quote.settlementWei
        void principalWei
        return {
          ...a,
          elapsedMs: elapsed,
          settledWei: settled,
          lpEarnedWei: mulBps(lpSpreadWei, scale * BPS_SCALE),
          burnWei: mulBps(burnWei, scale * BPS_SCALE),
          stage: isSettled(a.quote, elapsed) ? ('settled' as const) : ('active' as const),
        }
      })
      return withInsight({ ...state, simOffsetMs: offset }, advances, state.finances)
    }

    case 'set-notice':
      return { ...state, notice: action.notice }

    case 'reset-session':
      if (state.mode === 'demo') return demoState()
      return { ...state, advances: [], finances: [], pool: EMPTY_POOL, simOffsetMs: 0n, settlementSceneFor: null }

    default:
      return state
  }
}

/** Route simulated time through the growth financing positions too. */
export function advanceGrowthFinances(
  state: SessionState,
  fromOffset: bigint,
  toOffset: bigint,
): GrowthFinancePosition[] {
  if (toOffset <= fromOffset) return state.finances
  return state.finances.map((f) => {
    const elapsed = BigInt(sessionNowMs({ ...state, simOffsetMs: toOffset }) - f.createdAtMs)
    const deltaMs = elapsed - f.elapsedMs
    if (deltaMs <= 0n) return f
    const dailyWei = f.quote.payback?.repaymentRfPerDayWei ?? null
    if (dailyWei === null) return { ...f, elapsedMs: elapsed }
    const days = deltaMs / 86_400_000n
    const earned = (dailyWei / GROWTH_REPAY_SHARE_BPS) * days
    if (earned <= 0n) return { ...f, elapsedMs: elapsed }
    const routed = routeFutureRewards(f.quote, earned, f.repaidWei)
    return {
      ...f,
      elapsedMs: elapsed,
      repaidWei: f.repaidWei + routed.repaymentWei,
      ownerReceivedWei: f.ownerReceivedWei + routed.ownerWei,
      lpReceivedWei: f.lpReceivedWei + f.quote.premiumToLiquidityProvidersWei,
      burnWei: f.burnWei + f.quote.premiumToRareAdvanceBurnWei,
      settled: routed.settled,
    }
  })
}

const GROWTH_REPAY_SHARE_BPS = BPS_SCALE - 7_500n

export function selectedFriend(state: SessionState): FriendPosition | null {
  return state.friends.find((f) => f.key === state.selectedFriendKey) ?? null
}

/**
 * The most recent advance for a Friend, settled or not. A settled advance keeps
 * its card on screen so the completed settlement stays inspectable.
 */
export function advanceFor(state: SessionState, friendKey: string | null): AdvancePosition | null {
  if (!friendKey) return null
  return state.advances.find((a) => a.friendKey === friendKey) ?? null
}

export function financeFor(state: SessionState, friendKey: string | null): GrowthFinancePosition | null {
  if (!friendKey) return null
  return state.finances.find((f) => f.friendKey === friendKey) ?? null
}

/** Cumulative, session-scoped, explicitly simulated totals. */
export function sessionInsight(state: SessionState): SessionInsight {
  const issued = state.advances.reduce((acc, a) => acc + a.quote.faceValueWei, 0n)
  const lpSpread = state.advances.reduce((acc, a) => acc + a.quote.lpSpreadWei, 0n)
  const burn = state.advances.reduce((acc, a) => acc + a.quote.rareAdvanceBurnWei, 0n)
  const financed = state.finances.reduce((acc, f) => acc + f.quote.financedWei, 0n)
  const financedPremium = state.finances.reduce((acc, f) => acc + f.quote.premiumWei, 0n)
  const protocolBurn = state.finances.reduce((acc, f) => acc + f.quote.action.effect.protocolBurnWei, 0n)
  const rewardFunding = state.finances.reduce(
    (acc, f) => acc + f.quote.action.effect.protocolRewardFundingWei,
    0n,
  )
  const userDeposits = state.pool.userDepositWei
  void financedPremium
  return {
    advancesIssuedWei: issued,
    liquiditySuppliedWei: userDeposits,
    lpSpreadGeneratedWei: lpSpread,
    rareAdvanceBurnedWei: burn,
    rfFinancedIntoActionsWei: financed,
    underlyingProtocolBurnWei: protocolBurn,
    underlyingRewardFundingWei: rewardFunding,
  }
}

export function breakdownForTest(action: GrowthAction, contribution: bigint) {
  return breakdownFinance(action, contribution)
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const StateCtx = createContext<SessionState | null>(null)
const DispatchCtx = createContext<React.Dispatch<SessionAction> | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, demoState)
  const withGrowth = useMemo(() => {
    // growth financing is derived from the same simulated clock
    return state
  }, [state])
  return (
    <StateCtx.Provider value={withGrowth}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  )
}

export function useSession(): SessionState {
  const s = useContext(StateCtx)
  if (!s) throw new Error('useSession must be used inside SessionProvider')
  return s
}

export function useDispatch(): React.Dispatch<SessionAction> {
  const d = useContext(DispatchCtx)
  if (!d) throw new Error('useDispatch must be used inside SessionProvider')
  return d
}

export { demoStreamRemainingMs, DEMO_POOL_SEED_WEI }
