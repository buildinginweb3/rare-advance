import { expect, test } from '@playwright/test'
import { enterDemo, watch } from './helpers'

/** First number in a cell, ignoring a trailing hint such as "· 4%". */
const num = (s: string) => Number(/[0-9][0-9,._]*/.exec(s)?.[0].replace(/[,._]/g, '') ?? '0')

test.describe('GENERATIONS FLOW', () => {
  test('an active Gen 3 at tier 2 previews the correct upgrade and promotion', async ({ page }) => {
    const errs = watch(page)
    await enterDemo(page)
    await page.getByTestId('friend-card-Generations:41220').click()
    await page.getByTestId('nav-grow').click()

    // current state is surfaced
    await expect(page.getByTestId('action-upgrade')).toContainText('GEN 3 · TIER 2 → TIER 3')
    await expect(page.getByTestId('action-upgrade')).toContainText('3,375') // tier 2 weight
    await expect(page.getByTestId('action-upgrade')).toContainText('5,146.875') // tier 3 weight
    await expect(page.getByTestId('action-upgrade')).toContainText('+1,771.875') // delta
    await expect(page.getByTestId('action-upgrade')).toContainText('1,125 RF') // cost

    // promotion resets tier to 0
    const promote = page.getByTestId('action-promote')
    await expect(promote).toContainText('GEN 3 → GEN 2 · TIER 2 → TIER 0')
    await expect(promote).toContainText('9,000 RF')
    await expect(promote).toContainText('16,000') // Gen 2 tier 0 weight
    await expect(promote).toContainText('RESETS TIER TO 0')

    errs.expectClean()
  })

  test('an active Gen 1 can upgrade but cannot promote further', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('friend-card-Generations:1773').click()
    await page.getByTestId('nav-grow').click()
    await expect(page.getByTestId('action-upgrade')).toContainText('GEN 1 · TIER 0 → TIER 1')
    await expect(page.getByTestId('action-upgrade')).toContainText('50,000 RF')
    await expect(page.getByTestId('action-upgrade')).toContainText('270,000')
    // Gen 1 is the ceiling: no promotion is ever offered
    await expect(page.getByTestId('action-promote')).toHaveCount(0)
  })

  test('the planner previews upgrade and promotion with protocol cost, weight and delta', async ({ page }) => {
    await enterDemo(page)
    // the inactive Gen 4 is the cleanest planner subject
    await page.getByTestId('friend-card-Generations:77045').click()
    await page.getByTestId('nav-grow').click()

    const planner = page.getByTestId('planner-card')
    await expect(planner).toBeVisible()
    // an inactive Gen 4 sits at tier 0: 130
    await expect(planner).toContainText('130')

    // upgrade preview
    await page.getByTestId('planner-0').click()
    await expect(planner).toContainText(/upgrade to tier 1/i)
    await expect(planner).toContainText('50 RF') // Gen 4 tier 0->1
    await expect(planner).toContainText('198.75') // Gen 4 tier 1 weight
    await expect(planner).toContainText('+68.75') // delta
    await expect(planner).toContainText(/mode/i) // MODELED badge

    // promotion preview
    await page.getByTestId('planner-1').click()
    await expect(planner).toContainText(/promote to gen 3/i)
    await expect(planner).toContainText('900 RF') // Gen 4 -> Gen 3
    await expect(planner).toContainText('1,450') // Gen 3 tier 0 weight
    await expect(planner).toContainText(/tier resets to 0/i)
  })

  test('a temporary unhardwired Friend can only hardwire', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('friend-card-Generations:4975').click()
    await page.getByTestId('nav-grow').click()

    const hardwire = page.getByTestId('action-hardwire')
    await expect(hardwire).toBeVisible()
    await expect(hardwire).toContainText('GEN 6 · TEMPORARY → PERMANENT · TIER 0')
    // Demo Mode declares the generation, so the Gen 6 ladder applies
    await expect(hardwire).toContainText('1 RF')
    await expect(hardwire).toContainText('1.1') // Gen 6 tier 0 weight
    // impossible actions are never offered
    await expect(page.getByTestId('action-promote')).toHaveCount(0)
    await expect(page.getByTestId('action-upgrade')).toHaveCount(0)
    await expect(page.getByTestId('action-reactivate')).toHaveCount(0)
    // and there is nothing legitimate to plan
    await expect(page.getByTestId('planner-card')).toHaveCount(0)
  })

  test('an inactive permanent Gen 4 only offers reactivation at 10% of hardwire', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('friend-card-Generations:77045').click()
    await page.getByTestId('nav-grow').click()
    const re = page.getByTestId('action-reactivate')
    await expect(re).toContainText('GEN 4 · INACTIVE → ACTIVE · TIER 0')
    await expect(re).toContainText('10 RF') // 10% of the 100 RF Gen 4 hardwire
    await expect(re).toContainText('130') // Gen 4 tier 0 weight
    await expect(re).toContainText('5 RF') // 50% protocol burn
    await expect(re).toContainText(/restarts at tier 0/i)
    await expect(page.getByTestId('action-upgrade')).toHaveCount(0)
    await expect(page.getByTestId('action-promote')).toHaveCount(0)
  })

  test('the full official generation table is shown with correct values', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('nav-grow').click()
    // Gen 1 is the ceiling: there is no earlier generation to promote into.
    const rows: [number, string, string, string, string][] = [
      [1, '100,000 RF', '10,000 RF', '—', '987,187.5'],
      [2, '10,000 RF', '1,000 RF', '90,000 RF', '86,062.5'],
      [3, '1,000 RF', '100 RF', '9,000 RF', '7,846.875'],
      [4, '100 RF', '10 RF', '900 RF', '708.75'],
      [5, '10 RF', '1 RF', '90 RF', '65.8125'],
      [6, '1 RF', '0.1 RF', '9 RF', '6.075'],
    ]
    for (const [gen, hardwire, reactivate, promote, tier4] of rows) {
      const row = page.getByTestId(`gen-row-${gen}`)
      await expect(row).toContainText(hardwire)
      await expect(row).toContainText(reactivate)
      await expect(row).toContainText(promote)
      await expect(row).toContainText(tier4)
    }
    // Genesis has no hardwire, promote or upgrade path at all
    const panel = page.getByTestId('generation-table')
    await expect(panel).toContainText('GENESIS')
    await expect(panel).toContainText('100,000 RF')
    await expect(panel).toContainText('2,000,000')
  })

  test('an advance then Grow financing both reconcile exactly', async ({ page }) => {
    await enterDemo(page)
    // 1. advance a Genesis for 1,000 RF-equivalent slice
    await page.getByTestId('friend-card-Genesis:500').click()
    await page.getByTestId('nav-advance').click()
    await page.getByTestId('advance-custom').fill('1000')
    await page.getByTestId('advance-custom-apply').click()
    const received = num(await page.getByTestId('quote-receive').innerText())
    const lp = num(await page.getByTestId('quote-lp').innerText())
    const burn = num(await page.getByTestId('quote-burn').innerText())
    const settle = num(await page.getByTestId('quote-settlement').innerText())
    expect(received).toBe(950)
    expect(lp).toBe(40)
    expect(burn).toBe(10)
    expect(settle).toBe(1000)
    expect(received + lp + burn).toBeCloseTo(settle, 6)
  })
})
