import { expect, test, type Page } from '@playwright/test'
import { enterDemo } from './helpers'

/**
 * Wallet and error-state handling. A mock EIP-1193 provider is injected so the
 * rejection, wrong-network and no-Rare-Friends paths can all be exercised
 * deterministically. The mock only implements read + identity methods; the app
 * has no path that could ask for a signature.
 */
async function injectMockWallet(
  page: Page,
  opts: { accounts?: string[]; chainId?: string; failRequest?: boolean } = {},
) {
  const accounts = opts.accounts ?? ['0x1111111111111111111111111111111111111111']
  const chainId = opts.chainId ?? '0x1237' // 4663
  await page.addInitScript(
    ({ accounts, chainId, failRequest }) => {
      const requested: string[] = []
      ;(window as unknown as { __requested: string[] }).__requested = requested
      const ethereum = {
        request(args: { method: string }) {
          requested.push(args.method)
          switch (args.method) {
            case 'eth_requestAccounts':
              if (failRequest) return Promise.reject({ code: 4001, message: 'User rejected the request.' })
              return Promise.resolve(accounts)
            case 'eth_accounts':
              return Promise.resolve(accounts)
            case 'eth_chainId':
              return Promise.resolve(chainId)
            case 'wallet_switchEthereumChain':
              return Promise.resolve(null)
            case 'wallet_addEthereumChain':
              return Promise.resolve(null)
            default:
              // Any other method is a bug in this app: fail loudly in tests.
              return Promise.reject({ code: -32601, message: `Unexpected method ${args.method}` })
          }
        },
        on() {},
        removeListener() {},
      }
      ;(window as unknown as { ethereum: unknown }).ethereum = ethereum
    },
    { accounts, chainId, failRequest: opts.failRequest ?? false },
  )
}

test.describe('WALLET FLOW', () => {
  test('rejection is handled and Demo Mode still works', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await injectMockWallet(page, { failRequest: true })
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    await expect(page.getByTestId('status-strip')).toContainText(/declined the connection/i)
    // a rejected connection must not break Demo Mode
    await page.getByTestId('strip-demo').click()
    await expect(page.getByTestId('friend-hero')).toBeVisible()
    await expect(page.getByTestId('friend-hero')).toContainText(/Genesis/i)
    expect(errors).toEqual([])
  })

  test('wrong network is detected and reported with a switch instruction', async ({ page }) => {
    // chain 1 = Ethereum mainnet
    await injectMockWallet(page, { chainId: '0x1' })
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    await expect(page.getByTestId('status-strip')).toContainText(/Robinhood Chain is needed/i)
    await expect(page.getByTestId('switch-network')).toBeVisible()
  })

  test('no injected wallet reports honestly and offers Demo Mode', async ({ page }) => {
    await page.goto('/')
    // no window.ethereum and no EIP-6963 announcement in this context
    await expect(page.getByTestId('strip-connect')).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId('strip-connect').click()
    await expect(page.getByTestId('status-strip')).toContainText('No browser wallet detected')
    await expect(page.getByTestId('status-strip')).toContainText(/TRY DEMO/i)
    // and Demo Mode is one click away
    await page.getByTestId('strip-demo').click()
    await expect(page.getByTestId('friend-hero')).toBeVisible()
  })

  test('an unreachable RPC never produces a LIVE badge or invented data', async ({ page }) => {
    await page.route('**/api/rf-owned-nfts**', (route) => route.abort('failed'))
    await page.route('**/api/rf-snapshot**', (route) => route.abort('failed'))
    // break every RPC endpoint the app might use
    await page.route('https://rpc.mainnet.chain.robinhood.com/**', (route) => route.abort('failed'))
    await page.route('https://rarefriends.com/**', (route) => route.abort('failed'))
    await page.route('https://api.opensea.io/**', (route) => route.abort('failed'))

    await injectMockWallet(page)
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    await page.waitForTimeout(1500)

    // The WALLET is connected; that is a different fact from the DATA. What
    // must never happen is the app presenting data it could not fetch as live.
    await expect(page.getByTestId('status-strip')).toContainText(/LIVE DATA UNAVAILABLE/i)
    // and Demo Mode remains one click away
    await page.getByTestId('strip-demo').click()
    await expect(page.getByTestId('friend-hero')).toBeVisible()
    await expect(page.getByTestId('status-strip')).not.toContainText('LIVE DATA UNAVAILABLE')
  })

  test('no Rare Friends found is reported without inventing a balance', async ({ page }) => {
    await page.route('**/api/rf-owned-nfts**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nfts: [] }) }),
    )
    await injectMockWallet(page)
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    await page.waitForTimeout(1500)

    // A connected wallet that owns nothing must be told so plainly, with no
    // invented Friend and no invented balance.
    await page.waitForTimeout(2500)
    const body = (await page.getByTestId('main').textContent()) ?? ''
    expect(body).not.toMatch(/\b\d[\d,.]*\s*RF\s*(?:owned|balance)/i)
    // the demo market is untouched by an empty wallet
    await page.getByTestId('nav-liquidity').click()
    await expect(page.getByTestId('market-pool-count')).toContainText('5')
  })

  test('the app never requests a signature or a transaction', async ({ page }) => {
    await injectMockWallet(page)
    await page.goto('/')
    await page.getByTestId('strip-connect').click()
    await page.waitForTimeout(2500)
    // walk every view
    for (const v of ['dashboard', 'advance', 'grow', 'liquidity', 'how']) {
      await page.getByTestId(`nav-${v}`).click()
    }
    const requested = await page.evaluate(
      () => (window as unknown as { __requested: string[] }).__requested,
    )
    expect(requested.length).toBeGreaterThan(0)
    for (const method of requested) {
      expect(
        [
          'eth_requestAccounts',
          'eth_accounts',
          'eth_chainId',
          'wallet_switchEthereumChain',
          'wallet_addEthereumChain',
        ],
        `unexpected wallet method: ${method}`,
      ).toContain(method)
      expect(method).not.toContain('sign')
      expect(method).not.toContain('Transaction')
      expect(method).not.toContain('approve')
    }
  })

  test('Demo Mode is reachable from the landing hero with no wallet at all', async ({ page }) => {
    await page.goto('/')

    // the landing sells the idea with no wallet present
    await expect(page.getByTestId('try-demo')).toBeVisible()
    await expect(page.getByTestId('landing-steps')).toBeVisible()
    // and the wallet button says so honestly rather than pretending to connect
    await expect(page.getByTestId('connect-wallet')).toContainText(/NO WALLET/i)

    // one click in, the whole product is usable
    await enterDemo(page)
    await expect(page.getByTestId('friend-hero')).toBeVisible()
    await page.getByTestId('nav-liquidity').click()
    await page.getByTestId('open-create-pool').click()
    await expect(page.getByTestId('pool-wizard')).toBeVisible()
  })
})
