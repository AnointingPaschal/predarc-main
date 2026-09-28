/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Built with Arc Studio
 *  https://studio.arc.io
 */

import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import './index.css'

const queryClient = new QueryClient()



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          options={{
            // Show suggested wallets + detect installed ones
            walletConnectName: 'Other Wallets',
            enforceSupportedChains: false,
            embedGoogleFonts: false,
            // Suggested wallets shown in the modal (installed ones get a badge automatically)
            initialChainId: 5042, // Arc Mainnet
          }}
          customTheme={{
            '--ck-font-family': '"DM Sans", sans-serif',
            '--ck-border-radius': '14px',
            '--ck-overlay-background': 'rgba(0, 0, 0, 0.6)',
            '--ck-body-background': 'var(--surface-modal, #0d1b2f)',
            '--ck-body-color': 'var(--ink, #f9faf3)',
            '--ck-body-color-muted': 'var(--subtle, #94a3b8)',
            '--ck-body-color-muted-hover': 'var(--muted, #cbd5e1)',
            '--ck-primary-button-background': 'var(--accent, #acc6e9)',
            '--ck-primary-button-color': '#0d1b2f',
            '--ck-primary-button-hover-background': 'var(--accent-hover, #cbdbf2)',
            '--ck-secondary-button-background': 'var(--surface-strong, rgba(255,255,255,0.11))',
            '--ck-body-border-radius': '14px',
            '--ck-connectbutton-background': 'var(--surface-strong, rgba(255,255,255,0.11))',
            '--ck-connectbutton-color': 'var(--ink, #f9faf3)',
            '--ck-connectbutton-border-radius': '10px',
            '--ck-connectbutton-hover-background': 'var(--surface, rgba(255,255,255,0.07))',
          }}
        >
          <App />
          <Toaster position="top-center" />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

