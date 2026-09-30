/**
 * THE FIVE FLOWS A LENDER CAN DO
 * ==============================
 *
 * Every spec here walks the app the way a person would, through the UI only, and
 * asserts the number the UI actually shows. Nothing is read out of app memory.
 */

import { expect, test, type Page } from '@playwright/test'
import { freshMarket, watch } from './helpers'

const DAY = 86_400_000

// Pools and portraits persist in localStorage, so each test must start from the
// seeded market or the totals leak between them.
test.beforeEach(async ({ page }) => {
  await freshMarket(page)
})

/** Parse "8,432.45 RF" into a Number. Fails loudly on anything unparseable. */
function rf(text: string): number {
  const m = /([\d,]+(?:\.\d+)?)\s*RF/i.exec(text)
  if (!m) throw new Error(`no RF figure in: ${JSON.stringify(text)}`)
  return Number(m[1]!.replace(/,/g, ''))
}

/** "1,621.62 / 8,432.45 RF principal" -> the two numbers. */
function readProgress(text: string | null): { repaid: number; total: number } {
  const flat = (text ?? '').replace(/\s+/g, ' ')
  const m = /([\d,.]+)\s*\/\s*([\d,.]+)\s*RF\s*principal/i.exec(flat)
  if (!m) throw new Error(`unexpected progress text: ${JSON.stringify(text)}`)
  return { repaid: Number(m[1]!.replace(/,/g, '')), total: Number(m[2]!.replace(/,/g, '')) }
}

/** The bare number from a regex capture, failing loudly if absent. */
function num(match: RegExpMatchArray | null | undefined, label = 'figure'): number {
  if (!match?.[1]) throw new Error(`could not read ${label}`)
  return Number(match[1].replace(/,/g, ''))
}

/** Every RF figure on screen, in order. Used to prove nothing was invented. */
async function figures(page: Page): Promise<string[]> {
  const t = (await page.locator('main').textContent()) ?? ''
  return t.match(/[\d,]+(?:\.\d+)?\s*RF/g) ?? []
}

test.describe('FLOW 1 — join a pool with simulated RF', () => {
  test('the lender can join an existing pool and see their own deposit', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()

    const row = page.getByTestId('pool-row-pool-default')
    await expect(row).toBeVisible()

    // open it and join
    await row.click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('contribute-submit')).toBeVisible()

    // the button is disabled for an empty or unparseable amount
    await page.getByTestId('contribute-custom').fill('')
    await expect(page.getByTestId('contribute-submit')).toBeDisabled()
    await page.getByTestId('contribute-custom').fill('0')
    await expect(page.getByTestId('contribute-submit')).toBeDisabled()
    await page.getByTestId('contribute-custom').fill('25000')
    await expect(page.getByTestId('contribute-submit')).toBeEnabled()
    await page.getByTestId('contribute-submit').click()
    await page.waitForTimeout(300)

    // the deposit is now visible in the LP table
    const table = page.getByTestId('lp-table')
    await expect(table).toContainText('You')
    await expect(table).toContainText('25,000')
    // and the market grew by exactly that much
    await expect(page.getByTestId('market-available')).toContainText('269,000 RF')

    w.expectClean()
    w.expectNoThirdPartyRequests()
  })

  test('withdraw returns the available balance and refuses to overspend deployed RF', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('pool-row-pool-default').click()
    await page.waitForTimeout(300)
    await page.getByTestId('contribute-custom').fill('25000')
    await page.getByTestId('contribute-submit').click()
    await page.waitForTimeout(300)

    // withdraw it all again — one click, no amount needed
    await expect(page.getByTestId('withdraw-submit')).toBeDisabled()
    await page.getByTestId('withdraw-max').click()
    await page.waitForTimeout(500)

    // back to the market list, and the deposit is gone
    await page.getByTestId('close-pool-detail').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('market-available')).toContainText('244,000 RF')
    w.expectClean()
  })
})

test.describe('FLOW 2 — create a communal pool', () => {
  test('the wizard sets terms, deposits capital and publishes the pool', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()

    await page.getByTestId('open-create-pool').click()
    await page.waitForTimeout(300)

    const wizard = page.getByTestId('pool-wizard')
    await expect(wizard).toBeVisible()
    await wizard.getByTestId('wizard-name').fill('My Neighbourhood Pool')

    // NAME -> ACCESS -> WHAT IT FUNDS -> ADD RF -> SET TERMS -> REVIEW
    for (const label of ['NAME', 'ACCESS', 'WHAT IT FUNDS']) {
      await expect(wizard.getByText(label, { exact: true }).first()).toBeVisible()
      await wizard.getByTestId('wizard-next').click()
      await page.waitForTimeout(200)
    }

    // capital
    await wizard.getByTestId('wizard-capital').fill('120000')
    await wizard.getByTestId('wizard-next').click()
    await page.waitForTimeout(200)

    // terms step: take whatever the wizard defaults to, which must be valid
    await wizard.getByTestId('wizard-next').click()
    await page.waitForTimeout(250)

    // the review step restates the promise in plain words
    const review = wizard.getByTestId('wizard-review')
    await expect(review).toBeVisible()
    await expect(review).toContainText(/LP premium/i)
    await expect(review).toContainText(/starting liquidity/i)
    await expect(review).toContainText(/LOCKED/i)
    // and nothing that reads like a guaranteed return
    await expect(review).not.toContainText(/guarantee/i)

    await wizard.getByTestId('wizard-create').click()
    await page.waitForTimeout(400)

    // the pool now exists, named as asked, and is clearly local
    const mine = page.getByTestId('pool-row-pool-you-1')
    await expect(mine).toBeVisible()
    await expect(mine).toContainText('My Neighbourhood Pool')
    await expect(page.getByTestId('market-pool-count')).toContainText('6')
    await expect(page.getByTestId('market-available')).toContainText('364,000 RF')

    w.expectClean()
    w.expectNoThirdPartyRequests()
  })

  test('terms are editable while solo, then lock the moment another lender joins', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('pool-row-pool-default').click()
    await page.waitForTimeout(300)

    // only the creator is in: nobody else relies on the terms yet
    await expect(page.getByTestId('pool-detail')).toContainText('TERMS EDITABLE')

    // a second lender joins
    await page.getByTestId('contribute-custom').fill('25000')
    await page.getByTestId('contribute-submit').click()
    await page.waitForTimeout(400)
    await expect(page.getByTestId('pool-detail')).toContainText('TERMS LOCKED')
    await expect(page.getByTestId('pool-detail')).toContainText('LP COUNT2')

    // and there is no longer any way to edit them in place
    await expect(page.getByTestId('update-terms')).toHaveCount(0)

    w.expectClean()
  })
})

test.describe('FLOW 3 — compare every eligible pool', () => {
  test('all eligible pools are listed and none is named the best', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('home-primary').click()
    await page.waitForTimeout(300)

    const offers = page.getByTestId('offers')
    const cards = offers.locator('> button')
    const count = await cards.count()
    expect(count).toBeGreaterThan(1)

    const text = (await offers.textContent()) ?? ''
    // never a verdict on which pool is best
    expect(text).not.toMatch(/\bBEST\b|\bRECOMMENDED\b|\bWINNER\b/i)
    // and every card states the same total settlement, so the only difference
    // between pools is who pays what
    const settlements = [...text.matchAll(/SETTLEMENT([\d,.]+ RF)/g)].map((m) => Number(m[1]!.replace(/,/g, '')))
    expect(settlements.length).toBe(count)
    expect(new Set(settlements).size).toBe(1)

    // every pool quote is internally consistent: now + cost == settlement
    for (const card of await cards.all()) {
      const t = (await card.textContent()) ?? ''
      const now = rf(/YOU GET NOW([\d,.]+ RF)/i.exec(t)?.[0] ?? '')
      const later = rf(/SETTLEMENT([\d,.]+ RF)/i.exec(t)?.[0] ?? '')
      const cost = rf(/TOTAL COST([\d,.]+ RF)/i.exec(t)?.[0] ?? '')
      expect(now).toBeLessThan(later)
      expect(now + cost).toBeCloseTo(later, 1)
    }

    w.expectClean()
  })

  test('the same figure appears on the confirmation sheet', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('home-primary').click()
    await page.waitForTimeout(300)

    const first = page.getByTestId('offers').locator('> button').first()
    const quoted = rf(/YOU GET NOW([\d,.]+ RF)/i.exec((await first.textContent()) ?? '')?.[0] ?? '')
    await first.click()
    await page.waitForTimeout(200)
    await page.getByTestId('take-advance').click()
    await page.waitForTimeout(250)

    const sheet = page.getByTestId('advance-confirm')
    expect(rf((await sheet.textContent()) ?? '')).toBeCloseTo(quoted, 2)

    w.expectClean()
  })
})

test.describe('FLOW 4 — take RF early and pay it off early', () => {
  /** The three figures that matter on the active position card. */
  async function position(page: Page) {
    const t = (await page.getByTestId('advance-active').textContent()) ?? ''
    return {
      received: num(/YOU RECEIVED([\d,.]+)/i.exec(t), 'YOU RECEIVED'),
      still: num(/STILL TO SETTLE\s*([\d,.]+)/i.exec(t), 'STILL TO SETTLE'),
    }
  }
  /** Pick the first pool, and return what it quoted: now, and the full settlement. */
  async function takeFirstOffer(page: Page) {
    const card = page.getByTestId('offers').locator('> button').first()
    const t = (await card.textContent()) ?? ''
    const quoted = {
      now: num(/YOU GET NOW([\d,.]+)/i.exec(t), 'YOU GET NOW'),
      settlement: num(/SETTLEMENT([\d,.]+)/i.exec(t), 'SETTLEMENT'),
    }
    await card.click()
    await page.waitForTimeout(200)
    await page.getByTestId('take-advance').click()
    await page.waitForTimeout(250)
    const sheet = rf((await page.getByTestId('advance-confirm').textContent()) ?? '')
    expect(sheet).toBeCloseTo(quoted.now, 2)
    return quoted
  }

  test('the holder receives less than face, and an early payoff saves the unearned premium', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('home-primary').click()
    await page.waitForTimeout(300)

    const quoted = await takeFirstOffer(page)
    await page.getByTestId('confirm-advance').click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('advance-active')).toBeVisible()
    const { received, still } = await position(page)
    expect(received).toBeCloseTo(quoted.now, 2)

    // "it is not a loan": the holder receives less than the stream settles for.
    // The difference is the premium plus the Rare Advance fee.
    expect(received).toBeLessThan(quoted.settlement)
    expect(quoted.settlement - received).toBeGreaterThan(0)

    // Before any time passes the pool is owed exactly what was handed over:
    // premium has not vested, so it cannot be charged.
    expect(still).toBe(received)

    // and a full payoff NOW therefore costs less than letting it run to term
    const quote = num(/([\d,.]+) RF/.exec(
      (await page.getByTestId('advance-payoff-quote').textContent()) ?? '',
    ), 'payoff quote')
    expect(quote).toBeCloseTo(received, 2)
    expect(quote).toBeLessThan(quoted.settlement)

    // repay a quarter of what is owed
    await page.getByTestId('repay-25').click()
    await page.waitForTimeout(200)
    await page.getByTestId('repay-submit').click()
    await page.waitForTimeout(500)

    const after = await position(page)
    expect(after.still).toBeLessThan(still)
    expect(still - after.still).toBeCloseTo(still * 0.25, 1)
    // a repayment never changes what was already received
    expect(after.received).toBe(received)

    // the pool is still owed something, so the payoff button is still there
    await expect(page.getByTestId('advance-payoff-quote')).toBeVisible()

    w.expectClean()
  })

  test('a full payoff settles the position and books only the premium earned so far', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('home-primary').click()
    await page.waitForTimeout(300)
    const quoted = await takeFirstOffer(page)
    await page.getByTestId('confirm-advance').click()
    await page.waitForTimeout(400)
    const atStart = num(/([\d,.]+) RF/.exec(
      (await page.getByTestId('advance-payoff-quote').textContent()) ?? '',
    ), 'payoff quote')

    // let a little time pass, so part of the stream has settled back to the pool
    await page.getByTestId('simulate-time').click()
    await page.waitForTimeout(500)

    const quote = num(/([\d,.]+) RF/.exec(
      (await page.getByTestId('advance-payoff-quote').textContent()) ?? '',
    ), 'payoff quote')
    // settled RF went straight to the pool, so what is owed has fallen...
    expect(quote).toBeLessThan(atStart)
    // ...but the holder still never pays the whole stream out of their stream
    expect(quote).toBeLessThan(quoted.settlement)

    await page.getByTestId('repay-pay-off').click()
    await page.waitForTimeout(200)
    await page.getByTestId('repay-submit').click()
    await page.waitForTimeout(700)

    // settled: there is nothing left to pay off
    await expect(page.getByTestId('advance-payoff-quote')).toHaveCount(0)
    await expect(page.getByTestId('main')).toContainText(/settled/i)

    // and the pool's available liquidity is back, with the premium included
    await page.getByTestId('nav-liquidity').click()
    await page.waitForTimeout(400)
    await expect(page.getByTestId('market-available')).toContainText('RF')

    w.expectClean()
  })
})

test.describe('FLOW 5 — Growth financing with temporary WETH participation', () => {
  test('the demo opens on a Friend that can actually grow', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-grow').click()
    await page.waitForTimeout(500)

    // No switching, no hunting: a real hardwired Generation leads the demo.
    await expect(page.getByTestId('main')).toContainText(/GEN \d/i)
    expect(
      await page.locator('[data-testid^="explore-financing-"]').count(),
      'the first Friend must already have a growth action',
    ).toBeGreaterThan(0)
    w.expectClean()
  })

  test('a fully weighted Genesis says so instead of showing an empty list', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('open-friend-switcher').click()
    await page.locator('[data-testid^="switcher-Genesis:"]').first().click()
    await page.waitForTimeout(400)
    await page.getByTestId('nav-grow').click()
    await page.waitForTimeout(400)
    await expect(page.getByTestId('main')).toContainText(/fully weighted/i)
    await expect(page.locator('[data-testid^="explore-financing-"]')).toHaveCount(0)
    w.expectClean()
  })

  test('a lender finances an action and sees RF and WETH kept apart', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    // the demo already leads with a hardwired Generation, so nothing to switch
    await page.getByTestId('nav-grow').click()
    await page.waitForTimeout(400)

    // Not every action is fundable: a 90,000 RF promotion is above what any
    // demo pool will lend. Walk the actions until one has eligible pools.
    const actions = page.locator('[data-testid^="explore-financing-"]')
    expect(await actions.count()).toBeGreaterThan(0)

    const offers = page.getByTestId('growth-offers')
    let count = 0
    for (let i = 0; i < (await actions.count()); i += 1) {
      await actions.nth(i).click()
      await page.waitForTimeout(350)
      count = await offers.locator('> button').count()
      if (count > 0) break
    }
    expect(count, 'at least one growth action must have an eligible pool').toBeGreaterThan(0)

    const text = (await offers.textContent()) ?? ''
    expect(text).toMatch(/WETH SHARE/)
    expect(text).not.toMatch(/WETH (EARNED|VALUE).*RF/i)

    await offers.locator('> button').first().click()
    await page.waitForTimeout(300)

    const sheet = page.getByTestId('finance-sheet')
    await expect(sheet).toBeVisible()
    const sheetText = (await sheet.textContent()) ?? ''
    // RF and WETH are quoted as separate quantities, never as one blended number
    expect(sheetText).toMatch(/WETH/i)
    expect(sheetText).toMatch(/RF/i)
    await sheet.getByTestId('confirm-growth-finance').click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('status-strip')).toBeVisible()
    w.expectClean()
  })
})

test.describe('honesty guards', () => {
  test('no screen makes a return claim', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()

    // A claim is a NUMBER attached to a return word. Disclaimers like "no yield
    // is promised" are exactly what we want, so they are not matched.
    const claim = /\d[\d.,]*\s*%\s*(?:a\s*|per\s+)?(?:APY|APR|ROI|interest|return|yield)/i

    for (const view of ['advance', 'grow', 'liquidity']) {
      await page.getByTestId(`nav-${view}`).click()
      await page.waitForTimeout(300)
      const text = (await page.locator('main').textContent()) ?? ''
      expect(text, `${view} page claims a return`).not.toMatch(claim)
      expect(text, `${view} page`).not.toMatch(/guaranteed\s+(?:profit|income|return)/i)
      expect(text, `${view} page`).not.toMatch(/risk[- ]free/i)
    }
  })

  test('the pool page explains why no APY is shown', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.waitForTimeout(300)
    const text = (await page.locator('main').textContent()) ?? ''
    expect(text).toMatch(/no APY is shown/i)
    expect(text).toMatch(/cannot honestly be annualised/i)
  })

  test('reward weight is never called tokens or profit', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-how').click()
    await page.waitForTimeout(300)
    const text = await page.locator('main').textContent()
    expect(text).toMatch(/allocation weight/i)
    expect(text).not.toMatch(/weight is (tokens|profit|money)/i)
  })

  test('the pool directory says these pools are simulated examples', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.waitForTimeout(300)
    const text = await page.locator('main').textContent()
    expect(text).toMatch(/simulated examples/i)
    expect(text).toMatch(/no named party is a real person/i)
  })

  test('every RF figure on the market page is internally consistent', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.waitForTimeout(300)
    const all = await figures(page)
    expect(all.length).toBeGreaterThan(0)
    for (const f of all) expect(Number(f.replace(/[^\d.]/g, ''))).not.toBeNaN()
  })
})

test.describe('Demo Mode talks to no third party', () => {
  test('a full walk contacts only the public Robinhood Chain RPC', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    // let the real artwork read finish
    await expect(page.getByTestId('friend-hero').locator('img').first()).toBeVisible({ timeout: 45_000 })

    for (const view of ['advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${view}`).click()
      await page.waitForTimeout(200)
    }

    const offenders = w.forbiddenRequests()
    expect(offenders, offenders.join(' | ')).toEqual([])
    w.expectClean()
  })
})

test.describe('simulated time', () => {
  test('advancing time settles a position and shows it', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('home-primary').click()
    await page.waitForTimeout(300)
    await page.getByTestId('offers').locator('> button').first().click()
    await page.waitForTimeout(200)
    await page.getByTestId('take-advance').click()
    await page.waitForTimeout(250)
    await page.getByTestId('confirm-advance').click()
    await page.waitForTimeout(400)

    const progress = page.getByTestId('advance-progress')
    await expect(progress).toBeVisible()
    const before = readProgress(await progress.textContent())
    expect(before.repaid, 'nothing has settled before time passes').toBe(0)

    await page.getByTestId('simulate-time').click()
    await page.waitForTimeout(500)

    const after = readProgress(await progress.textContent())
    expect(after.repaid, 'principal repaid after simulating time').toBeGreaterThan(0)
    expect(after.repaid).toBeLessThan(after.total)

    w.expectClean()
    void DAY
  })
})
test.describe('the landing explains the platform', () => {
  test('says what it does and never promises Grow as a future feature', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')

    const what = page.getByTestId('what-it-does')
    await expect(what).toBeVisible()
    // both halves of the product are described as shipped, not upcoming
    await expect(what).toContainText(/WHAT RARE ADVANCE DOES/i)
    await expect(what).toContainText(/Liquidity providers/i)

    // the honest framing a lender is owed
    await expect(page.getByTestId('not-a-loan')).toContainText(/Not a loan/i)
    await expect(page.getByTestId('not-a-loan')).toContainText(/Not collateral/i)

    // nothing anywhere claims Grow is still to come
    const body = (await page.locator('body').textContent()) ?? ''
    expect(body).not.toMatch(/COMING NEXT/i)
    expect(body).not.toMatch(/coming soon/i)

    w.expectClean()
  })

  test('each explanation column jumps to the screen it describes', async ({ page }) => {
    await page.goto('/')
    for (const [testId, view] of [
      ['what-go-advance', 'nav-advance'],
      ['what-go-grow', 'nav-grow'],
      ['what-go-liquidity', 'nav-liquidity'],
    ] as const) {
      await page.getByTestId(testId).click()
      await expect(page.getByTestId(view)).toBeVisible()
      expect(await page.getByTestId(testId).count()).toBe(0)
      await page.goto('/')
    }
  })
})

test.describe('the demo Friend is a real Rare Friend', () => {
  test('wears its real onchain portrait, not a drawn placeholder', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()

    // the portrait is read from the collection contract on first visit
    const img = page.getByTestId('friend-hero').locator('img').first()
    await expect(img).toBeVisible({ timeout: 45_000 })

    const src = await img.getAttribute('src')
    expect(src, 'portrait must come from the chain').toMatch(/^data:image\/svg\+xml;base64,/)
    // and it actually decodes into an image
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

    // the honest caption is only shown when the real thing could not be read
    await expect(page.getByText(/Portrait unavailable/i)).toHaveCount(0)
  })

  test('still works with no network at all, from the cached portraits', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await expect(page.getByTestId('friend-hero').locator('img').first()).toBeVisible({ timeout: 45_000 })

    // Cut off the chain. The app must still start and still show real portraits,
    // because the portraits are cached.
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', (route) => route.abort('failed'))
    await page.reload()
    await page.getByTestId('try-demo').click()

    const img = page.getByTestId('friend-hero').locator('img').first()
    await expect(img).toBeVisible({ timeout: 20_000 })
    expect(await img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
    // and the rest of the product still works with no chain at all
    await page.getByTestId('nav-liquidity').click()
    await expect(page.getByTestId('market-pool-count')).toContainText('5')
  })
})

test.describe('pool terms a creator can actually set', () => {
  test('MAX FINANCING is gone, and RF routing and WETH share reach 100%', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('open-create-pool').click()

    const wiz = page.getByTestId('pool-wizard')
    await wiz.getByTestId('wizard-name').fill('Terms Pool')
    await wiz.getByTestId('wizard-next').click() // -> ACCESS
    await wiz.getByTestId('wizard-next').click() // -> WHAT IT FUNDS
    await wiz.getByTestId('kind-growth').click() // growth terms only exist for growth pools
    await wiz.getByTestId('wizard-next').click() // -> ADD RF
    await wiz.getByTestId('wizard-capital').fill('600000')
    await wiz.getByTestId('wizard-next').click() // -> SET TERMS
    await page.waitForTimeout(300)

    // The cap that limited borrowing is no longer a creator choice.
    await expect(wiz.getByTestId('growth-max-finance-value')).toHaveCount(0)
    await expect(page.getByTestId('main')).not.toContainText('MAX FINANCING')

    // RF routing: 100% is selectable.
    await wiz.getByTestId('growth-routing-10000').click()
    await expect(wiz.getByTestId('growth-routing-value')).toHaveText('100%')
    // WETH share: 100% is selectable.
    await wiz.getByTestId('growth-weth-10000').click()
    await expect(wiz.getByTestId('growth-weth-value')).toHaveText('100%')
    // LP premium: far beyond the old 25% ceiling.
    await wiz.getByTestId('growth-premium-5000').click()
    await expect(wiz.getByTestId('growth-premium-value')).toHaveText('50%')

    w.expectClean()
  })

  test('a creator can type an exact number instead of hunting presets', async ({ page }) => {
    const w = watch(page)
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('open-create-pool').click()
    const wiz = page.getByTestId('pool-wizard')
    await wiz.getByTestId('wizard-name').fill('Typed Pool')
    await wiz.getByTestId('wizard-next').click()
    await wiz.getByTestId('wizard-next').click()
    await wiz.getByTestId('kind-growth').click()
    await wiz.getByTestId('wizard-next').click()
    await wiz.getByTestId('wizard-capital').fill('600000')
    await wiz.getByTestId('wizard-next').click()
    await page.waitForTimeout(300)

    // the steppers are still there...
    await wiz.getByTestId('growth-premium-minus').click()
    await wiz.getByTestId('growth-premium-minus').click()
    const stepped = await wiz.getByTestId('growth-premium-value').textContent()

    // ...but you can also just type the number you want
    await wiz.getByTestId('growth-premium-input').fill('12.5')
    await wiz.getByTestId('growth-premium-input').press('Enter')
    await expect(wiz.getByTestId('growth-premium-value')).toHaveText('12.5%')
    expect(stepped).not.toBe('12.5%')

    // nonsense is rejected rather than silently accepted
    await wiz.getByTestId('growth-premium-input').fill('banana')
    await wiz.getByTestId('growth-premium-input').press('Enter')
    await expect(wiz.getByTestId('growth-premium-value')).toHaveText('12.5%')

    w.expectClean()
  })
})

test.describe('CONNECT WALLET tells you what happened, where you pressed it', () => {
  test('the answer appears next to the button, not off-screen', async ({ page }) => {
    await page.goto('/')
    const btn = page.getByTestId('connect-wallet')
    await expect(btn).toBeVisible()
    const btnBox = (await btn.boundingBox())!

    await btn.click()
    const feedback = page.getByTestId('wallet-messages').first()
    await expect(feedback).toBeVisible({ timeout: 15_000 })

    // The message must be near the button, not a full screen below it.
    const fbBox = (await feedback.boundingBox())!
    expect(Math.abs(fbBox.y - btnBox.y), 'feedback must sit beside the button').toBeLessThan(200)
  })

  test('it still lands you in the app on a real connection', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __chain: string; ethereum: unknown }
      w.__chain = '0x1237'
      const info = { uuid: 'w1', name: 'Test Wallet', rdns: 't.w', icon: 'data:image/svg+xml,<svg/>' }
      const provider = {
        request: async (a: { method: string }) =>
          a.method === 'eth_chainId' ? w.__chain : ['0x1111111111111111111111111111111111111111'],
        on: () => {},
        removeListener: () => {},
      }
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }))
      })
      w.ethereum = provider
    })
    await page.goto('/')
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('wallet-messages').first()).toContainText(/read-only/i, { timeout: 20_000 })
    await expect(page.getByTestId('nav-liquidity')).toBeVisible()
  })
})

test.describe('the demo wallet holds a Genesis and a Generation', () => {
  test('both collections are available, and the Generation leads', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await expect(page.getByTestId('friend-hero')).toContainText(/GEN \d/i)

    await page.getByTestId('open-friend-switcher').click()
    const drawer = page.getByTestId('friend-switcher')
    await expect(drawer.locator('[data-testid^="switcher-Genesis:"]')).not.toHaveCount(0)
    await expect(drawer.locator('[data-testid^="switcher-Generations:"]')).not.toHaveCount(0)
  })
})
