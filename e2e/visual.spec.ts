import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/**
 * Visual QA capture. Produces a screenshot of every significant state at every
 * required viewport so the result can actually be inspected rather than
 * assumed. Not part of the correctness suite; run with `npx playwright test
 * e2e/visual.spec.ts`.
 */
const OUT = 'screenshots'
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 1000 },
  { name: 'w360', width: 360, height: 800 },
  { name: 'w390', width: 390, height: 844 },
  { name: 'w430', width: 430, height: 932 },
]

test.describe.configure({ mode: 'serial' })

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test(`capture ${vp.name}`, async ({ page }) => {
      mkdirSync(`${OUT}/${vp.name}`, { recursive: true })
      const shot = (n: string) => page.screenshot({ path: `${OUT}/${vp.name}/${n}.png`, fullPage: true })

      // 1. landing
      await page.goto('/')
      await page.waitForTimeout(400)
      await shot('01-landing')

      // 2. dashboard in demo mode
      await page.getByTestId('try-demo').click()
      await page.waitForTimeout(500)
      await shot('02-dashboard')

      // 3. selecting a Friend
      await page.getByTestId('friend-card-Generations:1773').click()
      await page.waitForTimeout(300)
      await shot('03-friend-selected')

      // 4. advance quote
      await page.getByTestId('nav-advance').click()
      await page.getByTestId('preset-max').click()
      await page.waitForTimeout(300)
      await shot('04-advance-quote')

      // 5. settlement scene
      await page.getByTestId('take-advance').click()
      await page.waitForTimeout(2200)
      await shot('05-settlement-scene')

      // 6. advance active, mid settlement
      await page.waitForTimeout(2500)
      await page.getByTestId('simulate-time').click()
      await page.getByTestId('simulate-time').click()
      await page.waitForTimeout(400)
      await shot('06-advance-active')

      // 7. advance settled
      for (let i = 0; i < 8; i += 1) {
        if (await page.getByTestId('advance-settled-banner').isVisible().catch(() => false)) break
        await page.getByTestId('simulate-time').click()
      }
      await page.waitForTimeout(300)
      await shot('07-advance-settled')

      // 8. grow
      await page.getByTestId('nav-grow').click()
      await page.waitForTimeout(400)
      await shot('08-grow')

      // 9. grow financing panel
      const reactivate = page.getByTestId('model-financing-reactivate').first()
      if (await reactivate.count()) {
        await reactivate.click()
      } else {
        await page.getByTestId('model-financing-upgrade').first().click()
      }
      await page.getByTestId('contribution-50').click()
      await page.waitForTimeout(400)
      await shot('09-grow-financing')

      // 10. planner
      await page.getByTestId('nav-dashboard').click()
      await page.getByTestId('friend-card-Generations:77045').click()
      await page.getByTestId('nav-grow').click()
      await page.waitForTimeout(400)
      await shot('10-grow-planner')

      // 11. liquidity
      await page.getByTestId('nav-liquidity').click()
      await page.getByTestId('lp-preset-5000').click()
      await page.getByTestId('lp-provide').click()
      await page.waitForTimeout(400)
      await shot('11-liquidity')

      // 12. how it works
      await page.getByTestId('nav-how').click()
      await page.waitForTimeout(400)
      await shot('12-how-it-works')

      // 13. error state: no wallet
      await page.goto('/')
      await page.getByTestId('strip-connect').click()
      await page.waitForTimeout(2500)
      await shot('13-live-no-wallet')

      expect(true).toBe(true)
    })

    // Live mode against the real chain, using a wallet that demonstrably holds
    // Rare Friends. Skipped unless RA_LIVE is set.
    test(`capture live ${vp.name}`, async ({ page }) => {
      test.skip(!process.env.RA_LIVE, 'set RA_LIVE=1 for live screenshots')
      mkdirSync(`${OUT}/${vp.name}`, { recursive: true })
      const shot = (n: string) => page.screenshot({ path: `${OUT}/${vp.name}/${n}.png`, fullPage: false })
      await page.addInitScript((address) => {
        ;(window as unknown as { ethereum: unknown }).ethereum = {
          request(a: { method: string }) {
            return Promise.resolve(a.method === 'eth_chainId' ? '0x1237' : [address])
          },
          on() {},
          removeListener() {},
        }
      }, '0x60E862CD77aF8F547446a8bc8E5c0F2Cb845Af58')
      await page.goto('/')
      await page.getByTestId('strip-connect').click()
      await page.locator('[data-testid^="friend-card-"]').first().waitFor({ timeout: 90_000 })
      await page.waitForTimeout(4000)
      await shot('14-live-dashboard')
      await page.locator('[data-testid^="friend-card-"]').nth(3).click()
      await page.getByTestId('nav-advance').click()
      await page.waitForTimeout(800)
      await shot('15-live-advance')
    })
  })
}
