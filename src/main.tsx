import './tracing'
import './console-capture'

import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

// Build ConnectKit theme from actual hex values (not CSS vars — ConnectKit's
// modal renders outside the document root so var() references don't resolve)
function getConnectKitTheme(isDark: boolean): Record<string, string> {
  return isDark
    ? {
        '--ck-font-family': '"DM Sans", system-ui, sans-serif',
        '--ck-border-radius': '16px',
        '--ck-overlay-background': 'rgba(0,0,0,0.65)',
        '--ck-body-background': '#0f1c30',
        '--ck-body-background-secondary': '#152035',
        '--ck-body-background-tertiary': '#1a2a42',
        '--ck-body-color': '#f0f6ff',
        '--ck-body-color-muted': '#7fa3c8',
        '--ck-body-color-muted-hover': '#a8c8e8',
        '--ck-body-divider': 'rgba(255,255,255,0.08)',
        '--ck-body-border-radius': '16px',
        '--ck-primary-button-background': '#5b9cf6',
        '--ck-primary-button-color': '#0a1628',
        '--ck-primary-button-hover-background': '#80b4ff',
        '--ck-primary-button-border-radius': '12px',
        '--ck-secondary-button-background': 'rgba(255,255,255,0.08)',
        '--ck-secondary-button-color': '#f0f6ff',
        '--ck-secondary-button-hover-background': 'rgba(255,255,255,0.13)',
        '--ck-secondary-button-border-radius': '12px',
        '--ck-connectbutton-background': 'rgba(255,255,255,0.08)',
        '--ck-connectbutton-color': '#f0f6ff',
        '--ck-connectbutton-border-radius': '10px',
        '--ck-connectbutton-hover-background': 'rgba(255,255,255,0.13)',
        '--ck-focus-color': '#5b9cf6',
        '--ck-modal-box-shadow': '0 8px 40px rgba(0,0,0,0.5)',
      }
    : {
        '--ck-font-family': '"DM Sans", system-ui, sans-serif',
        '--ck-border-radius': '16px',
        '--ck-overlay-background': 'rgba(0,0,0,0.45)',
        '--ck-body-background': '#ffffff',
        '--ck-body-background-secondary': '#f3f7fd',
        '--ck-body-background-tertiary': '#eef2fa',
        '--ck-body-color': '#0d1829',
        '--ck-body-color-muted': '#3d5470',
        '--ck-body-color-muted-hover': '#1e3a5f',
        '--ck-body-divider': '#d0dcea',
        '--ck-body-border-radius': '16px',
        '--ck-primary-button-background': '#2563eb',
        '--ck-primary-button-color': '#ffffff',
        '--ck-primary-button-hover-background': '#1d4ed8',
        '--ck-primary-button-border-radius': '12px',
        '--ck-secondary-button-background': '#eef2fa',
        '--ck-secondary-button-color': '#0d1829',
        '--ck-secondary-button-hover-background': '#dce6f7',
        '--ck-secondary-button-border-radius': '12px',
        '--ck-connectbutton-background': '#eef2fa',
        '--ck-connectbutton-color': '#0d1829',
        '--ck-connectbutton-border-radius': '10px',
        '--ck-connectbutton-hover-background': '#dce6f7',
        '--ck-focus-color': '#2563eb',
        '--ck-modal-box-shadow': '0 8px 40px rgba(0,0,0,0.12)',
      }
}

function Root() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light'
  )

  // Watch for theme attribute changes (toggled by Navbar)
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return (
    <ConnectKitProvider
      options={{
        walletConnectName: 'Other Wallets',
        enforceSupportedChains: false,
        embedGoogleFonts: false,
        initialChainId: 5042,
      }}
      customTheme={getConnectKitTheme(isDark)}
    >
      <App />
      <Toaster position="top-center" />
    </ConnectKitProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Root />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
