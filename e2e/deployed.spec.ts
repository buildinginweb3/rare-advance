import { expect, test } from '@playwright/test'
import { enterDemo } from './helpers'

/**
 * Verifies the PUBLIC deployment from a clean browser session, on a real
 * remote origin. Not part of the offline suite: run it explicitly.
 *
 *   RA_DEPLOYED=<url> npx playwright test e2e/deployed.spec.ts
 */
const BASE = (process.env.RA_DEPLOYED ?? '').replace(/\/$/, '')

test.describe('PUBLIC DEPLOYMENT', () => {
  test.skip(!BASE, 'set RA_DEPLOYED=<url> to verify the deployed demo')

  test('the deployed demo works end to end with no wallet and no proxy', async ({ page }) => {
    const consoleErrors: string[] = []
    const failed: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))
    page.on('requestfailed', (r) => {
      // favicon noise is not an app fault
      if (!/favicon/.test(r.url())) failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`)
    })

    await page.goto(`${BASE}/`)
    await expect(page.getByTestId('landing')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('RARE ADVANCE')
    await expect(page.getByText(/Your Friend is already earning/i)).toBeVisible()

    // Demo Mode must work on a static host with no server-side proxy
    await enterDemo(page, `${BASE}/`)
    await expect(page.getByTestId('friend-hero')).toBeVisible()

    // 1. competing pool offers, internally consistent
    await page.getByTestId('home-primary').click()
    const offers = page.getByTestId('offers')
    await expect(offers.locator('> button').first()).toBeVisible()
    const first = ((await offers.locator('> button').first().textContent()) ?? '').replace(/\s+/g, ' ')
    const now = Number(/YOU GET NOW([\d,.]+)/i.exec(first)?.[1]?.replace(/,/g, '') ?? '0')
    const settle = Number(/SETTLEMENT([\d,.]+)/i.exec(first)?.[1]?.replace(/,/g, '') ?? '0')
    expect(settle).toBeGreaterThan(0)
    // the holder always receives less than the stream settles for
    expect(now / settle).toBeLessThan(1)

    // 2. taking the advance and paying it back
    await offers.locator('> button').first().click()
    await page.getByTestId('take-advance').click()
    await page.getByTestId('confirm-advance').click()
    await expect(page.getByTestId('advance-active')).toBeVisible()
    await page.getByTestId('repay-pay-off').click()
    await page.getByTestId('repay-submit').click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('advance-payoff-quote')).toHaveCount(0)

    // 3. joining a pool with simulated RF
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('pool-row-pool-default').click()
    await page.getByTestId('contribute-custom').fill('25000')
    await page.getByTestId('contribute-submit').click()
    await expect(page.getByTestId('lp-table')).toContainText('25,000')

    // 4. the pool market agrees with itself
    await page.getByTestId('close-pool-detail').click()
    await expect(page.getByTestId('market-pool-count')).toContainText('5')
    await expect(page.getByTestId('market-available')).toContainText('269,000 RF')

    // No console errors and no failed requests
    expect(consoleErrors, consoleErrors.join(' | ')).toEqual([])
    expect(failed, failed.join(' | ')).toEqual([])
  })

  test('the deployed demo degrades honestly with no proxy and no wallet', async ({ page }) => {
    await page.goto(`${BASE}/`)
    // No wallet is installed here, so the app must say exactly that rather than
    // spinning on "looking for a wallet" or implying a connection.
    const strip = page.getByTestId('status-strip')
    await expect(strip).toContainText(/no browser wallet detected/i, { timeout: 30_000 })
    await expect(strip).toContainText(/TRY DEMO/i)

    // and the whole product still works with no wallet and no proxy at all
    await page.getByTestId('strip-demo').click()
    await expect(page.getByTestId('friend-hero')).toBeVisible()
    await page.getByTestId('nav-liquidity').click()
    await expect(page.getByTestId('market-pool-count')).toContainText('5')
    await page.getByTestId('pool-row-pool-default').click()
    await page.getByTestId('contribute-custom').fill('25000')
    await page.getByTestId('contribute-submit').click()
    await expect(page.getByTestId('lp-table')).toContainText('25,000')
  })

  test('the deployed demo has no horizontal overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto(`${BASE}/`)
    await enterDemo(page, `${BASE}/`)
    for (const view of ['dashboard', 'advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${view}`).click()
      await page.waitForTimeout(120)
      const o = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
      }))
      expect(o.s, `${view} overflows at 360px on the deployed build`).toBeLessThanOrEqual(o.c + 1)
    }
  })
})
