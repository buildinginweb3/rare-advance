/**
 * POOL TERMS
 * ==========
 *
 * A pool is a promise. Every field here is something a holder relies on when
 * they decide to take RF early, so each is validated at the point it is set and
 * locked the moment anyone else relies on it.
 *
 * validateTerms is PURE: it returns errors and never throws, so the wizard can
 * show them inline. The engine wraps it in a throwing guard, which is what the
 * tests below hold accountable.
 */

import { describe, expect, it } from 'vitest'
import {
  PoolError,
  clonePoolWithNewTerms,
  contribute,
  createPool,
  openStreamPosition,
  termsAreMutable,
  updateTerms,
} from '../../src/economy/pools/engine'
import { defaultTerms, publicAccess } from '../../src/economy/pools/seed'
import {
  PREMIUM_PRESETS,
  WETH_SHARE_PRESETS,
  describeTerms,
  maxTerms,
  minOwnerContributionBps,
  totalWethParticipationBps,
  validateTerms,
  DEFAULT_MAX_FINANCE_BPS,
} from '../../src/economy/pools/terms'
import type { Pool, PoolTerms } from '../../src/economy/pools/types'

const RF = (n: string | number): bigint => {
  if (typeof n === 'bigint') return n
  const raw = String(n)
  const m = /^(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!m) throw new Error(`bad test amount ${raw}`)
  return BigInt(m[1] || '0') * 10n ** 18n + BigInt(((m[2] ?? '').padEnd(18, '0').slice(0, 18)) || '0')
}

function poolWith(terms: PoolTerms, capital = RF(10_000_000)): Pool {
  return createPool({
    id: 'p1', name: 'P', kind: 'both', creatorLpId: 'creator', creatorName: 'Creator',
    capitalWei: capital, terms, access: publicAccess(), nowMs: 0,
  })
}

describe('validateTerms — pure, returns errors, never throws', () => {
  it('accepts the defaults', () => {
    const r = validateTerms(defaultTerms())
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('rejects a negative premium', () => {
    expect(validateTerms(defaultTerms({ streamPremiumBps: -1n })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ growthPremiumBps: -1n })).ok).toBe(false)
  })

  it('allows a punitive premium, because the market should show it being ignored', () => {
    // 100% premium is reachable only with a zero Rare Advance fee: the
    // premium and the fee together may never consume the whole face value.
    expect(validateTerms(defaultTerms({ streamPremiumBps: 9_999n, rareAdvanceFeeBps: 0n })).ok).toBe(true)
    expect(validateTerms(defaultTerms({ streamPremiumBps: 9_999n })).ok).toBe(false)
    // 100% would leave the holder nothing, which is the one hard line
    expect(validateTerms(defaultTerms({ streamPremiumBps: 10_000n, rareAdvanceFeeBps: 0n })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ streamPremiumBps: 10_001n })).ok).toBe(false)
  })

  it('rejects premium plus fee that would leave the holder nothing', () => {
    const r = validateTerms(defaultTerms({ streamPremiumBps: 9_900n, rareAdvanceFeeBps: 100n }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/leave the holder something/i)
  })

  it('rejects zero or oversized position caps', () => {
    expect(validateTerms(defaultTerms({ maxStreamPositionWei: 0n })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ growthMaxPositionWei: 0n })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ maxAdvanceShareBps: 0n })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ maxAdvanceShareBps: 10_001n })).ok).toBe(false)
  })

  it('allows WETH participation up to 100%, and no further', () => {
    expect(validateTerms(defaultTerms({ growthWethShareBps: 10_000n })).ok).toBe(true)
    expect(validateTerms(defaultTerms({ growthWethShareBps: 10_001n })).ok).toBe(false)
  })

  it('allows RF routing up to 100%, and no further', () => {
    expect(validateTerms(defaultTerms({ growthRfRoutingBps: 10_000n })).ok).toBe(true)
    expect(validateTerms(defaultTerms({ growthRfRoutingBps: 10_001n })).ok).toBe(false)
  })

  it('rejects a pool that could finance no action at all', () => {
    expect(validateTerms(defaultTerms({ eligibleActions: [] })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ eligibleGenerations: [] })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ eligibleGenerations: [0] })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ eligibleGenerations: [7] })).ok).toBe(false)
    expect(validateTerms(defaultTerms({ eligibleGenerations: null })).ok).toBe(true)
  })

  it('warns, but does not block, on merely unattractive terms', () => {
    // Guardrails stop INVALID pools, not expensive ones. That is the market.
    const r = validateTerms(defaultTerms({ streamPremiumBps: 1_600n }))
    expect(r.ok).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('every preset the wizard offers is itself valid', () => {
    for (const premium of PREMIUM_PRESETS) {
      expect(validateTerms(defaultTerms({ streamPremiumBps: premium })).ok, `premium ${premium}`).toBe(true)
    }
    for (const share of WETH_SHARE_PRESETS) {
      expect(validateTerms(defaultTerms({ growthWethShareBps: share })).ok, `weth ${share}`).toBe(true)
    }
    expect(validateTerms(defaultTerms({ growthMaxFinanceBps: DEFAULT_MAX_FINANCE_BPS })).ok).toBe(true)
  })

  it('maxTerms is reachable, so the ceiling is not a lie', () => {
    expect(validateTerms(maxTerms()).ok).toBe(true)
  })
})

describe('minOwnerContributionBps is derived, so the UI cannot contradict itself', () => {
  it('is the complement of maximum financing', () => {
    expect(minOwnerContributionBps(defaultTerms({ growthMaxFinanceBps: 7_500n }))).toBe(2_500n)
    expect(minOwnerContributionBps(defaultTerms({ growthMaxFinanceBps: 10_000n }))).toBe(0n)
  })

  it('never goes negative', () => {
    expect(minOwnerContributionBps(defaultTerms({ growthMaxFinanceBps: 10_000n }))).toBeGreaterThanOrEqual(0n)
  })
})

describe('describeTerms — how a borrower reads the promise', () => {
  it('gives every field a plain label and value', () => {
    const lines = describeTerms(defaultTerms({ streamPremiumBps: 300n }), 'stream')
    expect(lines.map((l) => l.label)).toContain('LP premium')
    expect(lines.find((l) => l.label === 'LP premium')!.value).toBe('3%')
    expect(lines.every((l) => l.label.length > 0 && l.value.length > 0)).toBe(true)
  })

  it('shows the WETH share as its own term, separate from RF', () => {
    const labels = describeTerms(defaultTerms(), 'growth').map((l) => l.label)
    expect(labels.some((l) => /WETH rewards/i.test(l))).toBe(true)
    expect(labels.some((l) => /RF rewards/i.test(l))).toBe(true)
  })
})

describe('totalWethParticipationBps — the product cap', () => {
  it('sums concurrent shares', () => {
    expect(totalWethParticipationBps([2_000n, 500n])).toBe(2_500n)
    expect(totalWethParticipationBps([])).toBe(0n)
  })
})

describe('the engine enforces the validator, not just the wizard', () => {
  it('refuses to create a pool with invalid terms', () => {
    expect(() => poolWith(defaultTerms({ streamPremiumBps: 9_999n }))).toThrow(PoolError)
  })

  it('refuses to update terms to something invalid', () => {
    const p = poolWith(defaultTerms())
    expect(() => updateTerms(p, defaultTerms({ streamPremiumBps: 9_999n }))).toThrow(PoolError)
    // the original terms are untouched
    expect(p.terms.streamPremiumBps).toBe(defaultTerms().streamPremiumBps)
  })

  it('refuses to clone a pool onto invalid terms', () => {
    const p = poolWith(defaultTerms())
    expect(() =>
      clonePoolWithNewTerms(p, 'p2', 'you', 'You', RF(1000), defaultTerms({ growthWethShareBps: 10_001n }), publicAccess(), 0),
    ).toThrow(PoolError)
  })
})

describe('the terms lock — no bait and switch', () => {
  it('a solo creator may change terms freely', () => {
    const p = poolWith(defaultTerms())
    expect(termsAreMutable(p)).toBe(true)
    expect(updateTerms(p, defaultTerms({ streamPremiumBps: 250n })).terms.streamPremiumBps).toBe(250n)
  })

  it('a second LP locks the terms permanently', () => {
    const p = contribute(poolWith(defaultTerms()), 'lp2', 'LP 2', RF(100_000))
    expect(termsAreMutable(p)).toBe(false)
    expect(() => updateTerms(p, defaultTerms())).toThrow(/TERMS LOCKED/)
  })

  it('the lock survives that LP leaving', () => {
    const p = contribute(poolWith(defaultTerms()), 'lp2', 'LP 2', RF(100_000))
    const after = contribute(p, 'creator', 'Creator', RF(1))
    expect(termsAreMutable(after)).toBe(false)
    expect(() => updateTerms(after, defaultTerms())).toThrow(/TERMS LOCKED/)
  })

  it('an open position locks the terms even with no other LP', () => {
    const p = openStreamPosition(poolWith(defaultTerms()), {
      id: 'pos1', friendKey: 'Genesis:1', borrowerLpId: 'you',
      faceValueWei: RF(1000), termMs: 86_400_000n, nowMs: 0,
    })
    expect(termsAreMutable(p)).toBe(false)
    expect(() => updateTerms(p, defaultTerms({ streamPremiumBps: 100n }))).toThrow(/TERMS LOCKED/)
  })

  it('the lock error points at the only honest escape', () => {
    const p = contribute(poolWith(defaultTerms()), 'lp2', 'LP 2', RF(100_000))
    expect(() => updateTerms(p, defaultTerms())).toThrow(/Clone it with new terms/i)
  })

  it('a clone starts clean: new terms, only the new creator, unlocked', () => {
    const locked = contribute(poolWith(defaultTerms()), 'lp2', 'LP 2', RF(100_000))
    const clone = clonePoolWithNewTerms(
      locked, 'p2', 'you', 'You', RF(500_000), defaultTerms({ streamPremiumBps: 100n }), publicAccess(), 1,
    )
    expect(clone.termsLocked).toBe(false)
    expect(termsAreMutable(clone)).toBe(true)
    expect(clone.terms.streamPremiumBps).toBe(100n)
    expect(Object.keys(clone.lps)).toEqual(['you'])
    expect(clone.cashRfWei).toBe(RF(500_000))
    // and the original is untouched, still locked
    expect(locked.terms.streamPremiumBps).toBe(defaultTerms().streamPremiumBps)
  })
})