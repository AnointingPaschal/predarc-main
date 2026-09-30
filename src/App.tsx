import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import MarketList from './pages/MarketList'
import MarketDetail from './pages/MarketDetail'
import Portfolio from './pages/Portfolio'
import AdminPanel from './pages/AdminPanel'
import BtcRounds from './pages/BtcRounds'
import Footer from './components/Footer'
import { useAccount } from 'wagmi'
import { useSiteConfig, loadConfig, applyThemeVars, isAdminAddress, useNetwork, getActiveContractAddress } from './lib/adminConfig'
import { applyTheme } from './lib/theme'
import { TrendingUp } from 'lucide-react'

export default function App() {
  const network = useNetwork()
  const siteConfig = useSiteConfig()
  const noContract = !getActiveContractAddress(siteConfig)
  useEffect(() => {
    // Apply theme on mount (before first paint)
    applyTheme()
    // Apply admin-configured CSS variables
    const config = loadConfig()
    applyThemeVars(config)
    document.title = config.siteName || 'Predarc'
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-dvh theme-transition" style={{ background: 'var(--bg-gradient)' }}>
        <Navbar />
        {network === 'testnet' && (
          <div className="text-center text-xs py-1.5 font-medium" style={{ background: 'rgba(5,150,105,0.15)', color: '#059669' }}>
            You are viewing Arc Testnet — test USDC only, no real funds.
          </div>
        )}
        {noContract && (
          <div className="text-center text-xs py-2 px-4 font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>
            No {network} contract is configured yet. Switch network, or set the {network} contract address in Admin → Config.
          </div>
        )}
        {/* key = network: everything below remounts and refetches when the network changes */}
        <main className="pb-16" key={network}>
          <Routes>
            <Route path="/" element={<MarketList />} />
            <Route path="/market/:id" element={<MarketDetail />} />
            <Route path="/btc" element={<BtcRounds />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <div
        className="mx-auto mb-6 h-16 w-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <TrendingUp size={28} style={{ color: 'var(--subtle)' }} />
      </div>
      <p className="display text-5xl font-700 mb-3" style={{ color: 'var(--surface-strong)' }}>404</p>
      <p className="font-medium mb-1" style={{ color: 'var(--muted)' }}>Page not found</p>
      <p className="text-sm mb-6" style={{ color: 'var(--subtle)' }}>
        The page you're looking for doesn't exist.
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium theme-transition"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
      >
        Back to Markets
      </a>
    </div>
  )
}
