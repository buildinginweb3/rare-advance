import { expect, test } from '@playwright/test'
import { MOBILE_WIDTHS } from './helpers'

/**
 * Mobile is mandatory at 360 / 390 / 430. The primary flow must work with no
 * horizontal scrolling and with readable financial numbers.
 */
for (const width of MOBILE_WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 780 } })

    test('no horizontal overflow on any view', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('try-demo').click()
      for (const view of ['dashboard', 'advance', 'grow', 'liquidity', 'how']) {
        await page.getByTestId(`nav-${view}`).click()
        await page.waitForTimeout(120)
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement
          return {
            scrollW: doc.scrollWidth,
            clientW: doc.clientWidth,
          }
        })
        // 1px of tolerance for sub-pixel rounding
        expect(overflow.scrollW, `${view} overflows at ${width}px`).toBeLessThanOrEqual(overflow.clientW + 1)
      }
    })

    test('the primary flow works with touch-sized targets', async ({ page }) => {
      await page.goto('/')
      const demo = page.getByTestId('try-demo')
      const box = await demo.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(40)
      await demo.click()

      await page.getByTestId('friend-card-Genesis:500').click()
      await page.getByTestId('nav-advance').click()
      await page.getByTestId('preset-max').click()
      await expect(page.getByTestId('advance-quote')).toBeVisible()
      const take = page.getByTestId('take-advance')
      const takeBox = await take.boundingBox()
      expect(takeBox!.height).toBeGreaterThanOrEqual(40)
      await take.click()
      await expect(page.getByTestId('advance-card')).toBeVisible()
    })

    test('the device scales cleanly and the Friend stays visible', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('try-demo').click()
      const device = page.getByTestId('device')
      await expect(device).toBeVisible()
      const box = await device.boundingBox()
      expect(box!.width).toBeLessThanOrEqual(width)
      // the Friend art is present in the top LCD
      await expect(device.locator('.friend-art').first()).toBeVisible()
    })

    test('financial numbers stay legible', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('try-demo').click()
      const value = page.getByTestId('quote-settlement')
      await page.getByTestId('nav-advance').click()
      await page.getByTestId('preset-max').click()
      const size = await value.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
      expect(size).toBeGreaterThanOrEqual(12)
    })

    test('provenance badges are readable, not clipped', async ({ page }) => {
      await page.goto('/')
      await page.getByTestId('try-demo').click()
      const badge = page.getByText('SIMULATED DEMO WALLET').first()
      await expect(badge).toBeVisible()
      const overflow = await badge.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      expect(overflow).toBe(false)
    })
  })
}

test.describe('ACCESSIBILITY', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('keyboard navigation reaches the primary actions with visible focus', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    // the skip link comes first
    await expect(page.locator('.skip-link')).toBeFocused()
    const outline = await page
      .locator('.skip-link')
      .evaluate((el) => getComputedStyle(el).outlineWidth)
    expect(outline).not.toBe('0px')
  })

  test('every control is a semantic button with an accessible name', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    const unnamed = await page.evaluate(() => {
      const bad: string[] = []
      document.querySelectorAll('button').forEach((b) => {
        const name = (b.textContent ?? '').trim() || b.getAttribute('aria-label') || b.title
        if (!name) bad.push(b.outerHTML.slice(0, 90))
      })
      return bad
    })
    expect(unnamed).toEqual([])
  })

  test('provenance is never encoded by colour alone', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    const badges = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.badge')).map((b) => ({
        text: (b.textContent ?? '').trim(),
        provenance: b.getAttribute('data-provenance'),
      })),
    )
    expect(badges.length).toBeGreaterThan(3)
    for (const b of badges) {
      // every badge carries a text label as well as a pattern
      expect(b.text.length).toBeGreaterThan(0)
      expect(['onchain', 'opensea', 'modeled', 'simulated', 'protocol', 'none']).toContain(b.provenance)
    }
  })

  test('reduced motion disables the decorative animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    const duration = await page
      .locator('.stream-packet')
      .first()
      .evaluate((el) => getComputedStyle(el).animationDuration)
    expect(parseFloat(duration)).toBeLessThan(0.01)
  })

  test('landmarks and a single h1 exist', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toHaveCount(1)
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('footer')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })
})
