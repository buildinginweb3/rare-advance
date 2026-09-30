import { expect, test } from '@playwright/test'
import { enterDemo, watch } from './helpers'

const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''))

test.describe('DEMO FLOW', () => {
  test('landing -> demo -> advance MAX -> quote -> confirm -> simulate time -> settled', async ({ page }) => {
    const errs = watch(page)

    // ---- landing ----
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RARE ADVANCE' })).toBeVisible()
    await expect(page.getByText('Your Friend is already earning.')).toBeVisible()
    await expect(page.getByText("Don't wait to get paid.")).toBeVisible()
    await expect(page.getByTestId('try-demo')).toBeVisible()
    await expect(page.getByTestId('connect-wallet')).toBeVisible()
    await expect(page.getByTestId('hero-how')).toBeVisible()

    // ---- demo ----
    await enterDemo(page)
    await expect(page.getByText('SIMULATED DEMO WALLET').first()).toBeVisible()
    // demo mode must not need any external network at all
    errs.expectNoExternalRequests()

    // ---- select an active, earning Friend ----
    const genesis = page.getByTestId('friend-card-Genesis:500')
    await expect(genesis).toBeVisible()
    await genesis.click()

    // ---- advance ----
    await page.getByTestId('nav-advance').click()
    await expect(page.getByText('GET YOUR RF NOW').first()).toBeVisible()

    // ---- MAX ----
    await page.getByTestId('preset-max').click()
    const quote = page.getByTestId('advance-quote')
    await expect(quote).toBeVisible()

    const settlement = num(await page.getByTestId('quote-settlement').innerText())
    const received = num(await page.getByTestId('quote-receive').innerText())
    const lp = num(await page.getByTestId('quote-lp').innerText())
    const burn = num(await page.getByTestId('quote-burn').innerText())

    expect(settlement).toBeGreaterThan(0)
    // 95% to the holder, 4% LP spread, 1% Rare Advance burn
    expect(received / settlement).toBeCloseTo(0.95, 3)
    expect(lp / settlement).toBeCloseTo(0.04, 3)
    expect(burn / settlement).toBeCloseTo(0.01, 3)
    // the three parts reconcile exactly
    expect(Math.round((received + lp + burn) * 1000) / 1000).toBeCloseTo(settlement, 2)
    expect(await page.getByTestId('quote-duration').innerText()).not.toBe('0m')

    // ---- confirm ----
    await page.getByTestId('take-advance').click()
    await expect(page.getByTestId('settlement-scene')).toBeVisible()
    await expect(page.getByText('ADVANCE ACTIVE')).toBeVisible()
    // the settlement scene must show the split
    await expect(page.getByTestId('settlement-scene').getByText('PRINCIPAL')).toBeVisible()
    await expect(page.getByTestId('settlement-scene').getByText('LP SPREAD')).toBeVisible()
    await expect(page.getByTestId('settlement-scene').getByText('RF BURN')).toBeVisible()

    // let the scene finish
    await page.waitForTimeout(4200)
    await expect(page.getByTestId('settlement-scene')).toHaveCount(0)
    await expect(page.getByTestId('advance-settled')).toContainText('SETTLED 0 /')

    // ---- simulate time until settled ----
    for (let i = 0; i < 10; i += 1) {
      if (await page.getByTestId('advance-settled-banner').isVisible().catch(() => false)) break
      await page.getByTestId('simulate-time').click()
    }
    await expect(page.getByTestId('advance-settled-banner')).toBeVisible()
    await expect(page.getByTestId('advance-settled-banner')).toContainText('SETTLED')
    await expect(page.getByTestId('advance-settled')).toContainText('SETTLED')

    // the session insight reflects the advance
    const insight = page.getByTestId('insight-panel')
    await expect(insight).toBeVisible()
    await expect(insight).toContainText('THIS SESSION · SIMULATED')

    errs.expectClean()
  })

  test('25% / 50% / 75% presets scale the quote below MAX', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('friend-card-Genesis:500').click()
    await page.getByTestId('nav-advance').click()
    await page.getByTestId('preset-max').click()
    const read = async () => num(await page.getByTestId('quote-settlement').innerText())
    const max = await read()
    for (const [label, ratio] of [
      ['25', 0.25],
      ['50', 0.5],
      ['75', 0.75],
      ['max', 1],
    ] as const) {
      await page.getByTestId(`preset-${label}`).click()
      const v = await read()
      expect(v / max, `preset ${label}`).toBeCloseTo(ratio, 2)
    }
  })

  test('a Friend with no attributable stream cannot be advanced', async ({ page }) => {
    await enterDemo(page)
    // the inactive Gen 3 has weight 0, so nothing is attributable to it
    await page.getByTestId('friend-card-Generations:77045').click()
    await page.getByTestId('nav-advance').click()
    await expect(page.getByTestId('take-advance')).toHaveCount(0)
    await expect(page.getByText('GO TO GROW')).toBeVisible()
  })

  test('Demo Mode never shows a LIVE provenance badge anywhere', async ({ page }) => {
    await enterDemo(page)
    const strip = page.getByTestId('status-strip')
    await expect(strip).toContainText('SIMULATED DEMO WALLET')
    await expect(strip).toContainText('NO REAL NFT OR RF')

    // The single most important honesty rule: nothing in Demo Mode may be
    // badged as LIVE onchain or LIVE OpenSea data. Official protocol constants
    // are allowed, but they carry the distinct PROTOCOL · VERIFIED badge.
    for (const view of ['dashboard', 'advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${view}`).click()
      await page.waitForTimeout(150)
      const liveBadges = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.badge'))
          .filter((b) => b.getAttribute('data-provenance') === 'onchain' || b.getAttribute('data-provenance') === 'opensea')
          .map((b) => (b.textContent ?? '').trim()),
      )
      expect(liveBadges, `${view} shows live-provenance badges in Demo Mode`).toEqual([])
    }
  })

  test('device and friend cards show correctly formatted compact figures', async ({ page }) => {
    await enterDemo(page)
    const device = page.getByTestId('device')
    const text = await device.innerText()
    // compact figures must never collapse to "0K" / "0B"
    expect(text).not.toMatch(/\b0(K|M|B|T)\b/)
    expect(text).toMatch(/CLAIMABLE [\d.,]+[KMB]?/)
    expect(text).toMatch(/TOTAL ACTIVE W [\d.,]+[KMB]?/)
    // the selected Friend's weight is shown in the top LCD
    expect(text).toContain('2,000,000')
    expect(text).toContain('reward weight · SIMULATED')
  })
})
