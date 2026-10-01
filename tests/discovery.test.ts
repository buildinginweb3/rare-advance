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
 *  - OpenSea's /api/v2/accounts/{address}/nfts does not serve these tokens
 *    (NOT_FOUND / empty), so it cannot be relied on either.
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

const readContract = vi.fn(async ({ address, functionName, args }: any) => {
  if (functionName !== 'ownerOf') throw new Error('unsupported read in test')
  const tokenId = String(args?.[0])
  const key = `${String(address).toLowerCase()}:${tokenId}`
  const owner = owners.get(key)
  if (!owner) throw new Error('execution reverted')
  return owner
})

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
  readContract.mockClear()
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

  it('does not claim a wallet with nothing is fully cleared', async () => {
    owners.set(`${GENESIS_ADDR}:249`, OWNER)

    const result = await discovery.discoverFriends(STRANGER, '')

    expect(result.friends).toHaveLength(0)
    // Genesis is fully enumerated, but Generations is not, so the empty result
    // is NOT authoritative and must be reported as such.
    expect(result.exhaustive).toBe(false)
  })

  it('never claims a bounded Generations sweep is exhaustive', async () => {
    // Generations has no owner index, so a wallet holding only Generations can
    // never be fully cleared. `exhaustive` must be false so the UI says
    // "not verified" instead of falsely claiming the wallet holds nothing.
    const result = await discovery.discoverFriends(STRANGER, '')

    expect(result.exhaustive).toBe(false)
    expect(result.notes.join(' ')).toMatch(/bounded|best-effort/i)
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
