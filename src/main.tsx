import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SessionProvider } from './session/store'
import { MarketProvider } from './session/marketStore'
import { WalletProvider } from './wallet/useWallet'
import './styles/global.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root not found')

createRoot(el).render(
  <StrictMode>
    <WalletProvider>
      <MarketProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MarketProvider>
    </WalletProvider>
  </StrictMode>,
)
