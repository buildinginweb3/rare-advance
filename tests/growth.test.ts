/**
 * GROWTH FINANCE TESTS
 * ====================
 *
 * Examples across all six generations plus Genesis, the reward routing, the
 * premium split, the protocol split and the separation of the two burns.
 */

import { describe, expect, it } from 'vitest'
import { GROW_FINANCE } from '../src/economy/rareAdvanceConfig'
import { breakdownFinance, modelPayback, quoteGrowthFinance, routeFutureRewards, FinanceError } from '../src/economy/growth'
import { availableActions, GENESIS_COST_WEI, plannerOptions, scheduleFor } from '../src/protocol/actions'
import { parseRF, parseWeight, formatBpsAsPercent, BPS_SCALE } from '../src/math/rf'
import type { FriendPosition, GrowthAction } from '../src/types'

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

function genesisActivateAction(): GrowthAction {
  return availableActions(makeFriend({ collection: 'Genesis' })).find((a) => a.kind === 'activate')!
}

function genAction(generation: number, kind: 'hardwire' | 'reactivate' | 'promote' | 'upgrade', tier = 0): GrowthAction {
  const s = scheduleFor(generation)
  const friend =
    kind === 'hardwire'
      // Demo-equivalent: a temporary Friend whose target generation is declared.
      ? makeFriend({ collection: 'Generations', generation, temporary: true, stateSource: 'simulated' })
      : kind === 'reactivate'
        ? makeFriend({ collection: 'Generations', generation, activated: false })
        : makeFriend({
            collection: 'Generations',
            generation,
            activated: true,
            tier,
            weightMicros: parseWeight(s.tierWeights[tier]),
          })
  return availableActions(friend).find((a) => a.kind === kind)!
}

describe('financed amount = action cost - user contribution', () => {
  it('Genesis activation at 25% contribution', () => {
    const action = genesisActivateAction()
    const b = breakdownFinance(action, parseRF('25000'))
    expect(b.financedWei).toBe(parseRF('75000'))
    expect(b.userContributionWei).toBe(parseRF('25000'))
  })

  it.each([1, 2, 3, 4, 5, 6])('Gen %i hardwire with a 50% contribution', (gen) => {
    const action = genAction(gen, 'hardwire')
    const half = action.effect.costWei / 2n
    const b = breakdownFinance(action, half)
    expect(b.financedWei).toBe(half)
    expect(b.financedWei + b.userContributionWei).toBe(action.effect.costWei)
  })

  it('rejects a contribution above the action cost', () => {
    const action = genAction(3, 'hardwire')
    expect(() => breakdownFinance(action, action.effect.costWei + 1n)).toThrow(FinanceError)
  })

  it('rejects a negative contribution', () => {
    const action = genAction(3, 'hardwire')
    expect(() => breakdownFinance(action, -1n)).toThrow(FinanceError)
  })
})

describe('repayment target = principal + 5% premium', () => {
  it('10,000 RF financed repays 10,500 RF', () => {
    const action = genAction(1, 'hardwire') // 100,000 RF
    const b = breakdownFinance(action, parseRF('90000'))
    expect(b.financedWei).toBe(parseRF('10000'))
    expect(b.premiumWei).toBe(parseRF('500'))
    expect(b.repaymentTargetWei).toBe(parseRF('10500'))
  })

  it('splits the premium 80% to LPs / 20% to a Rare Advance burn', () => {
    const action = genAction(1, 'hardwire')
    const b = breakdownFinance(action, parseRF('90000'))
    expect(b.premiumToLiquidityProvidersWei).toBe(parseRF('400'))
    expect(b.premiumToRareAdvanceBurnWei).toBe(parseRF('100'))
    expect(b.premiumToLiquidityProvidersWei + b.premiumToRareAdvanceBurnWei).toBe(b.premiumWei)
  })

  it('the configured premium is 5% with an 80/20 split', () => {
    expect(GROW_FINANCE.premiumBps).toBe(500n)
    expect(GROW_FINANCE.premiumToLiquidityProvidersBps).toBe(8_000n)
    expect(GROW_FINANCE.premiumToRareAdvanceBurnBps).toBe(2_000n)
    expect(
      GROW_FINANCE.premiumToLiquidityProvidersBps + GROW_FINANCE.premiumToRareAdvanceBurnBps,
    ).toBe(BPS_SCALE)
  })

  it('a fully-funded action carries no financing premium', () => {
    const action = genAction(3, 'hardwire')
    const b = breakdownFinance(action, action.effect.costWei)
    expect(b.financedWei).toBe(0n)
    expect(b.premiumWei).toBe(0n)
    expect(b.repaymentTargetWei).toBe(0n)
  })
})

describe('protocol 50/50 split is separate from the Rare Advance burn', () => {
  it('Genesis activation: 50,000 protocol burn, 50,000 reward funding', () => {
    const action = genesisActivateAction()
    const b = breakdownFinance(action, parseRF('25000'))
    expect(action.effect.protocolBurnWei).toBe(parseRF('50000'))
    expect(action.effect.protocolRewardFundingWei).toBe(parseRF('50000'))
    // the Rare Advance premium is a DIFFERENT number:
    // 5% of the 75,000 RF financed principal = 3,750 RF
    expect(b.financedWei).toBe(parseRF('75000'))
    expect(b.premiumWei).toBe(parseRF('3750'))
    expect(b.premiumToRareAdvanceBurnWei).toBe(parseRF('750'))
    expect(b.destinations.protocolBurnWei).toBe(parseRF('50000'))
    expect(b.destinations.rareAdvanceBurnWei).toBe(parseRF('750'))
  })

  it('a Gen 3 upgrade splits its own cost 50/50 and never mixes the two burns', () => {
    const action = genAction(3, 'upgrade', 2) // tier 2 -> 3, 1,125 RF
    expect(action.effect.costWei).toBe(parseRF('1125'))
    const b = breakdownFinance(action, 0n)
    expect(b.destinations.protocolBurnWei).toBe(parseRF('562.5'))
    expect(b.destinations.protocolRewardFundingWei).toBe(parseRF('562.5'))
    // Rare Advance premium: 5% of the 1,125 RF financed = 56.25 RF,
    // split 80/20 -> 45 RF to LPs and 11.25 RF to the Rare Advance burn.
    expect(b.premiumWei).toBe(parseRF('56.25'))
    expect(b.destinations.rareAdvanceBurnWei).toBe(parseRF('11.25'))
    expect(b.destinations.liquidityProvidersWei).toBe(parseRF('45'))
  })

  it('every generation action splits 50/50 exactly', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      for (const kind of ['hardwire', 'reactivate', 'promote', 'upgrade'] as const) {
        if (kind === 'promote' && gen === 1) continue
        const action = genAction(gen, kind)
        const b = breakdownFinance(action, 0n)
        expect(b.destinations.protocolBurnWei + b.destinations.protocolRewardFundingWei).toBe(
          action.effect.costWei,
        )
        expect(b.destinations.protocolBurnWei).toBe(b.destinations.protocolRewardFundingWei)
      }
    }
  })
})

describe('temporary Friends read onchain have no determinable hardwire cost', () => {
  it('refuses to quote a cost or a resulting weight', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      for (let generation = 1; generation <= 6; generation += 1) {
      // A temporary Friend genuinely reports generation 0 onchain. This is the
      // shape that live data actually has.
      const live = makeFriend({
        collection: 'Generations',
        generation: 0,
        temporary: true,
        stateSource: 'onchain',
      })
      const actions = availableActions(live)
      expect(actions).toHaveLength(1)
      expect(actions[0].kind).toBe('hardwire')
      // The docs: the live RF balance selects the highest affordable
      // generation, so no single cost exists onchain. Rare Advance must not
      // invent one.
      expect(actions[0].costKnown).toBe(false)
      expect(actions[0].effect.costWei).toBe(0n)
      expect(actions[0].effect.weightAfterMicros).toBe(0n)
      expect(actions[0].subject).toContain('GEN ?')
      // and there is nothing legitimate to plan
      expect(plannerOptions(live)).toHaveLength(0)
      }
    }
  })

  it('a declared-generation temporary Friend does get a cost', () => {
    // Demo Mode declares the target generation explicitly, so the cost is known.
    const declared = makeFriend({
      collection: 'Generations',
      generation: 6,
      temporary: true,
      stateSource: 'simulated',
    })
    const action = availableActions(declared)[0]!
    expect(action.costKnown).toBe(true)
    expect(action.effect.costWei).toBe(parseRF('1'))
    expect(action.effect.weightAfterMicros).toBe(parseWeight('1.1'))
  })
})

describe('reward routing', () => {
  const action = genAction(3, 'upgrade', 2)
  const quote = quoteGrowthFinance({
    action,
    userContributionWei: parseRF('281.25'),
    totalActiveWeightMicros: parseWeight('1000000'),
    rfStreamRateWeiPerSec: parseRF('140'),
    totalActiveWeightProvenance: 'onchain',
  })

  it('routes 75% to repayment and 25% to the owner while outstanding', () => {
    const r = routeFutureRewards(quote, parseRF('1000'), 0n)
    expect(r.repaymentWei).toBe(parseRF('750'))
    expect(r.ownerWei).toBe(parseRF('250'))
    expect(r.settled).toBe(false)
  })

  it('caps the repayment at the outstanding target and settles', () => {
    const outstanding = quote.repaymentTargetWei
    const big = outstanding * 2n
    const r = routeFutureRewards(quote, big, 0n)
    expect(r.repaymentWei).toBe(outstanding)
    expect(r.outstandingAfterWei).toBe(0n)
    expect(r.settled).toBe(true)
  })

  it('gives the owner 100% after the target is reached', () => {
    const r = routeFutureRewards(quote, parseRF('1000'), quote.repaymentTargetWei)
    expect(r.repaymentWei).toBe(0n)
    expect(r.ownerWei).toBe(parseRF('1000'))
    expect(r.settled).toBe(true)
  })

  it('routes 75% / 25% exactly for every earned amount below the target', () => {
    for (const s of ['0.001', '1', '10.5', '123.45678']) {
      const r = routeFutureRewards(quote, parseRF(s), 0n)
      expect(r.repaymentWei + r.ownerWei).toBe(parseRF(s))
      expect(r.repaymentWei).toBe((parseRF(s) * 7_500n) / BPS_SCALE)
      expect(r.ownerWei).toBe(parseRF(s) - (parseRF(s) * 7_500n) / BPS_SCALE)
    }
  })

  it('never repays more than the outstanding target, however much is earned', () => {
    for (const s of ['1234.5678', '1000000', '999999999']) {
      const r = routeFutureRewards(quote, parseRF(s), 0n)
      expect(r.repaymentWei).toBe(quote.repaymentTargetWei)
      expect(r.repaidNeverExceeds).toBe(true)
    }
  })
})

describe('promotion and upgrade effects', () => {
  it('promotion effect resets tier to 0 of the earlier generation', () => {
    const action = genAction(4, 'promote', 2)
    expect(action.effect.weightAfterMicros).toBe(parseWeight(scheduleFor(3).baseWeight))
    expect(action.effect.weightAfterMicros).toBe(parseWeight('1450'))
  })

  it('upgrade effect lands on the documented next tier weight', () => {
    const action = genAction(3, 'upgrade', 2)
    expect(action.effect.weightBeforeMicros).toBe(parseWeight('3375'))
    expect(action.effect.weightAfterMicros).toBe(parseWeight('5146.875'))
  })

  it('Gen 4 tier 1 -> tier 2 as documented in the planner example', () => {
    const s = scheduleFor(4)
    const friend = makeFriend({
      collection: 'Generations',
      generation: 4,
      activated: true,
      tier: 1,
      weightMicros: parseWeight(s.tierWeights[1]),
    })
    const up = availableActions(friend).find((a) => a.kind === 'upgrade')!
    expect(up.effect.costWei).toBe(parseRF('75'))
    expect(up.effect.weightAfterMicros).toBe(parseWeight('303.75'))
  })
})

describe('weight increase reporting', () => {
  it('reports a null increase when coming from zero weight', () => {
    const quote = quoteGrowthFinance({
      action: genesisActivateAction(),
      userContributionWei: parseRF('25000'),
      totalActiveWeightMicros: parseWeight('1000000'),
      rfStreamRateWeiPerSec: parseRF('140'),
      totalActiveWeightProvenance: 'onchain',
    })
    expect(quote.weightIncreaseBps).toBeNull()
    expect(quote.weightAfterMicros).toBe(parseWeight('2000000'))
  })

  it('reports a 52.5% weight increase for the Gen 3 tier 2 -> 3 example', () => {
    const action = genAction(3, 'upgrade', 2)
    const quote = quoteGrowthFinance({
      action,
      userContributionWei: parseRF('281.25'),
      totalActiveWeightMicros: parseWeight('1000000'),
      rfStreamRateWeiPerSec: parseRF('140'),
      totalActiveWeightProvenance: 'onchain',
    })
    // (5146.875 - 3375) / 3375 = exactly 52.5% -> 5250 bps
    expect(quote.weightIncreaseBps).toBe(5_250n)
    expect(formatBpsAsPercent(quote.weightIncreaseBps!, 1)).toBe('52.5%')
    expect(quote.weightAfterMicros - quote.weightBeforeMicros).toBe(parseWeight('1771.875'))
  })

  it('never equates a weight increase to an earnings increase', () => {
    // weight increase is a pure ratio; no earnings figure is derived from it
    const quote = quoteGrowthFinance({
      action: genAction(3, 'upgrade', 2),
      userContributionWei: 0n,
      totalActiveWeightMicros: parseWeight('1000000'),
      rfStreamRateWeiPerSec: parseRF('140'),
      totalActiveWeightProvenance: 'onchain',
    })
    expect(quote.weightIncreaseBps).toBeGreaterThan(0n)
    expect(quote.payback).toBeTruthy()
    // payback is derived from weight share x stream rate, never from the bps
    expect(quote.payback?.postActionShareBps).toBeLessThan(BPS_SCALE)
  })
})

describe('modeled payback', () => {
  const totalWeight = parseWeight('1068353624.53125')
  const rate = parseRF('140')

  it('derives post-action share, daily rewards and payback', () => {
    const action = genAction(3, 'upgrade', 2)
    const p = modelPayback(parseRF('1000'), action.effect.weightAfterMicros, action.effect.weightBeforeMicros, totalWeight, rate)!
    expect(p.postActionTotalActiveWeightMicros).toBe(
      totalWeight - action.effect.weightBeforeMicros + action.effect.weightAfterMicros,
    )
    expect(p.currentRfStreamRateWeiPerSec).toBe(rate)
    // daily = 140 * 86400
    expect(p.postActionShareWad).toBeGreaterThan(0n)
    expect(p.modeledRfPerDayWei).toBeGreaterThan(0n)
    expect(p.modeledRfPerDayWei).toBeLessThanOrEqual(parseRF('140') * 86_400n)
    expect(p.repaymentRfPerDayWei).toBeLessThan(p.modeledRfPerDayWei)
    expect(p.modeledPaybackSeconds).toBeGreaterThan(0n)
  })

  it('returns null when live inputs are unavailable instead of inventing them', () => {
    const action = genAction(3, 'upgrade', 2)
    expect(modelPayback(parseRF('1000'), action.effect.weightAfterMicros, action.effect.weightBeforeMicros, null, rate)).toBeNull()
    expect(modelPayback(parseRF('1000'), action.effect.weightAfterMicros, action.effect.weightBeforeMicros, totalWeight, null)).toBeNull()
    expect(modelPayback(0n, action.effect.weightAfterMicros, action.effect.weightBeforeMicros, totalWeight, rate)).toBeNull()
  })

  it('marks the quote as modeled when live inputs exist and simulated otherwise', () => {
    const action = genAction(3, 'upgrade', 2)
    const live = quoteGrowthFinance({
      action,
      userContributionWei: 0n,
      totalActiveWeightMicros: totalWeight,
      rfStreamRateWeiPerSec: rate,
      totalActiveWeightProvenance: 'onchain',
    })
    expect(live.paybackProvenance).toBe('modeled')

    const offline = quoteGrowthFinance({
      action,
      userContributionWei: 0n,
      totalActiveWeightMicros: null,
      rfStreamRateWeiPerSec: null,
      totalActiveWeightProvenance: 'simulated',
    })
    expect(offline.payback).toBeNull()
    expect(offline.paybackProvenance).toBe('simulated')
  })
})

describe('all six generations and Genesis finance cleanly', () => {
  it('produces a reconciling breakdown for every generation action', () => {
    for (let gen = 1; gen <= 6; gen += 1) {
      for (const kind of ['hardwire', 'reactivate', 'promote', 'upgrade'] as const) {
        if (kind === 'promote' && gen === 1) continue
        const action = genAction(gen, kind)
        const cost = action.effect.costWei
        for (const pct of [0n, 2_500n, 5_000n]) {
          const contribution = (cost * pct) / BPS_SCALE
          const b = breakdownFinance(action, contribution)
          expect(b.financedWei + b.userContributionWei).toBe(cost)
          expect(b.premiumToLiquidityProvidersWei + b.premiumToRareAdvanceBurnWei).toBe(b.premiumWei)
          expect(b.repaymentTargetWei).toBe(b.financedWei + b.premiumWei)
          expect(b.destinations.protocolBurnWei + b.destinations.protocolRewardFundingWei).toBe(cost)
        }
      }
    }
  })

  it('Genesis activation finances and repays from future rewards', () => {
    const action = genesisActivateAction()
    expect(action.effect.costWei).toBe(GENESIS_COST_WEI)
    const b = breakdownFinance(action, parseRF('25000'))
    expect(b.financedWei).toBe(parseRF('75000'))
    expect(b.premiumWei).toBe(parseRF('3750'))
    expect(b.repaymentTargetWei).toBe(parseRF('78750'))
    expect(b.premiumToLiquidityProvidersWei).toBe(parseRF('3000'))
    expect(b.premiumToRareAdvanceBurnWei).toBe(parseRF('750'))
  })
})
