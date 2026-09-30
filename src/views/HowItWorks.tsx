/**
 * HOW IT WORKS
 * ============
 *
 * Level 3/4 detail, kept one click away from the holder flow: the protocol
 * mechanics, the market model, the data sources and the honest limitations.
 */

import { Badge, Note, Notice, Panel, Stat } from '../components/ui'
import { PROTOCOL_RULES, REWARD_SHARE_FORMULA, REWARD_STREAM_DURATION_SECONDS } from '../protocol/rareFriendsConfig'
import { ROBINHOOD_CHAIN } from '../wallet/connect'
import { FLOW, EXT_FLOW, TWO_SIDES } from '../content/explainer'

export function HowView() {
  return (
    <div className="stack">
      <Panel dark>
        <h1 className="h2" style={{ fontSize: 'clamp(14px, 4vw, 22px)' }}>
          HOW RARE ADVANCE FITS
        </h1>
        <p className="tiny" style={{ color: 'var(--gray-2)', maxWidth: 480, marginTop: 6 }}>
          Rare Friends already creates RF and WETH cash flow. Rare Advance creates a market around that cash
          flow.
        </p>
      </Panel>

      <Panel title="TWO SIDES, ONE MARKET">
        <div className="grid-3">
          {TWO_SIDES.map((s) => (
            <div className="panel-recess" key={s.title}>
              <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
                {s.title}
              </div>
              <p className="tiny" style={{ margin: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 10, marginBottom: 0 }}>
          Friends keep earning. Capital gets repaid. RF can fund more Rare Friends activity.
        </p>
      </Panel>

      <div className="grid-2">
        <Panel title="THE REWARD ADVANCE">
          <div className="flow-diagram">
            {FLOW.map((n, i) => (
              <div key={n}>
                {i > 0 ? <div className="flow-arrow" aria-hidden="true" /> : null}
                <div className={i === 4 ? 'flow-node flow-node-dark' : 'flow-node'}>
                  <span className="h3" style={{ fontSize: 7 }}>
                    {n}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="THE LIQUIDITY MARKET" right={<Badge provenance="simulated" label="SIMULATED" />}>
          <div className="flow-diagram">
            {EXT_FLOW.map((n, i) => (
              <div key={n}>
                {i > 0 ? <div className="flow-arrow" aria-hidden="true" /> : null}
                <div className={i === 1 || i === EXT_FLOW.length - 1 ? 'flow-node flow-node-dark' : 'flow-node'}>
                  <span className="h3" style={{ fontSize: 7 }}>
                    {n}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="THE RF FLYWHEEL">
        <div className="grid-2">
          <div>
            <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
              REWARD ADVANCE MARKET
            </div>
            <ol className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>LP holds RF</li>
              <li>Supplies liquidity, or creates a pool with its own terms</li>
              <li>Other RF holders add RF to that pool</li>
              <li>A holder chooses a pool and takes RF early</li>
              <li>The reward stream settles the advance</li>
              <li>LP capital plus its premium returns, pro rata to what it funded</li>
              <li>That RF is available again for the next advance</li>
            </ol>
          </div>
          <div>
            <div className="h3" style={{ fontSize: 8, marginBottom: 4 }}>
              GROWTH FINANCING MARKET
            </div>
            <ol className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>LP RF finances a Rare Friends action</li>
              <li>Activate / hardwire / reactivation / promote / upgrade</li>
              <li>The existing protocol splits 50% RF burn, 50% RF reward funding</li>
              <li>The Friend gains reward weight</li>
              <li>Modeled future rewards repay the financing</li>
              <li>An optional WETH share compensates the LP while financing is outstanding</li>
              <li>Financing settles, and all routing returns to the Friend</li>
            </ol>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Note>
            This loop is not guaranteed to close. It only works if future reward funding actually arrives, and
            reward funding depends on protocol activity. Rare Advance does not create token value by itself; it
            routes existing RF into actions the protocol already defines.
          </Note>
        </div>
      </Panel>

      <Panel title="WHY THIS MATTERS FOR $RAREFRIENDS">
        <div className="grid-2">
          <div>
            <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>
                <strong>Demand for RF liquidity.</strong> Pools need RF to fund advances and growth actions.
              </li>
              <li>
                <strong>Competition for capital.</strong> Borrowers choose between independently configured
                pool terms.
              </li>
              <li>
                <strong>Recycling.</strong> Returned RF capital can fund another advance or action.
              </li>
            </ul>
          </div>
          <div>
            <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.9 }}>
              <li>
                <strong>Growth demand.</strong> Growth financing can direct RF into existing activation,
                hardwiring, promotion and upgrade mechanics.
              </li>
              <li>
                <strong>Existing token sink.</strong> Those actions already split RF between burn and reward
                funding under Rare Friends protocol rules.
              </li>
              <li>
                <strong>Both reward assets.</strong> RF services repayment; WETH can optionally
                participate as temporary LP compensation.
              </li>
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title="PROTOCOL MECHANICS">
        <div className="grid-2">
          <div className="panel-recess">
            <Stat label="Reward share" value={REWARD_SHARE_FORMULA} />
            <Stat label="Reward stream duration" value={`${REWARD_STREAM_DURATION_SECONDS / 86_400} days`} />
            <Stat label="Genesis activation" value="100,000 RF (50,000 burn · 50,000 reward funding)" />
            <Stat label="Action fee split" value="50% RF burned · 50% RF reward funding" />
          </div>
          <div>
            <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
              {PROTOCOL_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title="LIMITATIONS" right={<Badge provenance="simulated" label="READ THIS" />}>
        <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
          <li>All financing, liquidity, settlement and burns are SIMULATED. No real RF or WETH moves.</li>
          <li>No lending contract, no escrow and no assignment exist. Rare Advance cannot currently intercept protocol reward payments.</li>
          <li>WETH is tracked separately from RF and is never converted into RF.</li>
          <li>WETH participation is temporary and ends the instant RF repayment completes.</li>
          <li>Future rewards are variable. Reward weight is allocation weight, not a guaranteed return.</li>
          <li>Transfer-while-financed behaviour is undefined and must be specified in any production design.</li>
          <li>Pools created here are stored in this browser only and are not a global listing.</li>
        </ul>
      </Panel>

      <Panel title="PRODUCTION REQUIREMENTS">
        <Note>
          A production version would need audited liquidity-pool contracts, real RF deposits and withdrawals,
          position-level LP accounting, RF and WETH reward routing, settlement enforcement, access control for
          private pools, defined transfer-while-financed behaviour, growth-action underwriting, protection
          against protocol reward changes, and production fee accounting. None of this exists today.
        </Note>
      </Panel>

      <Panel title="DATA SOURCES">
        <ul className="tiny" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.85 }}>
          <li>
            Robinhood Chain mainnet, chain {ROBINHOOD_CHAIN.chainId} — read only
          </li>
          <li>ActivationManager.positions / earned / streams / totalWeight</li>
          <li>NFT artwork from the collection contract&apos;s own tokenURI()</li>
          <li>OpenSea API v2 for secondary traits only, never ownership or value</li>
          <li>Reward position RF in the Friend&apos;s own token-bound wallet</li>
        </ul>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Progression example: a Genesis at 2,000,000 reward weight out of 20,000,000 total active weight is
          10%. If 1,000 RF streams, that Friend earns 100 RF of it.
        </p>
      </Panel>

      <Notice tone="warn">
        This demo never requests a signature, a transaction, a token approval or an NFT approval.
      </Notice>
    </div>
  )
}
