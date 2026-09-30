/**
 * PRO-RATA ALLOCATION AND FUNDING SNAPSHOTS
 * ===========================================
 *
 * The single most important structural rule in the whole market lives here:
 * a position records WHO funded it, and later arrivals never inherit those
 * earnings.
 */

import { describe, expect, it } from 'vitest'
import {
  buildFundingSnapshot,
  distributeBySnapshot,
  fundingIsConsistent,
  fundingTotal,
  recomputeFundingShares,
  splitProRata,
} from '../../src/economy/pools/allocate'
import { BPS_SCALE } from '../../src/math/rf'

/** Exact decimal -> wei. Never goes through a float. */
const RF = (n: string | number): bigint => {
  if (typeof n === 'bigint') return n
  const raw = String(n)
  const m = /^(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!m) throw new Error(`bad test amount ${raw}`)
  const int = m[1] || '0'
  const frac = (m[2] ?? '').padEnd(18, '0').slice(0, 18)
  return BigInt(int) * 10n ** 18n + BigInt(frac || '0')
}

describe('splitProRata', () => {
  it('splits exactly, so no RF appears from nowhere', () => {
    const cases: [bigint, bigint[]][] = [
      [RF(1000), [RF(25), RF(50), RF(25)]],
      [1n, [1n, 1n, 1n]],
      [3n, [1n, 1n, 1n]],
      [RF('0.000000000000000007'), [RF(1), RF(2), RF(4)]],
      [RF(999999), [RF(7), RF(11), RF(13)]],
    ]
    for (const [total, weights] of cases) {
      const shares = splitProRata(
        total,
        weights.map((weightWei, i) => ({ id: `lp${i}`, weightWei })),
      )
      expect(shares.reduce((a, s) => a + s.amountWei, 0n), `${total} did not reconcile`).toBe(total)
    }
  })

  it('gives 25/50/25 exactly for divisible inputs', () => {
    const shares = splitProRata(RF(1000), [
      { id: 'a', weightWei: RF(25) },
      { id: 'b', weightWei: RF(50) },
      { id: 'c', weightWei: RF(25) },
    ])
    expect(shares.map((s) => s.lpId)).toEqual(['b', 'a', 'c'])
    expect(shares.find((s) => s.lpId === 'a')!.amountWei).toBe(RF(250))
    expect(shares.find((s) => s.lpId === 'b')!.amountWei).toBe(RF(500))
    expect(shares.find((s) => s.lpId === 'c')!.amountWei).toBe(RF(250))
  })

  it('rounds deterministically, largest weight first', () => {
    const first = splitProRata(1n, [
      { id: 'small', weightWei: 1n },
      { id: 'big', weightWei: 9n },
    ])
    const second = splitProRata(1n, [
      { id: 'big', weightWei: 9n },
      { id: 'small', weightWei: 1n },
    ])
    expect(first).toEqual(second)
    // the single wei goes to the largest weight
    expect(first.find((s) => s.lpId === 'big')!.amountWei).toBe(1n)
    expect(first.find((s) => s.lpId === 'small')!.amountWei).toBe(0n)
  })

  it('ignores zero and negative weights safely', () => {
    const shares = splitProRata(RF(100), [
      { id: 'a', weightWei: RF(100) },
      { id: 'zero', weightWei: 0n },
    ])
    expect(shares).toHaveLength(1)
    expect(shares[0]!.amountWei).toBe(RF(100))
  })

  it('refuses to distribute a non-zero amount to nobody', () => {
    expect(() => splitProRata(RF(10), [])).toThrow()
    expect(splitProRata(0n, [])).toEqual([])
  })
})

describe('buildFundingSnapshot — the frozen allocation', () => {
  it('funds a position pro-rata from available balances', () => {
    const snapshot = buildFundingSnapshot(
      [
        { lpId: 'a', availableWei: RF(2500) },
        { lpId: 'b', availableWei: RF(5000) },
        { lpId: 'c', availableWei: RF(2500) },
      ],
      RF(10_000),
    )
    expect(fundingTotal(snapshot)).toBe(RF(10_000))
    expect(snapshot.find((f) => f.lpId === 'a')!.principalWei).toBe(RF(2500))
    expect(snapshot.find((f) => f.lpId === 'b')!.principalWei).toBe(RF(5000))
    expect(snapshot.find((f) => f.lpId === 'c')!.principalWei).toBe(RF(2500))
  })

  it('never leaves RF unassigned', () => {
    const available = [RF(3333), RF(3333), RF(3334)]
    const snapshot = buildFundingSnapshot(
      available.map((a, i) => ({ lpId: `lp${i}`, availableWei: a })),
      RF(7777),
    )
    expect(fundingTotal(snapshot)).toBe(RF(7777))
  })

  it('CRITICAL: a late LP is absent from an existing snapshot', () => {
    // A 25/75 pool opens a position
    const snapshot = buildFundingSnapshot(
      [
        { lpId: 'a', availableWei: RF(2500) },
        { lpId: 'b', availableWei: RF(7500) },
      ],
      RF(10_000),
    )
    // A newcomer joins with a large balance
    const withNewcomer = [...snapshot, { lpId: 'late', principalWei: 0n, shareBps: 0n }]
    expect(withNewcomer.find((f) => f.lpId === 'late')!.principalWei).toBe(0n)
    // and earns nothing from it
    const { shares } = distributeBySnapshot(withNewcomer, RF(400))
    expect(shares.find((s) => s.lpId === 'a')!.amountWei).toBe(RF(100))
    expect(shares.find((s) => s.lpId === 'b')!.amountWei).toBe(RF(300))
    expect(shares.find((s) => s.lpId === 'late')).toBeUndefined()
  })

  it('shares always reconcile with principals', () => {
    const snapshot = buildFundingSnapshot(
      [
        { lpId: 'a', availableWei: RF(1) },
        { lpId: 'b', availableWei: RF(1) },
        { lpId: 'c', availableWei: RF(1) },
      ],
      RF(2),
    )
    const recomputed = recomputeFundingShares(snapshot)
    expect(recomputed.map((f) => f.shareBps)).toEqual(snapshot.map((f) => f.shareBps))
    expect(fundingIsConsistent(snapshot)).toBe(true)
  })
})

describe('distributeBySnapshot', () => {
  it('splits a distribution by the frozen shares, not current membership', () => {
    const snapshot = [
      { lpId: 'a', principalWei: RF(2000), shareBps: 2_000n },
      { lpId: 'b', principalWei: RF(8000), shareBps: 8_000n },
    ]
    const { shares } = distributeBySnapshot(snapshot, RF(400))
    expect(shares.find((s) => s.lpId === 'a')!.amountWei).toBe(RF(80))
    expect(shares.find((s) => s.lpId === 'b')!.amountWei).toBe(RF(320))
    expect(shares.reduce((a, s) => a + s.amountWei, 0n)).toBe(RF(400))
  })

  it('distributes WETH in its own right, to the same snapshot', () => {
    const snapshot = [
      { lpId: 'a', principalWei: RF(2500), shareBps: 2_500n },
      { lpId: 'b', principalWei: RF(7500), shareBps: 7_500n },
    ]
    const { shares } = distributeBySnapshot(snapshot, RF('0.1'))
    expect(shares.find((s) => s.lpId === 'a')!.amountWei).toBe(RF('0.025'))
    expect(shares.find((s) => s.lpId === 'b')!.amountWei).toBe(RF('0.075'))
  })

  it('is a no-op for a zero amount', () => {
    const snapshot = [{ lpId: 'a', principalWei: RF(1), shareBps: BPS_SCALE }]
    expect(distributeBySnapshot(snapshot, 0n).shares).toEqual([])
  })
})
