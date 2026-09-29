/**
 * wagmi configuration — Arc Mainnet
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { custom } from 'viem'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { CHAIN_IDS, getNetworkSettings, loadConfig, type Network } from './lib/adminConfig'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, arc.rpcUrls.default.http[0])
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
void CHAIN_IDS

// Reads go to the RPC URL saved for each network in Admin → Config (looked up on
// every request, so changing it takes effect without a rebuild).
const DEFAULT_RPC: Record<Network, string> = {
  mainnet: 'https://rpc.mainnet.arc.io',
  testnet: 'https://rpc.testnet.arc.network',
}

function configurableRpc(network: Network) {
  return custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      const url = getNetworkSettings(loadConfig(), network).rpcUrl.trim() || DEFAULT_RPC[network]
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (!res.ok) throw Object.assign(new Error(`RPC ${res.status} from ${url}`), { code: -32603 })
      const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } }
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data })
      return json.result
    },
  })
}

// WalletConnect project ID — required for WalletConnect v2
// Get yours free at https://cloud.walletconnect.com
const WC_PROJECT_ID: string = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? 'a7e5b1c0d3f2e4b6a8c9d0e1f2b3c4d5'

export const config = createConfig({
  chains: [arc, arcTestnet, mainnet], // mainnet needed for ENS resolution
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
    [arc.id]: configurableRpc('mainnet'),
    [arcTestnet.id]: configurableRpc('testnet'),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
