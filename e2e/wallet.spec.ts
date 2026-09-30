import { expect, test, type Page } from '@playwright/test'

/**
 * WALLET CONNECTION
 * =================
 *
 * A mock EIP-6963 wallet is injected so every branch can be exercised
 * deterministically: the happy path, a wallet that refuses the chain switch,
 * a user who leaves the chain afterwards, and no wallet at all.
 *
 * The mock only implements read + identity methods. The app has no path that
 * could ask for a signature, and that is asserted below.
 */

type Behaviour = {
  chain?: string
  /** The wallet refuses `wallet_switchEthereumChain`. */
  refuseSwitch?: boolean
  /** Never answer EIP-6963, so only the legacy `window.ethereum` path exists. */
  announce?: boolean
}

async function mockWallet(page: Page, o: Behaviour = {}) {
  await page.addInitScript((o: Behaviour) => {
    const w = window as unknown as {
      __chain: string
      __req: string[]
      ethereum: unknown
    }
    w.__chain = o.chain ?? '0x1237'
    w.__req = []

    const info = { uuid: 'w1', name: 'Test Wallet', rdns: 'test.wallet', icon: 'data:image/svg+xml,<svg/>' }
    const provider = {
      request: async (a: { method: string; params?: Array<{ chainId: string }> }) => {
        w.__req.push(a.method)
        switch (a.method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return ['0x1111111111111111111111111111111111111111']
          case 'eth_chainId':
            return w.__chain
          case 'wallet_switchEthereumChain':
            if (o.refuseSwitch) throw { code: 4902, message: 'Unrecognized chain ID' }
            w.__chain = a.params![0]!.chainId
            return null
          default:
            throw { code: -32601, message: `Unexpected method ${a.method}` }
        }
      },
      on: () => {},
      removeListener: () => {},
    }

    if (o.announce !== false) {
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }))
      })
    }
    w.ethereum = provider
  }, o)
}

const requested = (page: Page) =>
  page.evaluate(() => (window as unknown as { __req: string[] }).__req)

test.describe('connecting on the right chain', () => {
  test('lands the user and shows a read-only address', async ({ page }) => {
    await mockWallet(page, { chain: '0x1237' })
    await page.goto('/')
    await expect(page.getByTestId('try-demo')).toBeVisible()

    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('status-strip')).toContainText('LIVE READ-ONLY', { timeout: 20_000 })

    // the visitor is no longer on the landing: the app is usable
    await expect(page.getByTestId('nav-liquidity')).toBeVisible()
    await expect(page.getByTestId('strip-connect')).toContainText('CONNECTED')
  })

  test('discovery alone never asks for an account', async ({ page }) => {
    await mockWallet(page)
    await page.goto('/')
    // wait well past the discovery window
    await expect(page.getByTestId('connect-wallet')).toContainText('CONNECT WALLET', { timeout: 10_000 })
    expect(await requested(page)).toEqual([])
  })
})

test.describe('connecting on the wrong chain', () => {
  test('never strands the user on the landing', async ({ page }) => {
    await mockWallet(page, { chain: '0x1', refuseSwitch: true })
    await page.goto('/')
    await page.getByTestId('connect-wallet').click()

    // the honest failure is explained...
    await expect(page.getByTestId('status-strip')).toContainText(/Robinhood Chain|could not switch/i, {
      timeout: 20_000,
    })
    await expect(page.getByTestId('switch-network')).toBeVisible()

    // ...and the product is still reachable, because a wrong chain blocks live
    // data rather than the app
    await expect(page.getByTestId('nav-liquidity')).toBeVisible()
    await page.getByTestId('nav-liquidity').click()
    await expect(page.getByTestId('market-pool-count')).toContainText('5')
  })

  test('does not claim live data while on the wrong chain', async ({ page }) => {
    await mockWallet(page, { chain: '0x1', refuseSwitch: true })
    await page.goto('/')
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('switch-network')).toBeVisible({ timeout: 20_000 })

    await expect(page.getByTestId('status-strip')).not.toContainText('LIVE READ-ONLY')
    await expect(page.getByTestId('status-strip')).toContainText('SIMULATED')
  })
})

test.describe('legacy wallets', () => {
  test('a wallet with no EIP-6963 support is still discovered', async ({ page }) => {
    await mockWallet(page, { chain: '0x1237', announce: false })
    await page.goto('/')
    await expect(page.getByTestId('connect-wallet')).toContainText('CONNECT WALLET', { timeout: 10_000 })

    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('status-strip')).toContainText('LIVE READ-ONLY', { timeout: 20_000 })
  })
})

test.describe('no wallet installed', () => {
  test('says so plainly instead of spinning forever', async ({ page }) => {
    await page.goto('/')
    // the discovery window closes and the app settles on the honest answer
    await expect(page.getByTestId('status-strip')).toContainText(/no browser wallet detected/i, {
      timeout: 10_000,
    })
    await expect(page.getByTestId('try-demo')).toBeEnabled()
  })

  test('the demo needs no wallet at all', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('try-demo').click()
    await expect(page.getByTestId('friend-hero')).toBeVisible()
    await page.getByTestId('nav-liquidity').click()
    await expect(page.getByTestId('open-create-pool')).toBeVisible()
  })
})

test.describe('safety', () => {
  test('the app never requests a signature or a transaction', async ({ page }) => {
    await mockWallet(page)
    await page.goto('/')
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('status-strip')).toContainText('LIVE READ-ONLY', { timeout: 20_000 })

    for (const v of ['advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${v}`).click()
      await page.waitForTimeout(150)
    }

    const methods = await requested(page)
    expect(methods.length).toBeGreaterThan(0)
    for (const m of methods) {
      expect(
        ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'],
        `unexpected wallet method: ${m}`,
      ).toContain(m)
    }
    for (const forbidden of ['sign', 'SendTransaction', 'approve', 'personal_sign', 'eth_sign']) {
      expect(methods.join(' ')).not.toContain(forbidden)
    }
  })

  test('a rejected connection is explained and does not break the demo', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __req: string[]; ethereum: unknown }
      w.__req = []
      w.ethereum = {
        request: async (a: { method: string }) => {
          w.__req.push(a.method)
          if (a.method === 'eth_requestAccounts') throw { code: 4001, message: 'User rejected the request.' }
          if (a.method === 'eth_chainId') return '0x1237'
          return []
        },
        on: () => {},
        removeListener: () => {},
      }
    })
    await page.goto('/')
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('status-strip')).toContainText(/declined|cancelled|rejected/i, {
      timeout: 20_000,
    })

    await page.getByTestId('try-demo').click()
    await expect(page.getByTestId('friend-hero')).toBeVisible()
  })
})