/**
 * wagmi configuration — Arc Mainnet
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc } from 'viem/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, arc.rpcUrls.default.http[0])

// WalletConnect project ID — required for WalletConnect v2
// Get yours free at https://cloud.walletconnect.com
const WC_PROJECT_ID: string = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? 'a7e5b1c0d3f2e4b6a8c9d0e1f2b3c4d5'

export const config = createConfig({
  chains: [arc, mainnet], // mainnet needed for ENS resolution
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: 'Predarc',
        description: 'Onchain Prediction Markets on Arc',
        url: 'https://predarc.io',
        icons: ['https://predarc.io/logo.png'],
      },
      showQrModal: false, // ConnectKit handles the QR modal
    }),
    coinbaseWallet({
      appName: 'Predarc',
      appLogoUrl: 'https://predarc.io/logo.png',
    }),
  ],
  transports: {
    [arc.id]: http('https://rpc.mainnet.arc.io'),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
