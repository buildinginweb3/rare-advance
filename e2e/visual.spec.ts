import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/**
 * Visual QA capture. Produces a screenshot of every significant state at every
 * required viewport so the result can actually be inspected rather than
 * assumed. Not part of the correctness suite; run it with
 *
 *   RA_VISUAL=1 npx playwright test e2e/visual.spec.ts
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
      const step = async (n: string, ms = 400) => {
        await page.waitForTimeout(ms)
        await shot(n)
      }

      // 01 the landing: one idea, two buttons, three steps
      await page.goto('/')
      await step('01-landing')

      // 02 the holder home, one Friend and one next step
      await page.getByTestId('try-demo').click()
      await step('02-home')

      // 03 the Friend switcher
      await page.getByTestId('open-friend-switcher').click()
      await step('03-friends', 300)
      // pick a Generation so Grow has something to finance
      await page.locator('[data-testid^="switcher-Generations:"]').first().click()
      await step('04-friend-selected', 400)

      // 04 the competing pool offers
      await page.getByTestId('home-primary').click()
      await step('05-advance-offers')

      // 05 the confirmation sheet, stating the exact split
      await page.getByTestId('offers').locator('> button').first().click()
      await page.getByTestId('take-advance').click()
      await step('06-advance-confirm', 300)
      await page.getByTestId('confirm-advance').click()
      await step('07-advance-active', 500)

      // 06 partial repayment
      await page.getByTestId('repay-25').click()
      await page.getByTestId('repay-submit').click()
      await step('08-advance-part-repaid', 500)

      // 07 the Growth action list
      await page.getByTestId('nav-grow').click()
      await step('09-grow')

      // 08 the Growth financing comparison
      const explore = page.locator('[data-testid^="explore-financing-"]').first()
      if (await explore.count()) {
        await explore.click()
        await step('10-grow-offers', 400)
      }

      // 09 the pool market
      await page.getByTestId('nav-liquidity').click()
      await step('11-market')

      // 10 a pool's terms, in plain words
      await page.getByTestId('pool-row-pool-default').click()
      await step('12-pool-detail', 400)

      // 11 the pool creation wizard, review step
      await page.getByTestId('close-pool-detail').click()
      await page.getByTestId('open-create-pool').click()
      for (const _ of [0, 1, 2, 3, 4]) {
        await page.getByTestId('wizard-next').click()
        await page.waitForTimeout(180)
      }
      await step('13-pool-wizard-review', 300)
      await page.getByTestId('wizard-cancel').click()

      // 12 how it works
      await page.getByTestId('nav-how').click()
      await step('14-how-it-works')

      // 13 honest failure: no wallet installed
      await page.goto('/')
      await page.waitForTimeout(1800)
      await step('15-no-wallet')

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
      await page.getByTestId('friend-hero').waitFor({ timeout: 90_000 })
      await page.waitForTimeout(4000)
      await shot('16-live-home')
    })
  })
}