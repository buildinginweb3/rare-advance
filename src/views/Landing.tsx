/**
 * LANDING
 * =======
 *
 * The first screen sells the idea and nothing else.
 *
 * It deliberately contains NO total network weight, NO pool utilisation, NO
 * charts, NO protocol contract detail and NO financing model. One sentence,
 * two buttons, three steps, one teaser.
 */

import { Device } from '../components/Device'
import { useDispatch, useSession, selectedFriend, sessionNowMs } from '../session/store'
import { useWallet } from '../wallet/useWallet'
import { HERO_HEADLINE, NOT_A_LOAN_SHORT, WHAT_IT_IS } from '../content/copy'

export function LandingView() {
  const state = useSession()
  const dispatch = useDispatch()
  const friend = selectedFriend(state)
  const nowMs = sessionNowMs(state)
  const wallet = useWallet()

  // Live mode is only entered on a real connection. With no wallet installed the
  // button says so instead of pretending.
  async function connect() {
    await wallet.requestConnection()
  }

  return (
    <div className="stack">
      <section className="landing-hero" data-testid="landing">
        <div className="landing-copy">
          <h1 className="h1">RARE ADVANCE</h1>
          <p className="landing-headline">{HERO_HEADLINE}</p>
          <div className="row" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-lg"
              onClick={() => dispatch({ type: 'enter-demo' })}
              data-testid="try-demo"
            >
              TRY DEMO
            </button>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              onClick={() => {
                void connect()
              }}
              data-testid="connect-wallet"
            >
              CONNECT WALLET
            </button>
          </div>
        </div>

        <div className="landing-device">
          <Device
            friend={friend}
            view="landing"
            mode={state.mode}
            live={state.live}
            advance={null}
            onNavigate={() => dispatch({ type: 'enter-demo' })}
          />
        </div>
      </section>

      <section className="what" data-testid="what-it-does">
        <h2 className="h2" style={{ fontSize: 11 }}>
          {WHAT_IT_IS.title}
        </h2>
        <p className="tiny" style={{ maxWidth: 760, margin: '8px 0 0' }}>
          {WHAT_IT_IS.lede}
        </p>

        <div className="what-grid">
          {WHAT_IT_IS.columns.map((col) => (
            <article key={col.title} className="what-card">
              <h3 className="h3" style={{ fontSize: 9 }}>
                {col.title}
              </h3>
              <p className="tiny" style={{ margin: '6px 0 10px' }}>
                {col.body}
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  dispatch({ type: 'enter-demo' })
                  dispatch({ type: 'set-view', view: col.link })
                }}
                data-testid={`what-go-${col.link}`}
              >
                {col.link}
              </button>
            </article>
          ))}
        </div>

        <div className="not-a-loan" data-testid="not-a-loan">
          <div className="h3" style={{ fontSize: 9 }}>
            WHAT THIS IS NOT
          </div>
          <ul className="tiny" style={{ margin: '6px 0 0', paddingLeft: 16, lineHeight: 1.9 }}>
            {NOT_A_LOAN_SHORT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <span hidden>{nowMs}</span>
    </div>
  )
}
