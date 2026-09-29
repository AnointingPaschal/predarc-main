import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import MarketList from './pages/MarketList'
import MarketDetail from './pages/MarketDetail'
import Portfolio from './pages/Portfolio'
import AdminPanel from './pages/AdminPanel'
import { useAccount } from 'wagmi'
import { useSiteConfig, loadConfig, applyThemeVars, isAdminAddress } from './lib/adminConfig'
import { applyTheme } from './lib/theme'
import { TrendingUp } from 'lucide-react'

export default function App() {
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
        <main className="pb-16">
          <Routes>
            <Route path="/" element={<MarketList />} />
            <Route path="/market/:id" element={<MarketDetail />} />
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

function Footer() {
  const config = useSiteConfig()
  const { address } = useAccount()
  const isAdmin = isAdminAddress(address, config.adminWallet)
  return (
    <footer
      className="border-t py-8 theme-transition"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <span className="display font-700 text-sm" style={{ color: 'var(--ink)' }}>
              {config.siteName || 'Predarc'}
            </span>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              {config.footerText || 'Powered by Arc. Built with Circle USDC.'}
            </span>
          </div>
          <div className="flex items-center gap-5">
            {config.twitterUrl && (
              <a href={config.twitterUrl} target="_blank" rel="noopener noreferrer" className="text-xs theme-transition hover:opacity-80" style={{ color: 'var(--subtle)' }}>
                Twitter
              </a>
            )}
            {config.discordUrl && (
              <a href={config.discordUrl} target="_blank" rel="noopener noreferrer" className="text-xs theme-transition hover:opacity-80" style={{ color: 'var(--subtle)' }}>
                Discord
              </a>
            )}
            {config.githubUrl && (
              <a href={config.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs theme-transition hover:opacity-80" style={{ color: 'var(--subtle)' }}>
                GitHub
              </a>
            )}
            {isAdmin && (
              <a
                href="/admin"
                className="text-xs theme-transition hover:opacity-80"
                style={{ color: 'var(--subtle)' }}
              >
                Admin
              </a>
            )}
          </div>
        </div>
        <div
          className="mt-6 pt-4 flex items-center justify-center gap-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>
            Built onchain with{' '}
            <span style={{ color: 'var(--accent)' }}>USDC</span>
            {' '}on{' '}
            <span style={{ color: 'var(--accent)' }}>Arc</span>
          </span>
        </div>
      </div>
    </footer>
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
