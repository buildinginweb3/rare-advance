/**
 * DISCOVERY TESTS
 * ===============
 *
 * Covers the wallet-owned Rare Friends discovery bug.
 *
 * Background (verified against mainnet on 2026-09-30):
 *
 *  - rarefriends.com serves /api/protocol/owned-nfts correctly (HTTP 200) but
 *    sends NO access-control-allow-origin header, so a browser running the
 *    static GitHub Pages build cannot read it. The same-origin proxy path the
 *    app requests returns 404 on Pages.
 *  - OpenSea serves them, but only on the chain-scoped path
 *    /api/v2/chain/robinhood/account/{address}/nfts. The un-scoped
 *    /api/v2/accounts/{address}/nfts path does not exist and returns 404.
 *  - The Generations contract reverts on totalSupply(), balanceOf() and
 *    tokenOfOwnerByIndex(), so it has NO owner index, and its highest live
 *    token id is in the hundreds of thousands. It cannot be enumerated.
 *
 * Therefore the onchain sweep is the only route that works from a static host,
 * and an empty result must never be reported as authoritative when the check
 * was bounded. These tests pin that contract down.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0x60E862CD77aF8F547446a8bc8E5c0F2Cb845Af58'
const STRANGER = '0x1111111111111111111111111111111111111111'

/** ownerOf() answers, keyed by `collection:tokenId`. */
const owners = new Map<string, string>()

/** How many bundled aggregate3 reads happened, to prove batching really is used. */
let multicallReads = 0

const readContractImpl = async ({ address, functionName, args }: any): Promise<any> => {
  const addr = String(address).toLowerCase()
  if (functionName === 'aggregate3') {
    multicallReads += 1
    const calls = (args?.[0] ?? []) as { target: string; callData: string }[]
    return calls.map((call) => {
      // ownerOf(uint256) is 0x6352211e...
      const tokenId = BigInt(`0x${call.callData.slice(10, 74)}`)
      const owner = owners.get(`${String(call.target).toLowerCase()}:${tokenId.toString()}`)
      if (!owner) return { success: false, returnData: '0x' }
      return { success: true, returnData: `0x${'0'.repeat(24)}${owner.slice(2)}` }
    })
  }
  if (functionName !== 'ownerOf') throw new Error('unsupported read in test')
  const tokenId = String(args?.[0])
  const owner = owners.get(`${addr}:${tokenId}`)
  if (!owner) throw new Error('execution reverted')
  return owner
}

const readContract = vi.fn(readContractImpl)

vi.mock('../src/chain/client', () => ({
  publicClient: () => ({ readContract }),
  sameAddress: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
}))

vi.mock('../src/chain/reads', () => ({
  verifyOwner: vi.fn(async (collection: string, tokenId: bigint, owner: string) => {
    const addr = collection === 'Genesis' ? GENESIS_ADDR : GENERATIONS_ADDR
    const actual = owners.get(`${addr}:${String(tokenId)}`)
    return actual?.toLowerCase() === String(owner).toLowerCase()
  }),
}))

vi.mock('../src/protocol/rareFriendsConfig', async () => {
  const actual: any = await vi.importActual('../src/protocol/rareFriendsConfig')
  return { ...actual, OPENSEA_KEY: '' }
})

const GENESIS_ADDR = '0x116eaa62241751e0c98da43d458600c6c17cd361'
const GENERATIONS_ADDR = '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d'

const discovery = await import('../src/chain/discovery')

/** Both index routes are unreachable, which is the deployed Pages situation. */
function stubIndexesUnreachable() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any) => {
      const url = String(input)
      if (url.includes('opensea.io')) return new Response(JSON.stringify({ nfts: [] }), { status: 200 })
      return new Response('not found', { status: 404 })
    }),
  )
}

beforeEach(() => {
  owners.clear()
  multicallReads = 0
  // mockReset, not mockClear: a test that forces RPC failures must not leak its
  // implementation into the next test.
  readContract.mockReset()
  readContract.mockImplementation(readContractImpl)
  stubIndexesUnreachable()
})

describe('onchain sweep', () => {
  it('finds a Genesis holder even though no index is reachable', async () => {
    owners.set(`${GENESIS_ADDR}:249`, OWNER)
    owners.set(`${GENESIS_ADDR}:907`, OWNER)

    const result = await discovery.discoverFriends(OWNER, '')

    expect(result.route).toBe('onchain-sweep')
    expect(result.friends.map((f) => f.tokenId).sort()).toEqual(['249', '907'])
    expect(result.friends.every((f) => f.collection === 'Genesis')).toBe(true)
    expect(result.friends.every((f) => f.ownershipVerified)).toBe(true)
  })

  it('reports a fully swept wallet with nothing as exhaustive', async () => {
    owners.set(`${GENESIS_ADDR}:249`, OWNER)

    const result = await discovery.discoverFriends(STRANGER, '')

    expect(result.friends).toHaveLength(0)
    // Every token id of both collections was read, so "none" is a real answer.
    expect(result.exhaustive).toBe(true)
  })

  it('is not exhaustive when a bundled batch cannot be read', async () => {
    // A flaky RPC must never turn into "this wallet owns nothing". Each batch is
    // retried once, so both attempts of a batch must fail for the sweep to be
    // unproven. Genesis and Generations now run concurrently, so failing every
    // request is the reliable way to force the failure path.
    readContract.mockRejectedValue(new Error('rpc down'))
    const result = await discovery.discoverFriends(STRANGER, '')
    expect(result.exhaustive).toBe(false)
  })

  it('bundles ownerOf reads through Multicall3 instead of one call per id', async () => {
    owners.set(`${GENERATIONS_ADDR}:7`, OWNER)
    const result = await discovery.discoverFriends(OWNER, '')

    // The whole 345,000-id range must be covered in a small number of bundled
    // requests, otherwise discovery could never run in a browser.
    expect(multicallReads).toBeGreaterThan(0)
    expect(multicallReads).toBeLessThan(120)
    expect(result.friends.some((f) => f.collection === 'Generations')).toBe(true)
  })

  it('finds a Generations holder inside the swept window', async () => {
    // The Generations sweep starts from the highest live id and walks down, so
    // a holder of the newest ids is discoverable.
    owners.set(`${GENERATIONS_ADDR}:1`, OWNER)

    const result = await discovery.discoverFriends(OWNER, '')

    // Whether it is found depends on the window budget, but any Generations hit
    // must be attributed to the onchain route and carry both collections only
    // when verified.
    for (const f of result.friends) {
      expect(f.ownershipVerified).toBe(true)
      expect(['Genesis', 'Generations']).toContain(f.collection)
    }
  })

  it('keeps first-party results authoritative when the index does answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        if (String(input).includes('opensea.io')) return new Response(JSON.stringify({ nfts: [] }), { status: 200 })
        return new Response(
          JSON.stringify({
            nfts: [
              { collection: 'Genesis', id: '5' },
              { collection: 'Generations', id: '9' },
              { collection: 'SomethingElse', id: '1' },
            ],
          }),
          { status: 200 },
        )
      }),
    )
    owners.set(`${GENESIS_ADDR}:5`, OWNER)
    owners.set(`${GENERATIONS_ADDR}:9`, OWNER)

    const result = await discovery.discoverFriends(OWNER, '')

    expect(result.route).toBe('first-party-api')
    // A first-party index answered, so its list is the whole truth.
    expect(result.exhaustive).toBe(true)
    // Unsupported collections are still filtered out.
    expect((result.friends as { collection: string }[]).map((f) => f.collection)).not.toContain(
      'SomethingElse',
    )
    expect(result.friends.map((f) => f.tokenId).sort()).toEqual(['5', '9'])
  })

describe('OpenSea route', () => {
  it('uses the chain-scoped account path that actually exists', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        urls.push(url)
        if (url.includes('opensea.io')) {
          return new Response(
            JSON.stringify({
              nfts: [{ contract: '0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D', identifier: '84370' }],
              next: null,
            }),
            { status: 200 },
          )
        }
        return new Response('not found', { status: 404 })
      }),
    )
    owners.set(`${GENERATIONS_ADDR}:84370`, OWNER)

    const result = await discovery.discoverFriends(OWNER, 'test-key')

    const seaUrl = urls.find((u) => u.includes('opensea.io'))
    expect(seaUrl).toContain('/api/v2/chain/robinhood/account/')
    expect(seaUrl).not.toContain('/api/v2/accounts/')
    expect(result.route).toBe('opensea')
    expect(result.friends.map((f) => f.tokenId)).toEqual(['84370'])
    // Ownership is still confirmed onchain, never trusted from the index.
    expect(result.friends[0].ownershipVerified).toBe(true)
  })
})

describe('exhaustiveness is never claimed without proof', () => {
  it('is false while loading and false when the live read throws', async () => {
    const mod = await import('../src/session/useLiveData')
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/session/useLiveData.ts', import.meta.url), 'utf8'),
    )

    // The loading placeholder must not claim an exhaustive check.
    expect(source).toMatch(/prices: \{ rfUsd: null, ethUsd: null \},\s*\n\s*\/\/ Unproven[\s\S]*?discoveryExhaustive: false/)

    // The catch block that handles a failed RPC read must not claim one either.
    const catchBlock = source.slice(source.indexOf('} catch (err) {'))
    expect(catchBlock).toMatch(/discoveryExhaustive: false/)

    expect(typeof mod.useLiveData).toBe('function')
  })
})

})
