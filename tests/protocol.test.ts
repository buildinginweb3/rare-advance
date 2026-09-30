/**
 * PROTOCOL CONSTANT TESTS
 * =======================
 *
 * Every documented Rare Friends economic constant is asserted here, so a
 * change to the config that drifts from the official docs fails the build.
 *
 * Source of truth: rarefriends.com/docs (Genesis, Generations, Economy,
 * Contracts), re-verified 2026-09-29, plus onchain read-back.
 */

import { describe, expect, it } from 'vitest'
import {
  ACTION_FEE_SPLIT,
  CONTRACTS,
  GENERATION_SCHEDULE,
  GENESIS,
  MAX_TIER,
  PROMOTION_COSTS_EARLIER,
  PROMOTION_LADDER_SUM_6_TO_1,
  REWARD_STREAM_DURATION_SECONDS,
  RARE_FRIENDS_CHAIN_ID,
} from '../src/protocol/rareFriendsConfig'
import { parseRF, parseWeight, formatRF, formatWeight } from '../src/math/rf'
import {
  GENESIS_COST_WEI,
  GENESIS_WEIGHT_MICROS,
  actionFeeSplit,
  availableActions,
  expectedReactivationCostWei,
  plannerOptions,
  promotionCostFor,
  scheduleFor,
} from '../src/protocol/actions'
import type { FriendPosition } from '../src/types'

function makeFriend(partial: Partial<FriendPosition> & { collection: FriendPosition['collection'] }): FriendPosition {
  const tokenId = partial.tokenId ?? '1'
  return {
    key: partial.key ?? `${partial.collection}:${tokenId}`,
    collection: partial.collection,
    tokenId,
    generation: partial.generation ?? 0,
    tier: partial.tier ?? null,
    activated: partial.activated ?? false,
    temporary: partial.temporary ?? false,
    weightMicros: partial.weightMicros ?? 0n,
    weight: 'onchain',
    walletAddress: null,
    imageUrl: null,
    artSource: 'none',
    traits: [],
    canonicalUrl: null,
    name: `${partial.collection} #${tokenId}`,
    stateSource: partial.stateSource ?? 'onchain',
    rewards: {
      claimableRfWei: 0n,
      claimableRf: 'onchain',
      claimableKnown: true,
      streamingRfWei: 0n,
      streamingRf: 'modeled',
      streamRemainingRfWei: null,
      streamRateRfPerSec: null,
      streamFinishUnix: null,
      claimableWethWei: 0n,
      claimableWeth: 'onchain',
      streamingWethWei: 0n,
      streamingWeth: 'modeled',
      streamRemainingWethWei: null,
      streamFinishWethUnix: null,
    },
    error: null,
  }
}

describe('Rare Friends network + contracts', () => {
  it('is Robinhood Chain mainnet, chain id 4663', () => {
    expect(RARE_FRIENDS_CHAIN_ID).toBe(4663)
    expect(CONTRACTS.genesis.startsWith('0x')).toBe(true)
  })

  it('matches the documented contract table exactly', () => {
    expect(CONTRACTS.genesis).toBe('0x116EaA62241751E0c98dA43d458600c6C17cD361')
    expect(CONTRACTS.generations).toBe('0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D')
    expect(CONTRACTS.rareFriends).toBe('0x0779369854d3EcdEA927206718FFD7730C67B71f')
    expect(CONTRACTS.activationManager).toBe('0xD4A35e11318E3679168d409184B788bcF9F283Ac')
    expect(CONTRACTS.hook).toBe('0x7A65d0194e6Cc43971C31CE7D1471Da01D42A0cC')
    expect(CONTRACTS.market).toBe('0x99930E551b6f849bAabC4B491053eF28a700C4F2')
    expect(CONTRACTS.reserve).toBe('0xA850B2499c064900EfF341745807e1cB0d71a52b')
    expect(CONTRACTS.sharedArtworkRenderer).toBe('0x608161cC3671619B2D020Eed5fa0720b356874e5')
    expect(CONTRACTS.genesisMetadataAdapter).toBe('0x473d12Cd65F97Dd3Da20566cD120618F646C37E3')
    expect(CONTRACTS.generationsMetadataAdapter).toBe('0x3A243E7f46970275CaE8375b0032e53dF91a9110')
    expect(CONTRACTS.tokenBoundAccountImplementation).toBe('0xED038886c002B285EB0f74971e967B02F6af8ea5')
  })
})

describe('Genesis economics', () => {
  it('activation cost is 100,000 RF', () => {
    expect(GENESIS.activationCost).toBe('100000')
    expect(GENESIS_COST_WEI).toBe(100_000n * 10n ** 18n)
    expect(formatRF(GENESIS_COST_WEI)).toBe('100,000')
  })

  it('active reward weight is 2,000,000', () => {
    expect(GENESIS.activeRewardWeight).toBe('2000000')
    expect(GENESIS_WEIGHT_MICROS).toBe(2_000_000n * 1_000_000n)
    expect(formatWeight(GENESIS_WEIGHT_MICROS)).toBe('2,000,000')
  })

  it('the activation payment splits 50,000 burned / 50,000 reward funding', () => {
    const { burnWei, fundingWei } = actionFeeSplit(GENESIS_COST_WEI)
    expect(burnWei).toBe(parseRF('50000'))
    expect(fundingWei).toBe(parseRF('50000'))
  })

  it('Genesis cannot hardwire, promote or upgrade', () => {
    expect(GENESIS.canHardwire).toBe(false)
    expect(GENESIS.canPromote).toBe(false)
    expect(GENESIS.canUpgrade).toBe(false)
    expect(GENESIS.canReactivate).toBe(false)

    const inactive = makeFriend({ collection: 'Genesis' })
    const actions = availableActions(inactive)
    expect(actions).toHaveLength(1)
    expect(actions[0].kind).toBe('activate')

    const active = makeFriend({
      collection: 'Genesis',
      activated: true,
      tier: 0,
      weightMicros: GENESIS_WEIGHT_MICROS,
    })
    expect(availableActions(active)).toHaveLength(0)
  })
})

describe('Generation hardwire / base weight / reactivation table', () => {
  const expected: [number, string, string, string][] = [
    [1, '100000', '175000', '10000'],
    [2, '10000', '16000', '1000'],
    [3, '1000', '1450', '100'],
    [4, '100', '130', '10'],
    [5, '10', '12', '1'],
    [6, '1', '1.1', '0.1'],
  ]

  it.each(expected)(
    'Gen %i hardwire %s RF, base weight %s, reactivate %s RF',
    (gen, hardwire, baseWeight, reactivate) => {
      const s = scheduleFor(gen)
      expect(s.hardwire).toBe(hardwire)
      expect(s.baseWeight).toBe(baseWeight)
      expect(s.reactivate).toBe(reactivate)
      expect(parseRF(s.hardwire)).toBe(parseRF(hardwire))
      expect(parseWeight(s.baseWeight)).toBe(parseWeight(baseWeight))
    },
  )

  it('reactivation is exactly 10% of the hardwire price', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      expect(parseRF(scheduleFor(gen).reactivate)).toBe(expectedReactivationCostWei(gen))
    }
  })

  it('reactivation starts at tier 0 and carries no tier', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      const friend = makeFriend({ collection: 'Generations', generation: gen, activated: false })
      const actions = availableActions(friend)
      expect(actions).toHaveLength(1)
      expect(actions[0].kind).toBe('reactivate')
      expect(actions[0].subject).toContain('TIER 0')
      expect(actions[0].effect.weightAfterMicros).toBe(parseWeight(scheduleFor(gen).baseWeight))
    }
  })
})

describe('Generation upgrade costs', () => {
  const expected: Record<number, string[]> = {
    1: ['50000', '75000', '112500', '168750'],
    2: ['5000', '7500', '11250', '16875'],
    3: ['500', '750', '1125', '1687.5'],
    4: ['50', '75', '112.5', '168.75'],
    5: ['5', '7.5', '11.25', '16.875'],
    6: ['0.5', '0.75', '1.125', '1.6875'],
  }

  it.each(Object.entries(expected))('Gen %s has the documented upgrade ladder', (gen, costs) => {
    const s = scheduleFor(Number(gen))
    expect([...s.upgrades]).toEqual(costs)
    expect(s.upgrades).toHaveLength(MAX_TIER)
  })

  it('Gen 6 hardwire is 1 RF, tier 0->1 is 0.5 RF, promote to Gen 5 is 9 RF', () => {
    const g6 = scheduleFor(6)
    expect(parseRF(g6.hardwire)).toBe(parseRF('1'))
    expect(parseRF(g6.upgrades[0])).toBe(parseRF('0.5'))
    expect(parseRF(promotionCostFor(6))).toBe(parseRF('9'))
  })

  it('Gen 3 hardwire is 1,000 RF, tier 0->1 is 500 RF, promote to Gen 2 is 9,000 RF', () => {
    const g3 = scheduleFor(3)
    expect(parseRF(g3.hardwire)).toBe(parseRF('1000'))
    expect(parseRF(g3.upgrades[0])).toBe(parseRF('500'))
    expect(parseRF(promotionCostFor(3))).toBe(parseRF('9000'))
  })

  it('Gen 1 hardwire is 100,000 RF with the documented upgrade ladder', () => {
    const g1 = scheduleFor(1)
    expect(parseRF(g1.hardwire)).toBe(parseRF('100000'))
    expect(g1.upgrades.map((u) => formatRF(parseRF(u)))).toEqual([
      '50,000',
      '75,000',
      '112,500',
      '168,750',
    ])
  })

  it('upgrades are sequential and tier 4 cannot upgrade further', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      for (let tier = 0; tier <= MAX_TIER; tier += 1) {
        const friend = makeFriend({
          collection: 'Generations',
          generation: gen,
          activated: true,
          tier,
          weightMicros: parseWeight(scheduleFor(gen).tierWeights[tier]),
        })
        const actions = availableActions(friend)
        const upgrade = actions.find((a) => a.kind === 'upgrade')
        if (tier < MAX_TIER) {
          expect(upgrade, `gen ${gen} tier ${tier} must offer an upgrade`).toBeTruthy()
          expect(upgrade!.subject).toContain(`TIER ${tier} → TIER ${tier + 1}`)
          expect(upgrade!.effect.costWei).toBe(parseRF(scheduleFor(gen).upgrades[tier]))
          expect(upgrade!.effect.weightAfterMicros).toBe(
            parseWeight(scheduleFor(gen).tierWeights[tier + 1]),
          )
        } else {
          expect(upgrade, `gen ${gen} tier 4 must not offer an upgrade`).toBeUndefined()
        }
      }
    }
  })
})

describe('Reward weight table', () => {
  const expected: Record<number, string[]> = {
    1: ['175000', '270000', '416250', '641250', '987187.5'],
    2: ['16000', '24375', '37125', '56531.25', '86062.5'],
    3: ['1450', '2212.5', '3375', '5146.875', '7846.875'],
    4: ['130', '198.75', '303.75', '464.0625', '708.75'],
    5: ['12', '18.375', '28.125', '43.03125', '65.8125'],
    6: ['1.1', '1.6875', '2.5875', '3.965625', '6.075'],
  }

  it.each(Object.entries(expected))('Gen %s tier weights match the docs', (gen, weights) => {
    expect([...scheduleFor(Number(gen)).tierWeights]).toEqual(weights)
  })

  it('every documented weight is exactly representable in fixed point', () => {
    for (const s of GENERATION_SCHEDULE) {
      for (const w of s.tierWeights) {
        const micros = parseWeight(w)
        // formatWeight groups thousands, so compare without separators
        expect(formatWeight(micros).replace(/,/g, '')).toBe(
          w.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
        )
      }
    }
  })

  it('an upgrade always strictly increases allocation weight', () => {
    for (const s of GENERATION_SCHEDULE) {
      for (let t = 1; t <= MAX_TIER; t += 1) {
        expect(parseWeight(s.tierWeights[t])).toBeGreaterThan(parseWeight(s.tierWeights[t - 1]))
      }
    }
  })
})

describe('Promotion', () => {
  it('adjacent promotion costs match the docs', () => {
    expect([...PROMOTION_COSTS_EARLIER]).toEqual(['9', '90', '900', '9000', '90000'])
  })

  it('the Gen 6 -> Gen 1 ladder sums to 99,999 RF (the docs round this to 100,000)', () => {
    const total = PROMOTION_COSTS_EARLIER.reduce((acc, c) => acc + parseRF(c), 0n)
    expect(total).toBe(parseRF(PROMOTION_LADDER_SUM_6_TO_1))
    // the Generations docs describe the total as "100,000 RF", which is a
    // rounded figure. The published adjacent ladder is what the app charges.
    expect(PROMOTION_LADDER_SUM_6_TO_1).toBe('99999')
  })

  it('each generation maps to its documented adjacent promotion cost', () => {
    expect([2, 3, 4, 5, 6].map(promotionCostFor)).toEqual(['90000', '9000', '900', '90', '9'])
    expect(() => promotionCostFor(1)).toThrow()
    expect(() => promotionCostFor(7)).toThrow()
  })

  it('a promotion moves one generation earlier and RESETS TIER TO 0', () => {
    for (let gen = 2; gen <= 6; gen += 1) {
      const friend = makeFriend({
        collection: 'Generations',
        generation: gen,
        activated: true,
        tier: 3,
        weightMicros: parseWeight(scheduleFor(gen).tierWeights[3]),
      })
      const promote = availableActions(friend).find((a) => a.kind === 'promote')!
      expect(promote).toBeTruthy()
      expect(promote.subject).toContain(`GEN ${gen} → GEN ${gen - 1}`)
      expect(promote.subject).toContain('TIER 3 → TIER 0')
      expect(promote.effect.costWei).toBe(parseRF(promotionCostFor(gen)))
      expect(promote.effect.weightAfterMicros).toBe(parseWeight(scheduleFor(gen - 1).baseWeight))
      expect(promote.consequences.join(' ')).toContain('RESETS TIER TO 0')
    }
  })

  it('Gen 1 cannot promote further', () => {
    for (let tier = 0; tier <= MAX_TIER; tier += 1) {
      const friend = makeFriend({
        collection: 'Generations',
        generation: 1,
        activated: true,
        tier,
        weightMicros: parseWeight(scheduleFor(1).tierWeights[tier]),
      })
      expect(availableActions(friend).find((a) => a.kind === 'promote')).toBeUndefined()
    }
  })

  it('a Generation can never promote into Genesis', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      const friend = makeFriend({
        collection: 'Generations',
        generation: gen,
        activated: true,
        tier: 0,
        weightMicros: parseWeight(scheduleFor(gen).baseWeight),
      })
      for (const a of availableActions(friend)) {
        expect(a.subject).not.toContain('GENESIS')
      }
    }
  })
})

describe('Temporary Friends read onchain', () => {
  it('reports generation 0 and still offers HARDWIRE, with no invented cost', () => {
    // This is the exact shape live data has: generation() returns 0.
    const friend = makeFriend({
      collection: 'Generations',
      generation: 0,
      temporary: true,
      activated: false,
      stateSource: 'onchain',
    })
    const actions = availableActions(friend)
    expect(actions).toHaveLength(1)
    expect(actions[0].kind).toBe('hardwire')
    expect(actions[0].costKnown).toBe(false)
    expect(actions[0].effect.costWei).toBe(0n)
    expect(actions[0].effect.weightAfterMicros).toBe(0n)
    expect(plannerOptions(friend)).toHaveLength(0)
  })
})

describe('Temporary Friends', () => {
  it('a temporary Friend with a declared generation can only hardwire', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      // Demo-equivalent: a declared target generation makes the cost knowable.
      const friend = makeFriend({
        collection: 'Generations',
        generation: gen,
        temporary: true,
        activated: false,
        stateSource: 'simulated',
      })
      const actions = availableActions(friend)
      expect(actions).toHaveLength(1)
      expect(actions[0].kind).toBe('hardwire')
      expect(actions[0].effect.costWei).toBe(parseRF(scheduleFor(gen).hardwire))
      expect(actions[0].effect.weightAfterMicros).toBe(parseWeight(scheduleFor(gen).baseWeight))
      expect(plannerOptions(friend)).toHaveLength(0)
    }
  })
})

describe('Protocol action fee split', () => {
  it('is 50% burn / 50% reward funding for every action', () => {
    expect(ACTION_FEE_SPLIT.burnShareBps).toBe(5_000n)
    expect(ACTION_FEE_SPLIT.rewardShareBps).toBe(5_000n)
    for (let gen = 1; gen <= 6; gen += 1) {
      for (const costStr of [scheduleFor(gen).hardwire, ...scheduleFor(gen).upgrades]) {
        const cost = parseRF(costStr)
        const { burnWei, fundingWei } = actionFeeSplit(cost)
        expect(burnWei + fundingWei).toBe(cost)
        expect(burnWei).toBe(fundingWei)
      }
    }
  })
})

describe('Reward stream', () => {
  it('streams over seven days', () => {
    expect(REWARD_STREAM_DURATION_SECONDS).toBe(7 * 24 * 60 * 60)
  })
})
