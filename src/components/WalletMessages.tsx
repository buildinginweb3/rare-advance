/**
 * WALLET FEEDBACK
 * ===============
 *
 * The honest answer to "what did that button just do?". Shown next to whichever
 * control was pressed, so a message can never appear somewhere off-screen.
 *
 * `inline` drops the top margin for use directly under a button.
 */

import { useMemo } from 'react'
import { Notice } from './ui'
import { ROBINHOOD_CHAIN } from '../wallet/connect'
import { useWallet } from '../wallet/useWallet'

export function WalletMessages({ inline = false }: { inline?: boolean }) {
  const wallet = useWallet()
  const s = wallet.state

  const body = useMemo(() => {
    switch (s.status) {
      // The states WHILE a wallet prompt is open. These used to render nothing,
      // so pressing CONNECT WALLET appeared to do nothing at all.
      case 'discovering':
        return { tone: 'info' as const, text: 'Looking for an installed browser wallet…' }
      case 'requesting-accounts':
        return {
          tone: 'info' as const,
          text: 'Approve the connection request in your wallet to continue. Nothing is signed and no approval is requested.',
        }
      case 'switching-network':
        return { tone: 'info' as const, text: `Switching your wallet to ${ROBINHOOD_CHAIN.chainName}…` }
      case 'choosing':
        return { tone: 'info' as const, text: 'Choose which wallet to connect.' }
      case 'unsupported':
        return { tone: 'warn' as const, text: `${s.error} ${s.hint ?? ''}` }
      case 'rejected':
        return { tone: 'warn' as const, text: `${s.error ?? 'Connection cancelled.'} ${s.hint ?? ''}` }
      case 'disconnected':
        return { tone: 'warn' as const, text: `${s.error ?? 'Wallet disconnected.'} ${s.hint ?? ''}` }
      case 'wrong-network':
      case 'switch-unavailable':
        return { tone: 'error' as const, text: `${s.error ?? ''} ${s.hint ?? ''}` }
      case 'error':
        return { tone: 'error' as const, text: `${s.error ?? ''} ${s.hint ?? ''}` }
      case 'connected':
        return {
          tone: 'info' as const,
          text: `Connected read-only on ${ROBINHOOD_CHAIN.chainName}. This demo never requests token or NFT approvals.`,
        }
      default:
        return null
    }
  }, [s])

  // "Choose which wallet to connect" used to be a dead end: the wallets were
  // discovered but never listed, so there was nothing to choose. List them.
  const choosing = s.status === 'choosing' && wallet.providers.length > 1

  if (choosing) {
    return (
      <div style={inline ? undefined : { marginTop: 8 }} className="stack" data-testid="wallet-messages">
        <div className="h3" style={{ fontSize: 9 }}>
          CHOOSE A WALLET
        </div>
        <div className="stack" style={{ gap: 6 }} data-testid="wallet-chooser">
          {wallet.providers.map((p) => (
            <button
              key={p.info.uuid}
              type="button"
              className="wallet-option"
              onClick={() => void wallet.connect(p)}
              data-testid={`wallet-option-${p.info.uuid}`}
            >
              {p.info.icon ? (
                <img src={p.info.icon} alt="" width={18} height={18} aria-hidden="true" className="wallet-option-icon" />
              ) : null}
              <span className="wallet-option-name">{p.info.name}</span>
              {p.info.rdns ? <span className="tiny muted">{p.info.rdns}</span> : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => void wallet.retry()}
          data-testid="wallet-chooser-cancel"
        >
          CANCEL
        </button>
      </div>
    )
  }

  if (!body) return null

  return (
    <div style={inline ? undefined : { marginTop: 8 }} className="stack" data-testid="wallet-messages">
      <Notice tone={body.tone}>
        {body.text}{' '}
        {s.status === 'wrong-network' || s.status === 'switch-unavailable' ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 6 }}
            onClick={wallet.switchNetwork}
            data-testid="switch-network"
          >
            SWITCH NETWORK
          </button>
        ) : null}{' '}
        {s.status === 'error' ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 6 }}
            onClick={wallet.retry}
            data-testid="retry-wallet"
          >
            TRY AGAIN
          </button>
        ) : null}
      </Notice>
    </div>
  )
}
