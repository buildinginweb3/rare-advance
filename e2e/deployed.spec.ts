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
    await expect(page.getByRole('heading', { name: 'RARE ADVANCE' })).toBeVisible()
    await expect(page.getByText('Your Friend is already earning.')).toBeVisible()

    // Demo Mode must work on a static host with no server-side proxy
    await enterDemo(page)
    await expect(page.getByTestId('device')).toBeVisible()

    // the whole primary interaction works
    await page.getByTestId('friend-card-Genesis:500').click()
    await page.getByTestId('nav-advance').click()
    await page.getByTestId('preset-max').click()
    const settlement = Number(/([\d,.]+)/.exec(await page.getByTestId('quote-settlement').innerText())![1]!.replace(/,/g, ''))
    const received = Number(/([\d,.]+)/.exec(await page.getByTestId('quote-receive').innerText())![1]!.replace(/,/g, ''))
    expect(settlement).toBeGreaterThan(0)
    expect(received / settlement).toBeCloseTo(0.95, 3)

    await page.getByTestId('take-advance').click()
    await expect(page.getByTestId('settlement-scene')).toBeVisible()
    await page.waitForTimeout(4200)
    for (let i = 0; i < 8; i += 1) {
      if (await page.getByTestId('advance-settled-banner').isVisible().catch(() => false)) break
      await page.getByTestId('simulate-time').click()
    }
    await expect(page.getByTestId('advance-settled-banner')).toBeVisible()

    // Grow financing works
    await page.getByTestId('nav-dashboard').click()
    await page.getByTestId('friend-card-Generations:77045').click()
    await page.getByTestId('nav-grow').click()
    await page.getByTestId('model-financing-reactivate').click()
    await expect(page.getByTestId('finance-quote')).toBeVisible()
    await page.getByTestId('confirm-finance').click()
    await expect(page.getByText('ACTIVATION FINANCE MODEL ACTIVE')).toBeVisible()

    // Liquidity works
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('lp-preset-10000').click()
    await page.getByTestId('lp-provide').click()
    await expect(page.getByTestId('lp-user-position')).toBeVisible()

    // No console errors and no failed requests
    expect(consoleErrors, consoleErrors.join(' | ')).toEqual([])
    expect(failed, failed.join(' | ')).toEqual([])
  })

  test('the deployed demo degrades honestly with no proxy and no wallet', async ({ page }) => {
    await page.goto(`${BASE}/`)
    // There is no server-side proxy on a static host, so the first-party index
    // path fails. That must produce an honest error with Retry + Demo Mode, and
    // the onchain Genesis sweep must still work where it can.
    await page.getByTestId('strip-connect').click()
    const strip = page.getByTestId('status-strip')
    await expect(strip).toContainText(/no eip-1193|not on robinhood|unavailable|unreachable|no rare friends/i, {
      timeout: 90_000,
    })
    await page.getByTestId('strip-demo').click()
    await expect(page.getByTestId('friend-card-Genesis:500')).toBeVisible()
  })

  test('the deployed demo has no horizontal overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto(`${BASE}/`)
    await enterDemo(page)
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
