import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import MarketList from './pages/MarketList'
import MarketDetail from './pages/MarketDetail'
import Portfolio from './pages/Portfolio'
import AdminPanel from './pages/AdminPanel'
import { loadConfig, applyCssVars } from './lib/adminConfig'

export default function App() {
  // Apply admin-configured CSS variables on mount
  useEffect(() => {
    const config = loadConfig()
    applyCssVars(config)
    // Update page title
    document.title = config.siteName || 'Predarc'
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
        <Navbar />
        <main>
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
  const config = loadConfig()
  return (
    <footer className="mt-16 border-t py-6" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
        <span>{config.footerText}</span>
        <div className="flex items-center gap-4">
          {config.twitterUrl && <a href={config.twitterUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">Twitter</a>}
          {config.discordUrl && <a href={config.discordUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">Discord</a>}
          {config.githubUrl && <a href={config.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">GitHub</a>}
          <a href="/admin" className="hover:opacity-80">Admin</a>
        </div>
      </div>
    </footer>
  )
}

function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-4xl font-bold mb-4" style={{ color: 'var(--muted)' }}>404</p>
      <p style={{ color: 'var(--subtle)' }}>Page not found.</p>
      <a href="/" className="text-sm mt-4 block" style={{ color: 'var(--accent)' }}>Go home</a>
    </div>
  )
}
