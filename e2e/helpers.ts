import { expect, type Page } from '@playwright/test'

/**
 * Shared helpers.
 *
 * Every spec also asserts that the app itself produced no failed network
 * requests and no console errors, which is part of the acceptance criteria.
 */
export class AppErrors {
  readonly consoleErrors: string[] = []
  readonly failedRequests: string[] = []
  readonly externalRequests: string[] = []

  constructor(page: Page, origin: string) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') this.consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => this.consoleErrors.push(String(err)))
    page.on('requestfailed', (req) => {
      // a same-origin request that failed would be an app bug
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

  /** Demo Mode must not need any external network at all. */
  expectNoExternalRequests() {
    expect(this.externalRequests, `external requests: ${this.externalRequests.join(' | ')}`).toEqual([])
  }
}

export function watch(page: Page) {
  return new AppErrors(page, 'http://127.0.0.1:4173')
}

export async function enterDemo(page: Page) {
  await page.goto('/')
  await page.getByTestId('try-demo').click()
  await expect(page.getByTestId('device')).toBeVisible()
}

export const MOBILE_WIDTHS = [360, 390, 430]
