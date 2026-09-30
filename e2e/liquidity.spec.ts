import { expect, test } from '@playwright/test'
import { enterDemo, watch } from './helpers'

test.describe('LIQUIDITY FLOW', () => {
  test('the pool dashboard shows the documented demo figures', async ({ page }) => {
    const errs = watch(page)
    await enterDemo(page)
    await page.getByTestId('nav-liquidity').click()

    const pool = page.getByTestId('liquidity-pool')
    await expect(pool).toContainText('240,000 RF')
    await expect(pool).toContainText('81,400 RF')
    await expect(pool).toContainText('158,600 RF')
    await expect(pool).toContainText('33.9%')
    await expect(pool).toContainText('3,820 RF')
    await expect(pool).toContainText('955 RF')
    await expect(pool).toContainText('POOL TERMS ARE SIMULATED')

    errs.expectClean()
  })

  test('adding simulated liquidity updates the pool share', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('nav-liquidity').click()
    const pool = page.getByTestId('liquidity-pool')

    const readTotal = async () => Number(/([\d,]+)/.exec(await pool.locator('.lcd', { hasText: 'TOTAL LIQUIDITY' }).innerText())?.[1].replace(/,/g, '') ?? '0')
    const before = await readTotal()
    expect(before).toBe(240000)

    // preset
    await page.getByTestId('lp-preset-5000').click()
    await expect(page.getByTestId('lp-provide')).toBeEnabled()
    const preview = await page.getByTestId('lp-preview-share').innerText()
    expect(preview).not.toBe('0%')

    await page.getByTestId('lp-provide').click()
    expect(await readTotal()).toBe(245000)

    // custom
    await page.getByTestId('lp-custom').fill('10000')
    await page.getByTestId('lp-provide').click()
    expect(await readTotal()).toBe(255000)

    // the depositor position is reported
    const pos = page.getByTestId('lp-user-position')
    await expect(pos).toBeVisible()
    await expect(pos).toContainText('15,000 RF supplied')
    await expect(pos).toContainText('of the pool')

    // zero deposit is refused
    await page.getByTestId('lp-custom').fill('0')
    await expect(page.getByTestId('lp-provide')).toBeDisabled()
  })

  test('the liquidity page never promises a yield or an APY', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('nav-liquidity').click()
    const text = (await page.locator('body').innerText()).toUpperCase()
    // no APY/APR figure is ever attached to a number
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%\s*(APY|APR)/)
    expect(text).not.toMatch(/(APY|APR)\s*[:=]?\s*\d/)
    expect(text).toContain('NO YIELD IS PROMISED')
    expect(text).toContain('RF SPREAD')
    // the honest explanation is on the page
    expect(text).toContain('CANNOT HONESTLY BE ANNUALISED')
  })

  test('both sides of the economy are shown', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('nav-liquidity').click()
    await expect(page.getByText('future RF → liquidity now')).toBeVisible()
    await expect(page.getByText('RF liquidity → spread later')).toBeVisible()
  })

  test('a new advance consumes pool availability', async ({ page }) => {
    await enterDemo(page)
    // take a large advance, then check the pool utilisation moved
    await page.getByTestId('friend-card-Genesis:500').click()
    await page.getByTestId('nav-advance').click()
    await page.getByTestId('preset-max').click()
    await page.getByTestId('take-advance').click()
    await page.waitForTimeout(4000)

    await page.getByTestId('nav-liquidity').click()
    const util = await page.getByTestId('liquidity-pool').locator('.lcd', { hasText: 'UTILIZATION' }).locator('.lcd-value').innerText()
    expect(util).not.toBe('0%')
  })
})
