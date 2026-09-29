import { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Link, useLocation } from 'react-router-dom'
import { BarChart2, Shield, Sun, Moon, Menu, X, TrendingUp, Briefcase } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { useSiteConfig, reapplyThemeVars, isAdminAddress, useNetwork, setSelectedNetwork, type Network } from '../lib/adminConfig'
import { getTheme, toggleTheme, type Theme } from '../lib/theme'

export default function Navbar() {
  const location = useLocation()
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [mobileOpen, setMobileOpen] = useState(false)
  const config = useSiteConfig()
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const network = useNetwork()
  const isAdmin = isAdminAddress(address, config.adminWallet)

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  function handleToggleTheme() {
    const next = toggleTheme()
    setThemeState(next)
    // Re-apply admin-configured colors for the new mode
    reapplyThemeVars()
  }

  // Close mobile menu on route change — check mobileOpen first to avoid unnecessary re-renders
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  async function handleNetwork(n: Network) {
    if (n === network) return
    setSelectedNetwork(n)
    const target = n === 'testnet' ? 5042002 : 5042
    if (address && chainId !== target) {
      try { await switchChainAsync({ chainId: target }) }
      catch { toast.info(`Viewing ${n}. Switch your wallet to Arc ${n === 'testnet' ? 'Testnet' : 'Mainnet'} to transact.`) }
    }
  }

  const isDark = theme === 'dark'

  return (
    <>
      <nav
        className="sticky top-0 z-50 border-b theme-transition"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            {config.logoUrl ? (
              <img src={config.logoUrl} alt={config.siteName} className="h-8 w-8 object-contain rounded-lg" />
            ) : (
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center shadow-sm"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                <BarChart2 size={16} strokeWidth={2.5} />
              </div>
            )}
            <div className="flex flex-col leading-none">
              <span className="display font-700 text-[15px] tracking-tight" style={{ color: 'var(--ink)' }}>
                {config.siteName || 'Predarc'}
              </span>
              <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'var(--subtle)' }}>
                Prediction Markets
              </span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/" active={isActive('/')} icon={<TrendingUp size={13} strokeWidth={2} />}>
              Markets
            </NavLink>
            <NavLink to="/portfolio" active={isActive('/portfolio')} icon={<Briefcase size={13} strokeWidth={2} />}>
              Portfolio
            </NavLink>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Network switcher — for everyone; decides which network's data is shown */}
            <div
              className="flex rounded-xl overflow-hidden flex-shrink-0"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
              role="group"
              aria-label="Network"
            >
              {(['mainnet', 'testnet'] as const).map(n => (
                <button
                  key={n}
                  onClick={() => void handleNetwork(n)}
                  className="h-9 px-2.5 text-[11px] font-semibold capitalize theme-transition"
                  style={{
                    background: network === n ? (n === 'testnet' ? '#059669' : 'var(--accent)') : 'transparent',
                    color: network === n ? '#fff' : 'var(--muted)',
                  }}
                >
                  {n === 'mainnet' ? 'Main' : 'Test'}<span className="hidden sm:inline">{n === 'mainnet' ? 'net' : 'net'}</span>
                </button>
              ))}
            </div>

            {/* Theme toggle */}
            <button
              onClick={handleToggleTheme}
              className="h-9 w-9 rounded-xl flex items-center justify-center theme-transition"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
            </button>

            {/* Admin link (desktop) — only rendered for the admin wallet */}
            {isAdmin && <Link
              to="/admin"
              className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium theme-transition"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <Shield size={12} strokeWidth={2} />
              Admin
            </Link>}

            {/* Connect wallet */}
            <ConnectKitButton />

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="md:hidden h-9 w-9 rounded-xl flex items-center justify-center theme-transition"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div
            className="md:hidden border-t px-4 py-3 flex flex-col gap-1 theme-transition"
            style={{ borderColor: 'var(--border)', background: 'var(--nav-bg)' }}
          >
            <MobileNavLink to="/" active={isActive('/')} icon={<TrendingUp size={14} />}>Markets</MobileNavLink>
            <MobileNavLink to="/portfolio" active={isActive('/portfolio')} icon={<Briefcase size={14} />}>Portfolio</MobileNavLink>
            {isAdmin && <MobileNavLink to="/admin" active={isActive('/admin')} icon={<Shield size={14} />}>Admin</MobileNavLink>}
          </div>
        )}
      </nav>

      {/* Live indicator strip */}
      <div
        className="h-0.5 w-full"
        style={{
          background: `linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)`,
          opacity: 0.4,
        }}
      />
    </>
  )
}

function NavLink({
  to, active, icon, children,
}: { to: string; active: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-medium theme-transition"
      style={{
        color: active ? 'var(--ink)' : 'var(--muted)',
        background: active ? 'var(--surface-strong)' : 'transparent',
        border: active ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      {icon}
      {children}
    </Link>
  )
}

function MobileNavLink({
  to, active, icon, children,
}: { to: string; active: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium theme-transition"
      style={{
        color: active ? 'var(--ink)' : 'var(--muted)',
        background: active ? 'var(--surface-strong)' : 'transparent',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}>{icon}</span>
      {children}
    </Link>
  )
}
