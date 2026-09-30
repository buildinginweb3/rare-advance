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
import { HERO_HEADLINE, HERO_STEPS, HERO_TEASER } from '../content/copy'

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
              {wallet.providers.length === 0 ? 'NO WALLET · TRY THE DEMO' : 'CONNECT WALLET'}
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

      <section aria-label="How it works in three steps">
        <ol className="steps" data-testid="landing-steps">
          {HERO_STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="h3" style={{ fontSize: 9 }}>
                  {s.title}
                </span>
                <span className="tiny" style={{ display: 'block', marginTop: 4 }}>
                  {s.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="teaser" data-testid="landing-teaser">
        <div>
          <div className="h3" style={{ fontSize: 9 }}>
            COMING NEXT
          </div>
          <p className="tiny" style={{ margin: '4px 0 0', maxWidth: 420 }}>
            {HERO_TEASER}
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            dispatch({ type: 'enter-demo' })
          }}
          data-testid="see-grow"
        >
          SEE GROW
        </button>
      </section>

      <span hidden>{nowMs}</span>
    </div>
  )
}
