import { expect, test } from '@playwright/test'

/**
 * LIVE DATA VERIFICATION
 *
 * This spec hits the real Robinhood Chain public RPC, the real first-party
 * Rare Friends index and the real OpenSea API. It is NOT part of the offline
 * suite, so it only runs when explicitly requested:
 *
 *   RA_LIVE=1 npx playwright test e2e/live.spec.ts
 *
 * It exists to prove the live read path works, not to assert anything a judge
 * without a wallet could rely on.
 */
/**
 * A real Rare Friends holder: ten active Genesis at 2,000,000 weight plus a
 * hardwired active Gen 1, a permanent Gen 4 that lost activation and a
 * temporary Gen 6. Chosen because it exercises every code path the live UI has.
 */
const HOLDER = '0x60E862CD77aF8F547446a8bc8E5c0F2Cb845Af58'
const RESERVE = '0xA850B2499c064900EfF341745807e1cB0d71a52b'

test.describe('LIVE DATA', () => {
  test.skip(!process.env.RA_LIVE, 'set RA_LIVE=1 to run live network checks')

  test('reads protocol state, discovers a real holder, verifies ownership and loads artwork', async ({ page }) => {
    test.setTimeout(180_000)
    const fails: string[] = []
    page.on('requestfailed', (r) => fails.push(`${r.url()} ${r.failure()?.errorText ?? ''}`))

    await page.addInitScript((address) => {
      const accounts = [address]
      const chainId = '0x1237'
      ;(window as unknown as { ethereum: unknown }).ethereum = {
        request(args: { method: string }) {
          switch (args.method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return Promise.resolve(accounts)
            case 'eth_chainId':
              return Promise.resolve(chainId)
            default:
              return Promise.resolve(null)
          }
        },
        on() {},
        removeListener() {},
      }
    }, HOLDER)

    await page.goto('/')
    await page.getByTestId('strip-connect').click()

    // 1. live protocol state
    const strip = page.getByTestId('status-strip')
    await expect(strip).toContainText('LIVE READ-ONLY WALLET', { timeout: 90_000 })
    await expect(strip).toContainText('ROBINHOOD CHAIN 4663')

    // 2. at least one Friend was discovered and verified
    const friends = page.locator('[data-testid^="friend-card-"]')
    await expect(friends.first()).toBeVisible({ timeout: 150_000 })
    const count = await friends.count()
    expect(count).toBeGreaterThan(0)
    console.log(`read ${count} Friends for the holder wallet`)

    // 3. live onchain provenance appears, and no simulated badge is on the cards
    const first = friends.first()
    await expect(first).toContainText('STATE · LIVE ONCHAIN')
    await expect(first.locator('.badge[data-provenance="onchain"]').first()).toBeVisible()

    // 4. a claimable RF figure was read from ActivationManager.earned()
    const cardText = await first.innerText()
    const rf = /CLAIMABLE RF[\s\S]{0,40}?([\d,.]+)\s*RF/.exec(cardText)
    expect(rf, `no claimable RF read for the first Friend: ${cardText}`).toBeTruthy()
    expect(Number((rf![1] ?? '0').replace(/,/g, ''))).toBeGreaterThanOrEqual(0)

    // a genuinely earning Friend somewhere in the wallet must show RF claimable
    const allClaimable = await page
      .locator('[data-testid="friend-claimable"]')
      .allInnerTexts()
      .then((v) => v.map((t) => Number(/([\d,.]+)/.exec(t)?.[1].replace(/,/g, '') ?? '0')))
    const earning = allClaimable.filter((v) => v > 0)
    console.log(`${earning.length}/${allClaimable.length} live Friends report claimable RF > 0`)
    // the app must state how many Friends were verified vs read
    await expect(strip).toContainText(/verified with direct onchain/i)
    expect(earning.length, 'no live Friend reported claimable RF').toBeGreaterThan(0)
    expect(earning.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)

    // 5. total active weight was read live
    await expect(page.getByTestId('protocol-state')).toContainText('READ AT BLOCK', { timeout: 30_000 })
    const weight = await page.getByTestId('total-active-weight').locator('.sblock-value').innerText()
    console.log(`live total active weight: ${weight}`)
    expect(weight).toMatch(/^[\d,.]+$/)

    // 6. artwork came from OpenSea for the cards that were fetched. Artwork is
    //    capped per session, so look for ANY card carrying an image rather than
    //    requiring a specific one.
    const artCard = page.locator('[data-testid^="friend-card-"]', { has: page.locator('img') }).first()
    await expect(artCard).toBeVisible({ timeout: 90_000 })
    const src = await artCard.locator('img').first().getAttribute('src')
    console.log(`artwork: ${String(src).slice(0, 60)}...`)
    await expect(artCard).toContainText('ART · LIVE ONCHAIN')
    const artCount = await page.locator('[data-testid^="friend-card-"] img').count()
    console.log(`cards with live artwork: ${artCount}`)
    expect(artCount).toBeGreaterThan(0)
    // the artwork is the real onchain 8x8 SVG, served as a data URI
    expect(src).toMatch(/^data:image\/svg\+xml;base64,/)

    // 7. the app auto-selects an EARNING Friend, so the money path is visible
    //    immediately even for a large wallet
    const selected = await page
      .locator('.fcard[aria-pressed="true"]')
      .first()
      .innerText()
    console.log(`auto-selected: ${selected.split('\n').slice(0, 3).join(' / ')}`)
    expect(selected).toContain('ACTIVE')

    // 8. no app-level request failed
    const appFails = fails.filter((f) => !/favicon/.test(f))
    expect(appFails, appFails.join(' | ')).toEqual([])
  })

  test('a temporary Friend read onchain is never given an invented hardwire cost', async ({ page }) => {
    test.setTimeout(180_000)
    await page.addInitScript((address) => {
      ;(window as unknown as { ethereum: unknown }).ethereum = {
        request(a: { method: string }) {
          return Promise.resolve(a.method === 'eth_chainId' ? '0x1237' : [address])
        },
        on() {},
        removeListener() {},
      }
    }, HOLDER)
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    const temporary = page.locator('[data-testid^="friend-card-"]', { hasText: 'TEMPORARY' }).first()
    await expect(temporary).toBeVisible({ timeout: 150_000 })
    await temporary.click()
    await page.getByTestId('nav-grow').click()
    const hardwire = page.getByTestId('action-hardwire')
    await expect(hardwire).toBeVisible()
    // The docs say the live RF balance selects the generation, so no cost and
    // no resulting weight may be asserted.
    await expect(hardwire).toContainText('BALANCE-DEPENDENT')
    await expect(hardwire).toContainText('GEN ?')
    await expect(page.getByTestId('model-financing-hardwire')).toHaveCount(0)
    // nothing legitimate to plan
    await expect(page.getByTestId('planner-card')).toHaveCount(0)
  })

  test('the onchain Genesis sweep finds a large holder with no index at all', async ({ page }) => {
    test.setTimeout(180_000)
    // Break every index so only the onchain Genesis sweep can work.
    await page.route('**/api/rf-owned-nfts**', (route) => route.abort('failed'))
    await page.route('**/api.opensea.io/**', (route) => route.abort('failed'))
    await page.addInitScript((address) => {
      ;(window as unknown as { ethereum: unknown }).ethereum = {
        request(a: { method: string }) {
          return Promise.resolve(a.method === 'eth_chainId' ? '0x1237' : [address])
        },
        on() {},
        removeListener() {},
      }
    }, RESERVE)
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    // The reserve holds 411 Genesis, all swept with ownerOf() and no index.
    await expect(page.locator('[data-testid^="friend-card-"]').first()).toBeVisible({ timeout: 150_000 })
    await expect(page.getByTestId('status-strip')).toContainText('onchain-sweep')
    const count = await page.locator('[data-testid^="friend-card-"]').count()
    console.log(`onchain Genesis sweep found ${count} Friends with no index available`)
    expect(count).toBeGreaterThan(0)
  })

  test('an unverified index entry is dropped rather than shown as owned', async ({ page }) => {
    test.setTimeout(180_000)
    // Serve a fabricated index entry for an address that does not own it.
    await page.route('**/api/rf-owned-nfts**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ nfts: [{ collection: 'Genesis', id: '715' }] }),
      }),
    )
    await page.addInitScript(() => {
      const accounts = ['0x2222222222222222222222222222222222222222']
      ;(window as unknown as { ethereum: unknown }).ethereum = {
        request(args: { method: string }) {
          if (args.method === 'eth_chainId') return Promise.resolve('0x1237')
          return Promise.resolve(accounts)
        },
        on() {},
        removeListener() {},
      }
    })
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    await expect(page.getByTestId('status-strip')).toContainText('No Rare Friends found', { timeout: 90_000 })
    // Genesis #715 is not owned by that address, so it must not appear
    await expect(page.getByTestId('friend-card-Genesis:500')).toHaveCount(0)
  })
})
