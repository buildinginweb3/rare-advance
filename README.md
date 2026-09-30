# RARE ADVANCE

**The liquidity layer for the Rare Friends economy.**

> Your Friend is already earning.
> Don't wait to get paid.

Rare Advance turns an earning Rare Friend's streaming `$RAREFRIENDS` rewards into liquidity today, while
modeling how the same capital market could finance activations, promotions and upgrades from the future
rewards they create.

**Vibeathon MVP — Economy Potential.**
Rare Friends ownership and protocol data may be live/read-only. **All Rare Advance financing, liquidity,
settlement and burns are simulated. No tokens or NFTs move. No transaction is ever signed.**

---

## DEMO NOTE

> Rare Friends ownership and protocol data may be live/read-only.
> Rare Advance financing, liquidity, settlement and burns are simulated.
> **No tokens or NFTs move in this demo.**

- No smart contracts are deployed by this project.
- No `$RAREFRIENDS` or ETH is spent.
- No NFT is transferred, approved or listed.
- No reward is claimed, no Genesis activated, no Generation hardwired, promoted or upgraded.
- No signature is requested. Wallet connection is used for **identity and read-only discovery only**.
- The only wallet methods this app can issue are `eth_requestAccounts`, `eth_accounts`, `eth_chainId`,
  `wallet_switchEthereumChain` and `wallet_addEthereumChain`. A unit-of-work test asserts this.

---

## SOURCE

- Repository: `rare-advance`
- Category: **Economy Potential**
- Builder/contact: **Syrup / @buildinginweb3**
- FriendSDK: **No** — this is a financial/economy tool, not a game. A custom read-only wallet flow is used so
  no game runtime is pulled in. The Vibeathon explicitly allows non-FriendSDK tools.
- Stack: **React 18 · TypeScript · Vite 6 · viem · Vitest · Playwright**
- No wagmi, no UI framework, no CSS framework. The pixel identity is hand-written CSS.

---

## THE ECONOMIC THESIS

### Rare Friends already has an economy

- RF-consuming activation, hardwire, promotion and upgrade actions
- Reward weights that decide each active Friend's share of the pool
- Shared RF and WETH reward streams funded by protocol activity
- Seven-day streaming of allocated rewards
- NFT-owned reward positions that follow the token

### Rare Advance adds a capital layer on top of it

- Liquidity against allocated, currently-streaming RF
- An RF liquidity-provider market that earns the spread as streams settle
- Modeled reward-stream settlement
- Future financing for the actions that create additional reward weight

Rare Advance does not replace the Rare Friends economy. It sits on top of it.

### The flywheel

```
RF LIQUIDITY
  → funds a Rare Friends growth action
    → the existing protocol consumes RF
      → 50% burned
      → 50% funds rewards
        → the Friend gains or increases reward weight
          → future funded activity produces rewards
            → the financing repays
              → liquidity recycles
```

**This loop does not guarantee profitability.** It only works if future reward funding actually arrives, and
reward funding depends on protocol activity. Reward weight is allocation weight, not a promised return.

---

## WHAT THIS IS, PRECISELY

A **reward advance**: the sale of an already-streaming RF receivable at a discount.

| This is                                     | This is not                                        |
| ------------------------------------------- | -------------------------------------------------- |
| A discount on future RF you already earned  | A debt                                             |
| A market for RF liquidity                    | Borrowing against an NFT floor                      |
| A settle-from-stream mechanism               | NFT collateral, LTV, liquidation, margin calls      |
| Weight-based growth finance                  | A credit product or a score                         |
| A financial companion for your Friend       | A generic lending dashboard                        |

The financed asset is the selected Rare Friend's reward stream. There is no NFT floor oracle anywhere in this
codebase, because an advance against reward cash flow does not need one.

---

## HOW IT WORKS

### DASHBOARD

Your Friends, their real protocol state, their reward position, and the central pixel device. Every figure
carries a provenance badge.

### ADVANCE — the primary interaction

1. Select an earning Friend.
2. Choose a slice of its currently-streaming RF: `25%` · `50%` · `75%` · `MAX` · or an exact RF amount.
3. Read the quote.
4. Take a **simulated** advance and watch the pixel settlement scene.
5. `SIMULATE TIME` streams the repayment out of the Friend's reward position until `SETTLED ✓`.

Default demo market terms, all in one module (`src/economy/rareAdvanceConfig.ts`):

| Term                     | Share of face value |
| ------------------------ | ------------------- |
| Holder receives now       | 95%                 |
| Liquidity provider spread | 4%                  |
| Rare Advance RF burn      | 1%                  |
| **Total discount**        | **5%**              |

Worked example — 1,000 RF of reward receivable:

```
1,000 RF reward receivable
  → holder receives 950 RF now
  → 1,000 RF settles as the rewards vest
  → 950 RF restores pool principal
  →  40 RF goes to LP earnings
  →  10 RF is modeled as RF burn
```

`950 + 40 + 10 = 1000` exactly. Rounding always rounds down, so it can never create value.

### GROW — the second idea

**ACTIVATE NOW. PAY FROM FUTURE REWARDS.**

Based on the selected Friend's real or demo state, GROW shows only actions the protocol actually permits:

| State                        | Action offered |
| ---------------------------- | -------------- |
| Temporary / unhardwired      | HARDWIRE       |
| Permanent but inactive       | REACTIVATE (restarts at tier 0) |
| Active Genesis               | none — fully weighted |
| Active Generation 2–6        | PROMOTE (resets tier to 0) |
| Active tier 0–3              | UPGRADE (sequential) |

Financing model, also in `src/economy/rareAdvanceConfig.ts`:

```
financed          = actionCost - userContribution
premium           = 5% of financed
repaymentTarget   = financed + premium
premium split     = 80% liquidity providers / 20% additional Rare Advance burn
routing           = 75% of future RF -> repayment, 25% -> owner
                    100% -> owner once the target is reached
```

The underlying Rare Friends action has its **own separate** 50/50 economics (50% RF burned, 50% RF reward
funding). The two burns are never combined, and the UI never merges them.

### LIQUIDITY — the other side

Holders: future RF → liquidity now.
LPs: RF liquidity → spread later.

**No yield is promised. No APY is shown**, because a five-day advance cannot honestly be annualised. What is
shown is the RF spread, the discount and the remaining stream duration.

### HOW IT WORKS

The two pixel flow diagrams and the full thesis.

---

## DATA PROVENANCE

Provenance is a product feature, not a decoration. Every meaningful number is badged, and provenance is never
encoded by colour alone — each badge has a distinct fill pattern **and** its own text.

| Badge                   | Meaning |
| ----------------------- | ------- |
| `LIVE · ONCHAIN`        | Read directly from a Rare Friends contract on Robinhood Chain in this session |
| `LIVE · OPENSEA`        | NFT artwork or traits from the OpenSea v2 API |
| `PROTOCOL · VERIFIED`   | An official Rare Friends protocol constant (docs + onchain read-back) |
| `MODELED`               | Derived by documented formula from live protocol state |
| `SIMULATED`             | Produced by this app's simulation. No chain is involved. |

**Demo Mode can never show a `LIVE` badge.** An end-to-end test asserts that no live-provenance badge appears
anywhere in Demo Mode.

---

## PROTOCOL DATA SOURCES

### Read directly onchain (no index, no API)

Robinhood Chain mainnet, chain ID **4663**, official public RPC
`https://rpc.mainnet.chain.robinhood.com`.

| Read | Used for |
| ---- | -------- |
| `ActivationManager.totalWeight()` | total ACTIVE network reward weight |
| `ActivationManager.streams(RF \| WETH)` | pending, rate, finish, remainder |
| `ActivationManager.positions(collection, tokenId)` | `(tier, weight)`; weight `0` means inactive |
| `ActivationManager.earned(asset, collection, tokenId)` | per-Friend claimable RF / WETH |
| `Generations.generation / tokenBoundAccount / ownerOf` | generation, Friend wallet, ownership |
| `ERC20.balanceOf(tokenBoundAccount)` | RF / WETH already in the Friend's own wallet |

These signatures were confirmed against the deployed contracts and cross-checked against the ABIs the
official Rare Friends Portfolio client uses for the same values. No function was guessed, and **no function is
written to**.

### OpenSea API v2

Used for **one purpose only**: NFT artwork and traits. Chain slug `robinhood`; collections
`rare-friends-genesis` and `rare-friends-generations`. OpenSea market value is never used in the economics,
because an advance is based on reward cash flow, not NFT floor.

### Discovery, in order

1. **First-party Rare Friends public JSON index** — `GET /api/protocol/owned-nfts?address=…`, the same index
   the official Portfolio uses. It sends no CORS headers, so the app calls it through its own same-origin proxy
   path, which the Vite dev/preview server forwards. On a purely static host this path fails cleanly with a
   Retry affordance.
2. **OpenSea v2 "NFTs by account"** as a secondary index. Note: the v2 account endpoint is not readable with a
   public-key-only credential, so this path usually returns nothing and degrades to step 3.
3. **Onchain Genesis sweep** — Genesis is capped at 1,024, so `ownerOf(1…1024)` is fully enumerable and needs
   no index at all. **Verified live**: this path alone found 48 Rare Friends for the Genesis reserve with every
   index blocked.

**Every discovered entry is re-verified with a direct onchain `ownerOf()` read before it is shown.** An
unverified entry is dropped, never displayed, and the app reports how many were dropped.

### What "pending" means here

The contracts expose a per-Friend **claimable** figure but no per-Friend **forward** projection. So a
Friend's currently-streaming slice is derived, and labelled `MODELED`, never `LIVE`:

```
streamingShare = friendWeight / totalActiveWeight × streamRemainder
```

That is the documented allocation method (`weight / total active weight`) applied to the live stream
remainder. The formula is stated in the UI and in the code. When any input is unavailable the app says
"Unavailable" rather than substituting a number.

---

## MONEY MATH

**No binary floating-point arithmetic is used anywhere in Rare Advance money math.**

- `$RAREFRIENDS` is 18 decimals and is represented as a `bigint` count of wei.
- Reward weights are `bigint` counts of micro-units (1e-6), which is exact for every documented weight — the
  finest documented fraction is `3.965625`.
- Every division rounds **down**. Rounding can only ever leave dust in the pool, never create value.
- `lpSpread + burn + principal === faceValue` is asserted as an invariant, including for pathological inputs
  like 1 wei and 3 wei.

Utilities live in `src/math/rf.ts`: `parseRF`, `formatRF`, `formatRFCompact`, `formatMantissa`, `mulBps`,
`divRoundDown`, `mulDivFloor`, `parseWeight`, `weightFromWei18`, `weightToWei18`, `formatWeight`,
`formatWeightDelta`, `weightChangeBps`, `formatBpsAsPercent`, `formatShare`, `formatDuration`,
`formatDurationLong`, `percentWhole`.

---

## ECONOMY CONFIGURATION

Official protocol constants and Rare Advance demo assumptions are kept in **separate** modules and must never
be mixed:

- `src/protocol/rareFriendsConfig.ts` — chain, verified contract addresses, the full Genesis and Generations
  schedule, promotion ladder, reward-weight table, the 50/50 action split, and the 7-day stream duration.
- `src/economy/rareAdvanceConfig.ts` — advance discount, LP spread, Rare Advance burn, growth financing
  premium, premium split, repayment routing share, simulated pool seed, contribution presets.

---

## PROTOCOL ECONOMICS, AS VERIFIED

Every value below was re-verified against the official Rare Friends documentation for this build and, where
possible, read back onchain.

### Genesis

| | |
| --- | --- |
| Activation cost | 100,000 RF |
| → burned | 50,000 RF |
| → RF reward funding | 50,000 RF |
| Active reward weight | 2,000,000 (verified onchain) |
| Hardwire / promote / upgrade | none |
| Reactivation | a direct transfer clears activation; the new owner pays 100,000 RF again |

### Generations

| Gen | Hardwire | Base weight | Reactivate | Promote to | Tier 0 | Tier 4 |
| ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 1 | 100,000 | 175,000 | 10,000 | — | 175,000 | 987,187.5 |
| 2 | 10,000 | 16,000 | 1,000 | 90,000 | 16,000 | 86,062.5 |
| 3 | 1,000 | 1,450 | 100 | 9,000 | 1,450 | 7,846.875 |
| 4 | 100 | 130 | 10 | 900 | 130 | 708.75 |
| 5 | 10 | 12 | 1 | 90 | 12 | 65.8125 |
| 6 | 1 | 1.1 | 0.1 | 9 | 1.1 | 6.075 |

Upgrade ladder (RF), sequential only, per generation:

| Gen | 0→1 | 1→2 | 2→3 | 3→4 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 50,000 | 75,000 | 112,500 | 168,750 |
| 2 | 5,000 | 7,500 | 11,250 | 16,875 |
| 3 | 500 | 750 | 1,125 | 1,687.5 |
| 4 | 50 | 75 | 112.5 | 168.75 |
| 5 | 5 | 7.5 | 11.25 | 16.875 |
| 6 | 0.5 | 0.75 | 1.125 | 1.6875 |

Adjacent promotion costs, in RF: `6→5: 9`, `5→4: 90`, `4→3: 900`, `3→2: 9,000`, `2→1: 90,000`.

> **Discrepancy found and documented.** The Generations docs state that promoting from Gen 6 all the way to
> Gen 1 costs `100,000 RF` in total. The published adjacent ladder sums to **99,999 RF**; the docs round. The
> adjacent ladder is authoritative and is what the app charges. This is asserted in the unit tests.

### Rules the UI never contradicts

- A direct transfer or sale clears activation and upgrades.
- Reactivation restarts at tier 0. Previous upgrade payments are not refunded or credited.
- Promotion resets tier to 0 and can never move a Generation into Genesis.
- Upgrades are sequential: tier *n* → *n+1* only.
- Reward weight is **allocation weight** — not tokens, yield, return or ROI.
- Activation earns from that point forward, never rewards streamed before activation.
- Rewards never mint new RF. Rewards belong to the Friend and follow the NFT.
- Every activation / hardwire / promote / upgrade payment splits **50% RF burned · 50% RF reward funding**.
- RF and WETH stream **separately over seven days**. Genesis reserve fees are 100% reward funding and are
  never burned.
- Genesis and Generations share one allocation pool. There is no fixed split between collections.

---

## SETUP

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

```bash
npm run typecheck  # tsc -b, strict
npm test           # vitest, unit
npm run build      # tsc -b && vite build
npm run preview    # serve the production build on :4173
npm run e2e        # playwright, against the production build
RA_VISUAL=1 npx playwright test e2e/visual.spec.ts   # visual QA screenshots
```

### Environment

Everything has a working default. **No secret is required to run the demo.**

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VITE_OPENSEA_API_KEY` | empty | Artwork only. Optional. |
| `VITE_RPC_URL` | official public RPC | Optional alternative Robinhood Chain endpoint. |
| `VITE_RF_API_BASE` | `https://rarefriends.com` | Base for the first-party read-only JSON proxy. |

Copy `.env.example` to `.env.local` if you want to change any of them. `.env*` is git-ignored.

### OpenSea key note

The OpenSea key is used **only** to fetch NFT artwork in the browser, which requires the key client-side. The
key committed for this demo is deliberately public, low-privilege and rotatable. It can read public
collections; it cannot move anything. It is not used for ownership (that is always re-verified onchain) and
not used for any economic figure. If the key is missing or rejected, artwork degrades to an on-device
placeholder portrait and everything else keeps working.

---

## WALLET / NETWORK REQUIREMENTS

- **Judges need no wallet at all.** `TRY DEMO` is the primary path and works with zero network calls.
- Live mode needs any EIP-1193 browser wallet on **Robinhood Chain mainnet (chain 4663)**.
- The app detects the chain, offers `wallet_switchEthereumChain` / `wallet_addEthereumChain` with the
  official chain configuration, and reports a wrong-network state clearly.
- No signature is ever requested. No transaction is ever prepared or sent.

---

## REAL vs SIMULATED

| Thing | Status |
| ----- | ------ |
| Friend NFT ownership | **LIVE** — direct `ownerOf()` on Robinhood Chain |
| NFT artwork | **LIVE** — onchain `tokenURI()` SVG, the real protocol pixels |
| NFT traits and canonical URL | **LIVE** — OpenSea API v2 (secondary; its index is sparse) |
| Tier, activation, reward weight | **LIVE** — `ActivationManager.positions()` |
| Claimable RF and WETH | **LIVE** — `ActivationManager.earned()` |
| Total active network weight | **LIVE** — `ActivationManager.totalWeight()` |
| Global RF/WETH stream | **LIVE** — `ActivationManager.streams()` |
| A Friend's streaming slice | **MODELED** — `weight / totalActiveWeight × stream remainder` |
| Advance quote | **SIMULATED** |
| Advance settlement and RF burn | **SIMULATED** |
| Liquidity pool, deposits, LP share | **SIMULATED** |
| Growth financing and repayment | **SIMULATED** |
| Payback horizon | **MODELED** from current protocol activity, or an explicit demo scenario |
| Protocol cost tables | **PROTOCOL · VERIFIED** against official docs and onchain |
| Demo Mode Friends, balances, pool | **SIMULATED DEMO WALLET** |

---

## LIMITATIONS — read this before drawing conclusions

1. **All Rare Advance financing is simulated.** There is no lending contract, no escrow and no assignment.
2. **No real token movement.** No RF or ETH is spent, no NFT is transferred or approved, no reward is claimed.
3. **No live lending contract exists.** Nothing in this repository is deployed or audited.
4. **No real assignment of protocol rewards.** The Rare Friends docs state that claims pay the NFT's own
   wallet and that assets and unclaimed rewards follow the NFT. **Rare Advance cannot currently intercept
   protocol reward payments.** A production version would require a secure, protocol-supported reward-routing,
   assignment or escrow mechanism so an advance can actually be settled from the reward stream.
5. **Transfer-while-financed behaviour is undefined.** A production design must specify what happens if the
   NFT is transferred while an advance is outstanding. Current Rare Friends contracts do not solve this for
   Rare Advance, and this project does not claim they do.
6. **Future rewards are variable.** Rewards depend on funded protocol activity, and the protocol explicitly
   does not guarantee that a new stream starts when the previous one ends.
7. **Reward weight is not guaranteed yield.** A larger allocation share is not a larger earnings guarantee.
8. **Modeled payback time can change** with reward funding, total active weight and the Friend's own state.
   A small Generation Friend's modeled payback can be far beyond any plausible horizon; the app says so
   instead of hiding it.
9. **OpenSea and indexer metadata can lag chain state.** When they conflict, direct onchain state wins: an
   entry is dropped unless `ownerOf()` confirms it.
10. **Live wallet discovery needs a proxy on a static host.** The first-party Rare Friends index sends no CORS
    headers, so a purely static deployment cannot call it directly. On such a host the app reports the
    failure honestly, offers Retry, and points to Demo Mode, rather than faking ownership.
11. **The demo market terms are not production pricing.** 95 / 4 / 1 and the 5% financing premium are
    illustrative assumptions in one config file, not a quote from any market.
12. **A successful loop is not guaranteed.** The flywheel only closes if future reward funding arrives.

---

## VERIFIED LIVE

The live path was exercised against Robinhood Chain mainnet with a real Rare Friends holder
(`0x60E862CD77aF8F547446a8bc8E5c0F2Cb845Af58`: ten active Genesis at 2,000,000 weight, one hardwired
active Gen 1, one permanent Gen 4 that lost activation on transfer, one temporary Gen 6). Run it with:

```bash
RA_LIVE=1 npm run e2e -- e2e/live.spec.ts
```

Observed results:

| Check | Result |
| ----- | ------ |
| Discovery route | `first-party-api` |
| Friends read / verified onchain | 13 / 13 |
| Friends reporting claimable RF > 0 | 11 / 13 |
| Real onchain artwork rendered | 13 / 13 |
| `totalWeight()` read live | 1,068,355,055.88 |
| Auto-selection | picks an **ACTIVE** Friend, not the first card |
| Onchain Genesis sweep with every index blocked | 48 Friends found |
| Fabricated index entry for a non-owner | dropped, never shown |

Two real bugs were found and fixed by running against live data, which no amount of reading the docs
would have caught:

- `earned()` **reverts** for a temporary Friend, because a temporary Friend has no reward position at
  all. The whole Friend read was failing. It is now non-fatal, and the claimable figure is reported as
  `NO REWARD POSITION` rather than a fake `0 RF`.
- A temporary Friend reports generation `0` onchain, so a generation range check placed before the
  temporary branch made a temporary Friend look like it had **no available action at all**.

---

## CHECKS

| Check | Command | Result |
| ----- | ------- | ------ |
| Typecheck | `npm run typecheck` | pass |
| Unit tests | `npm test` | pass |
| Production build | `npm run build` | pass |
| E2E | `npm run e2e` | pass |
| Visual QA | `RA_VISUAL=1 npx playwright test e2e/visual.spec.ts` | pass |

What the suites actually assert:

- **Protocol constants** — Genesis cost and weight; every generation's hardwire, reactivation, four upgrade
  costs and five tier weights; every promotion cost; the 50/50 split on every action; the 7-day stream.
- **Protocol mechanics** — promotion resets tier to 0; Gen 1 cannot promote; tier 4 cannot upgrade; Genesis
  cannot upgrade or promote; a Generation can never promote into Genesis; reactivation starts at tier 0;
  impossible actions are never offered; sequential upgrades cannot be skipped.
- **Advance math** — the 1,000 RF worked example to the wei; 25/50/75/MAX; rejection of negative, zero and
  over-eligible amounts; `principal + lp + burn === face` for pathological inputs; settlement never exceeds
  the face value; the simulated pool quotes.
- **Growth finance** — `financed = cost − contribution` and `target = principal + premium` across all six
  generations and Genesis; 80/20 premium split; 75/25 reward routing; the protocol 50/50 split never merged
  with the Rare Advance burn; payback is null when live inputs are missing.
- **Fixed-point math** — parsing, basis-point rounding, weight ↔ wei round-trips, compact formatting that
  never overstates, readable long horizons, and a share that is never flattened to `0%`.
- **E2E** — demo flow end to end, advance presets and settlement, Grow financing, Generations previews and
  costs, liquidity deposits, wallet rejection / wrong network / no wallet / RPC failure / no Rare Friends,
  no horizontal overflow at 360/390/430, WCAG AA text contrast on every view, reduced motion, keyboard
  access, and a wallet-method allowlist that proves no signature or transaction is ever requested.
- **Provenance** — Demo Mode can never show a `LIVE` badge, on any view.

---

## KNOWN LIMITATIONS IN THE DEMO ITSELF

- Demo Mode artwork is an original deterministic placeholder portrait, not the real on-chain art. It is
  captioned as a placeholder. Real artwork is shown faithfully in live mode and is never redrawn.
- The demo clock only moves when `SIMULATE TIME` is pressed, so demo behaviour is deterministic.
- The `>1,000 years` payback ceiling is a display cap. The underlying model returns the exact figure; only the
  rendering is capped so a correct result is not displayed as an unreadable digit string.

---

## CREDITS

- **Rare Friends** — the protocol, the collections and the reward economy this project builds on. Rare
  Advance does not replace it, and this is not an official Rare Friends product.
- Rare Friends docs: <https://rarefriends.com/docs> (Genesis, Generations, Economy, Contracts, SDK)
- Robinhood Chain docs: <https://docs.robinhood.com/chain/connecting>
- OpenSea API v2: <https://docs.opensea.io/>
- Rare Friends Blockscout: <https://robinhoodchain.blockscout.com>
- Pixel display faces: **Press Start 2P** and **Space Mono**, both SIL Open Font License, self-hosted.

The visual identity — the handheld device, the LCD layout, the button cluster, the RF sprites, the flow
diagrams and the placeholder portrait generator — is original to this project. The mood borrows from early
digital companions and retro handhelds; no existing device silhouette, character, logo, icon or animation was
copied.
