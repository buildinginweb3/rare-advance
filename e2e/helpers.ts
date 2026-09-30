import { expect, type Page } from '@playwright/test'

/**
 * Shared helpers.
 *
 * Every spec also asserts that the app itself produced no failed network
 * requests and no console errors, which is part of the acceptance criteria.
 */
/** The only host Demo Mode is allowed to contact. */
export const RPC_ORIGIN = 'https://rpc.mainnet.chain.robinhood.com'

export class AppErrors {
  readonly consoleErrors: string[] = []
  readonly failedRequests: string[] = []
  readonly externalRequests: string[] = []

  constructor(page: Page, origin: string) {
    page.on('console', (msg) => {
      const text = msg.text()
      // The browser logs its own network failure when the optional artwork read
      // cannot complete. That is not an application error.
      if (text.includes(RPC_ORIGIN)) return
      if (msg.type() === 'error') this.consoleErrors.push(text)
    })
    page.on('pageerror', (err) => this.consoleErrors.push(String(err)))
    page.on('requestfailed', (req) => {
      // A failed artwork read is a degraded-but-valid state: the app falls back
      // to a drawn placeholder and says so. Only same-origin failures are bugs.
      if (req.url().startsWith(RPC_ORIGIN)) return
      this.failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText ?? ''}`)
    })
    page.on('request', (req) => {
      if (!req.url().startsWith(origin) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
        this.externalRequests.push(req.url())
      }
    })
  }

  expectClean() {
    expect(this.consoleErrors, `console errors: ${this.consoleErrors.join(' | ')}`).toEqual([])
    expect(this.failedRequests, `failed requests: ${this.failedRequests.join(' | ')}`).toEqual([])
  }

  /** Requests the demo must never make, whichever cache is warm. */
  forbiddenRequests(): string[] {
    return this.externalRequests.filter((u) => !u.startsWith(RPC_ORIGIN))
  }

  /**
   * Demo Mode must not talk to ANY third party.
   *
   * The one deliberate exception is a read-only call to the public Robinhood
   * Chain RPC, used once to fetch the real onchain artwork of the demo Friends.
   * That is a public read of public data: no key, no account, no tracking, and
   * nothing sent beyond an eth_call. Everything else - OpenSea, analytics,
   * fonts, CDNs - is forbidden outright.
   */
  expectNoThirdPartyRequests() {
    const offenders = this.forbiddenRequests()
    expect(offenders, offenders.join(' | ')).toEqual([])
  }
}

export function watch(page: Page) {
  return new AppErrors(page, 'http://127.0.0.1:4173')
}

/**
 * Start every test from the seeded market.
 *
 * Pools and portraits persist in localStorage by design, so without this a test
 * that creates a pool leaks into the next one and the market totals drift.
 */
export async function freshMarket(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('rare-advance:simulated-market:v1')
    } catch {
      /* storage may be unavailable; the seeded market is used anyway */
    }
  })
}

export async function enterDemo(page: Page) {
  await page.goto('/')
  await page.getByTestId('try-demo').click()
  await expect(page.getByTestId('friend-hero')).toBeVisible()
}

export const MOBILE_WIDTHS = [360, 390, 430]
