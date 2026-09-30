/**
 * PROTOCOL ACTION ENGINE
 * =====================
 *
 * Derives the set of Rare Friends actions that are VALID for a Friend's
 * current state, straight from the official Generations rules. An impossible
 * action is never returned, so the UI cannot offer one.
 *
 *   Temporary / unhardwired      -> HARDWIRE
 *   Permanent but inactive       -> REACTIVATE   (restarts at tier 0)
 *   Active Genesis               -> no action; fully weighted
 *   Active Generation N (2..6)   -> PROMOTE (resets tier to 0)
 *   Active Generation tier 0..3  -> UPGRADE  (sequential only)
 *
 *   Gen 1 cannot promote further; tier 4 cannot upgrade further;
 *   a Generation can never promote into Genesis; Genesis has no hardwire,
 *   promotion or upgrade path at all.
 */

import {
  GENERATION_SCHEDULE,
  PROMOTION_COSTS_EARLIER,
  ACTION_FEE_SPLIT,
  GENESIS,
  MAX_TIER,
  REACTIVATION_HARDFWIRE_SHARE_BPS,
} from './rareFriendsConfig'
import { parseRF, parseWeight, mulBps } from '../math/rf'
import type { FriendPosition, GrowthAction, ProtocolActionEffect } from '../types'

/**
 * RF cost of promoting `generation` one step earlier.
 * Gen 6 -> 5 is 9 RF, Gen 5 -> 4 is 90, Gen 4 -> 3 is 900, Gen 3 -> 2 is 9,000
 * and Gen 2 -> 1 is 90,000. Gen 1 has nowhere earlier to go.
 */
export function promotionCostFor(generation: number): string {
  if (generation < 2 || generation > GENERATION_SCHEDULE.length) {
    throw new Error(`promotionCostFor: generation ${generation} cannot promote earlier`)
  }
  // index 0 = 6->5 ... index 4 = 2->1
  const idx = GENERATION_SCHEDULE.length - generation
  const cost = PROMOTION_COSTS_EARLIER[idx]
  if (cost === undefined) throw new Error(`promotionCostFor: no cost for generation ${generation}`)
  return cost
}

export function scheduleFor(generation: number) {
  const s = GENERATION_SCHEDULE.find((g) => g.generation === generation)
  if (!s) throw new Error(`scheduleFor: unknown generation ${generation}`)
  return s
}

export const GENESIS_COST_WEI = parseRF(GENESIS.activationCost)
export const GENESIS_WEIGHT_MICROS = parseWeight(GENESIS.activeRewardWeight)

/** protocol 50/50 split of an action cost, in wei. */
export function actionFeeSplit(costWei: bigint): { burnWei: bigint; fundingWei: bigint } {
  const burn = mulBps(costWei, ACTION_FEE_SPLIT.burnShareBps)
  return { burnWei: burn, fundingWei: costWei - burn }
}

function effect(
  costWei: bigint,
  weightBeforeMicros: bigint,
  weightAfterMicros: bigint,
): ProtocolActionEffect {
  const { burnWei, fundingWei } = actionFeeSplit(costWei)
  return { costWei, protocolBurnWei: burnWei, protocolRewardFundingWei: fundingWei, weightBeforeMicros, weightAfterMicros }
}

/**
 * All valid actions for a Friend. Genesis activation is only offered when the
 * Genesis is inactive; an active Genesis reports no action at all.
 */
export function availableActions(friend: FriendPosition): GrowthAction[] {
  const actions: GrowthAction[] = []
  const key = friend.key

  if (friend.collection === 'Genesis') {
    if (!friend.activated) {
      actions.push({
        id: `${key}:activate`,
        kind: 'activate',
        friendKey: key,
        title: 'ACTIVATE',
        subject: `GENESIS · INACTIVE → ACTIVE · WEIGHT ${GENESIS.activeRewardWeight}`,
        costKnown: true,
        effect: effect(GENESIS_COST_WEI, 0n, GENESIS_WEIGHT_MICROS),
        consequences: [
          'Genesis has no hardwire, no promotion and no tier upgrades.',
          'A direct sale or transfer clears activation, so a new owner activates again.',
        ],
        valid: true,
      })
    }
    return actions
  }

  // ---- Generations --------------------------------------------------------
  const gen = friend.generation

  /*
   * A temporary Friend reports generation 0 onchain, so the generation range
   * check must come AFTER the temporary branch. Getting this order wrong makes
   * a temporary Friend look like it has no available action at all.
   */
  if (friend.temporary) {
    const declared = gen >= 1 && gen <= GENERATION_SCHEDULE.length
    // The docs are explicit: "your live wallet balance selects the highest
    // generation you can afford". For a temporary Friend read onchain there is
    // therefore NO single hardwire cost to quote, and Rare Advance must not
    // invent one. Demo Mode declares the generation explicitly, so the demo
    // figure is known.
    const costKnown = declared && friend.stateSource !== 'onchain'
    const declaredSchedule = declared ? scheduleFor(gen) : null
    const target = costKnown ? `GEN ${gen}` : 'GEN ?'
    actions.push({
      id: `${key}:hardwire`,
      kind: 'hardwire',
      friendKey: key,
      title: 'HARDWIRE',
      subject: `${target} · TEMPORARY → PERMANENT · TIER 0`,
      costKnown,
      effect: effect(
        costKnown ? parseRF(declaredSchedule!.hardwire) : 0n,
        0n,
        costKnown ? parseWeight(declaredSchedule!.baseWeight) : 0n,
      ),
      consequences: [
        'Hardwiring makes a temporary Friend permanent and active at tier 0.',
        'Holding at least 1 RF creates a temporary Friend that earns nothing and cannot transfer.',
        'A temporary Friend has no fixed generation onchain: your live RF balance selects the highest generation you can afford, so the exact cost is only known at the moment of the transaction.',
      ],
      valid: true,
    })
    return actions
  }

  if (gen < 1 || gen > GENERATION_SCHEDULE.length) return actions
  const s = scheduleFor(gen)
  const currentTier = friend.activated ? (friend.tier ?? 0) : null

  // Permanent but inactive (e.g. after a direct transfer): REACTIVATE.
  if (!friend.activated) {
    actions.push({
      id: `${key}:reactivate`,
      kind: 'reactivate',
      friendKey: key,
      title: 'REACTIVATE',
      subject: `GEN ${gen} · INACTIVE → ACTIVE · TIER 0`,
      costKnown: true,
      effect: effect(parseRF(s.reactivate), 0n, parseWeight(s.baseWeight)),
      consequences: [
        'Reactivation restarts at tier 0.',
        'Previous upgrade payments are not refunded and are not credited.',
        'Already-earned rewards remain claimable and follow the NFT.',
      ],
      valid: true,
    })
    return actions
  }

  // Active Friend.
  const tier = currentTier ?? 0

  // PROMOTE: one generation earlier, resets tier to 0. Gen 1 is the ceiling.
  if (gen > 1) {
    const cost = parseRF(promotionCostFor(gen))
    const target = scheduleFor(gen - 1)
    actions.push({
      id: `${key}:promote`,
      kind: 'promote',
      friendKey: key,
      title: 'PROMOTE',
      subject: `GEN ${gen} → GEN ${gen - 1} · TIER ${tier} → TIER 0`,
      costKnown: true,
      effect: effect(cost, friend.weightMicros, parseWeight(target.baseWeight)),
      consequences: [
        'A promotion moves the Friend one generation earlier.',
        'Promotion RESETS TIER TO 0 and clears existing upgrades.',
        'A Generation can never promote into Genesis.',
      ],
      valid: true,
    })
  }

  // UPGRADE: sequential only, tier 0..3 -> 1..4.
  if (tier < MAX_TIER) {
    const cost = parseRF(s.upgrades[tier])
    const before = parseWeight(s.tierWeights[tier])
    const after = parseWeight(s.tierWeights[tier + 1])
    actions.push({
      id: `${key}:upgrade`,
      kind: 'upgrade',
      friendKey: key,
      title: 'UPGRADE',
      subject: `GEN ${gen} · TIER ${tier} → TIER ${tier + 1}`,
      costKnown: true,
      effect: effect(cost, before, after),
      consequences: [
        'Upgrades are sequential: each tier must be bought in order.',
        'Every payment splits 50% RF burned and 50% RF reward funding.',
        'A direct transfer clears activation and upgrades.',
      ],
      valid: true,
    })
  }

  return actions
}

/** True when a Genesis is already at its fixed, un-improvable weight. */
export function genesisFullyWeighted(friend: FriendPosition): boolean {
  return friend.collection === 'Genesis' && friend.activated
}

/** "WHAT COULD I BECOME?" - the legitimate next states for a Generation. */
export interface PlannerOption {
  title: string
  subject: string
  costWei: bigint
  weightBeforeMicros: bigint
  weightAfterMicros: bigint
  nextTier: number | null
  nextGeneration: number | null
  note: string
}

export function plannerOptions(friend: FriendPosition): PlannerOption[] {
  // A temporary Friend has no determinable target generation, so there is
  // nothing legitimate to preview.
  if (friend.collection !== 'Generations' || friend.temporary) return []
  const gen = friend.generation
  if (gen < 1 || gen > GENERATION_SCHEDULE.length) return []
  const s = scheduleFor(gen)
  const out: PlannerOption[] = []
  const tier = friend.activated ? (friend.tier ?? 0) : 0
  const before = friend.activated ? friend.weightMicros : parseWeight(s.tierWeights[tier])

  if (tier < MAX_TIER) {
    out.push({
      title: `UPGRADE TO TIER ${tier + 1}`,
      subject: `GEN ${gen} · TIER ${tier} → TIER ${tier + 1}`,
      costWei: parseRF(s.upgrades[tier]),
      weightBeforeMicros: before,
      weightAfterMicros: parseWeight(s.tierWeights[tier + 1]),
      nextTier: tier + 1,
      nextGeneration: null,
      note: 'Weight is allocation weight, not a guaranteed return.',
    })
  }

  if (gen > 1) {
    const target = scheduleFor(gen - 1)
    out.push({
      title: `PROMOTE TO GEN ${gen - 1}`,
      subject: `GEN ${gen} → GEN ${gen - 1} · TIER RESETS TO 0`,
      costWei: parseRF(promotionCostFor(gen)),
      weightBeforeMicros: before,
      weightAfterMicros: parseWeight(target.baseWeight),
      nextTier: 0,
      nextGeneration: gen - 1,
      note: 'Promotion resets tier to 0, so plan the upgrade path again.',
    })
  }

  return out
}

/**
 * Reactivation is documented as 10% of that generation's hardwire price.
 * Checked against the table so the two can never drift apart.
 */
export function expectedReactivationCostWei(generation: number): bigint {
  const s = scheduleFor(generation)
  return mulBps(parseRF(s.hardwire), REACTIVATION_HARDFWIRE_SHARE_BPS)
}
