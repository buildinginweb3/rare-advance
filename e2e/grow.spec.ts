import { expect, test } from '@playwright/test'
import { enterDemo, watch } from './helpers'

const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''))

test.describe('GROW FLOW', () => {
  test('select an inactive Friend -> Grow -> valid action -> Model Financing -> contribution -> quote -> confirm', async ({
    page,
  }) => {
    const errs = watch(page)
    await enterDemo(page)

    // a permanent but inactive Generation -> the only valid action is REACTIVATE
    await page.getByTestId('friend-card-Generations:77045').click()
    await page.getByTestId('nav-grow').click()
    await expect(page.getByTestId('action-reactivate')).toBeVisible()
    // an inactive Friend must not offer promote or upgrade
    await expect(page.getByTestId('action-promote')).toHaveCount(0)
    await expect(page.getByTestId('action-upgrade')).toHaveCount(0)

    const card = page.getByTestId('action-reactivate')
    await expect(card).toContainText('REACTIVATE')
    await expect(card).toContainText('GEN 4 · INACTIVE → ACTIVE · TIER 0')
    // Gen 4 reactivation is 10 RF (10% of the 100 RF hardwire), base weight 130,
    // 5 RF burned and 5 RF funded
    await expect(card).toContainText('10 RF')
    await expect(card).toContainText('130')
    await expect(card).toContainText('5 RF')

    await page.getByTestId('model-financing-reactivate').click()
    const panel = page.getByTestId('financing-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText(/action cost/i).first()).toBeVisible()

    // 50% contribution: 10 RF cost -> 5 you, 5 financed,
    // 0.25 premium -> 0.2 LP / 0.05 burn, 5.25 repayment target
    await page.getByTestId('contribution-50').click()
    const quote = page.getByTestId('finance-quote')
    await expect(quote).toContainText(/rare advance finances/i)
    await expect(quote).toContainText(/financing premium \(5% of financed\)/i)
    await expect(quote).toContainText('0.25 RF')
    await expect(quote).toContainText('5.25 RF')

    // premium and routing are shown
    await expect(panel).toContainText(/financing premium/i)
    await expect(panel).toContainText(/liquidity providers/i)
    await expect(panel).toContainText(/additional rare advance burn/i)
    await expect(panel).toContainText(/repayment target/i)
    // routing split is shown inside the panel
    await expect(panel).toContainText(/reward routing while financing is outstanding/i)
    await expect(panel).toContainText(/→ financing repayment/i)
    await expect(panel).toContainText(/→ friend owner/i)
    await expect(panel).toContainText(/underlying rare friends action/i)
    // the protocol split and the Rare Advance premium burn are kept separate
    await expect(panel).toContainText(/protocol rf burn \(50% of action cost\)/i)

    // the new weight is shown
    await expect(panel).toContainText(/new reward weight/i)
    await expect(panel).toContainText(/weight increase/i)

    // payback is labelled, never promised
    const payback = page.getByTestId('payback-panel')
    await expect(payback).toBeVisible()
    await expect(payback).toContainText(/modeled payback/i)
    // a small Generation Friend's share can be tiny: never shown as a flat 0%
    const share = await payback.locator('.stat', { hasText: /post-action share/i }).locator('.stat-val').innerText()
    expect(share).not.toBe('0%')
    // and the horizon is readable, never a raw 17-digit day count
    const paybackText = await page.getByTestId('payback-value').innerText()
    expect(paybackText).toMatch(/(>|\d)/)
    // a readable horizon, never a raw 17-digit day count
    expect(paybackText).not.toMatch(/\d{10,}/)

    await page.getByTestId('confirm-finance').click()
    await expect(page.getByTestId('financing-panel')).toHaveCount(0)
    await expect(page.getByText('ACTIVATION FINANCE MODEL ACTIVE')).toBeVisible()
    await expect(page.getByText('SIMULATED FINANCING MODEL RECORDED FOR REACTIVATE')).toBeVisible()

    // simulate time: the Friend keeps earning while financing repays
    for (let i = 0; i < 6; i += 1) {
      if (await page.getByText('FINANCING SETTLED').isVisible().catch(() => false)) break
      await page.getByTestId('simulate-time-grow').click()
    }
    await expect(page.getByTestId('insight-panel')).toContainText('RF FINANCED INTO RARE FRIENDS ACTIONS')

    errs.expectClean()
  })

  test('the Genesis hero example is present and clearly simulated', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('nav-grow').click()
    const hero = page.getByTestId('activation-hero')
    await expect(hero).toBeVisible()
    await expect(hero).toContainText('INACTIVE GENESIS')
    await expect(hero).toContainText('100,000 RF')
    await expect(hero).toContainText('25,000 RF')
    await expect(hero).toContainText('75,000 RF')
    await expect(hero).toContainText('0 → 2,000,000')
    await expect(hero).toContainText('ACTIVATE NOW. PAY FROM FUTURE REWARDS.')
    await expect(hero).toContainText('SIMULATED CONCEPT')
    await expect(hero).toContainText('NO REAL ACTIVATION OR FINANCING OCCURS')
  })

  test('an active Genesis offers no action at all', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('friend-card-Genesis:500').click()
    await page.getByTestId('nav-grow').click()
    await expect(page.getByText('GENESIS IS FULLY WEIGHTED')).toBeVisible()
    await expect(page.getByTestId('action-activate')).toHaveCount(0)
    await expect(page.getByTestId('action-upgrade')).toHaveCount(0)
    await expect(page.getByTestId('action-promote')).toHaveCount(0)
  })

  test('never makes a guaranteed-return claim', async ({ page }) => {
    await enterDemo(page)
    // Disclaimers are stripped first: "not a guaranteed return" is a negation,
    // not a claim, and must not trip the claim check.
    const stripDisclaimers = (t: string) =>
      t
        .replace(/NOT A GUARANTEED RETURN[^.]*\.?/g, '')
        .replace(/NOT GUARANTEED[^.]*\.?/g, '')
        .replace(/NEVER GUARANTEED[^.]*\.?/g, '')
        .replace(/NO GUARANTEED[^.]*\.?/g, '')
    // Banned CLAIM phrases. The word "guaranteed" is allowed only inside an
    // explicit disclaimer such as "not a guaranteed return", which is checked
    // separately below.
    const bannedClaims = [
      'GUARANTEED APY',
      'GUARANTEED YIELD',
      'GUARANTEED RETURN',
      'GUARANTEED PAYBACK',
      'RISK-FREE',
      'RISK FREE',
      'SAFE YIELD',
      'PASSIVE INCOME',
      'UNLOCK REVOLUTIONARY',
      'SYNERGISTIC LIQUIDITY',
      'NEXT-GENERATION DEFI',
    ]
    for (const view of ['dashboard', 'advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${view}`).click()
      const text = stripDisclaimers((await page.locator('body').innerText()).toUpperCase())
      for (const banned of bannedClaims) {
        expect(text, `${view} must not claim ${banned}`).not.toContain(banned)
      }
      // no bare "guaranteed" survives the disclaimer strip
      expect(text, `${view} must not state a guarantee`).not.toContain('GUARANTEED')
    }
  })

  test('any mention of "guaranteed" is a disclaimer, not a claim', async ({ page }) => {
    await enterDemo(page)
    for (const view of ['dashboard', 'advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${view}`).click()
      const text = (await page.locator('body').innerText())
      for (const line of text.split(/\n+/)) {
        const l = line.toUpperCase()
        if (!l.includes('GUARANTEED')) continue
        expect(
          l.includes('NOT A GUARANTEED') || l.includes('NOT GUARANTEED') || l.includes('NEVER GUARANTEED'),
          `"${line}" states a guarantee rather than disclaiming one`,
        ).toBe(true)
      }
    }
  })

  test('a fully self-funded action carries no financing premium', async ({ page }) => {
    await enterDemo(page)
    await page.getByTestId('friend-card-Generations:77045').click()
    await page.getByTestId('nav-grow').click()
    await page.getByTestId('model-financing-reactivate').click()
    // 100% of the cost from the owner
    await page.locator('#grow-bps').fill('100')
    const quote = page.getByTestId('finance-quote')
    await expect(quote).toContainText('0 RF')
    await expect(page.getByTestId('contribution-custom')).toBeVisible()
    const financed = num(await quote.locator('.stat', { hasText: 'Rare Advance finances' }).locator('.stat-val').innerText())
    expect(financed).toBe(0)
  })
})
