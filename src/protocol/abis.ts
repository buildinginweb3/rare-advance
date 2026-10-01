/**
 * VERIFIED READ-ONLY ABIS
 * ======================
 *
 * These signatures were confirmed against the deployed Rare Friends contracts
 * on Robinhood Chain mainnet and cross-checked against the ABIs the official
 * Rare Friends Portfolio client uses for the same values. No function here was
 * guessed, and no function is written to.
 *
 * ActivationManager (0xD4A3...83Ac)
 *   positions() -> (tier, weight)   weight is 0 when inactive
 *   earned()    -> per-Friend claimable for a given reward asset
 *   streams()   -> global (pending, rate, finish, lastUpdate, rewardPerWeight, remainder)
 *   totalWeight() -> total ACTIVE network reward weight, 18-decimal fixed point
 *
 * Confirmed onchain during this build:
 *   totalWeight()  = 1068353624.53125e18
 *   positions(genesis, 1) = (tier 0, 2000000e18)
 */

import { parseAbi } from 'viem'

export const activationManagerAbi = parseAbi([
  'function positions(address collection, uint256 tokenId) view returns (uint8 tier, uint256 weight)',
  'function earned(address asset, address collection, uint256 tokenId) view returns (uint256)',
  'function streams(address asset) view returns (uint256 pending, uint256 rate, uint256 finish, uint256 lastUpdate, uint256 rewardPerWeight, uint256 remainder)',
  'function totalWeight() view returns (uint256)',
])

export const generationsNftAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function generation(uint256 tokenId) view returns (uint8)',
  'function tokenBoundAccount(uint256 tokenId) view returns (address)',
])

export const genesisNftAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
])

export const erc20ReadAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])

export const erc721ReadAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
])

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
export const ZERO_TOPIC =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

/** ERC721 Transfer(address,address,uint256) topic, for ownership-log discovery. */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

/** Genesis is a fixed cap of 1,024, so its whole id space is sweepable. */
export const GENESIS_MAX_TOKEN_ID = 1024

/**
 * Multicall3 `aggregate3`. Bundling `ownerOf` reads this way is what makes an
 * exhaustive Generations sweep possible from a browser: the public RPC rejects
 * `eth_getLogs` (HTTP 403) and the contract exposes no owner index, so the only
 * option is to ask about many token ids per request.
 */
export const multicall3Aggregate3Abi = parseAbi([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
])

/** Canonical deterministic Multicall3 address, deployed on Robinhood Chain. */
export const MULTICALL3_ADDRESS = '0xca11bde05977b3631167028862be2a173976ca11'
