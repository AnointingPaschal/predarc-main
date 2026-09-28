import { ConnectKitButton } from 'connectkit'
import { Link, useLocation } from 'react-router-dom'
import { BarChart2, Shield, Zap } from 'lucide-react'
import { loadConfig } from '../lib/adminConfig'

const config = loadConfig()

export default function Navbar() {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <nav className="sticky top-0 z-50 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(13,27,47,0.92)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt={config.siteName} className="h-7 w-7 object-contain" />
          ) : (
            <div className="h-7 w-7 rounded flex items-center justify-center" style={{ background: 'var(--accent)', color: '#0d1b2f' }}>
              <Zap size={14} strokeWidth={2.5} />
            </div>
          )}
          <span className="display font-700 text-base" style={{ color: 'var(--ink)' }}>{config.siteName}</span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/" active={location.pathname === '/'}>Markets</NavLink>
          <NavLink to="/portfolio" active={isActive('/portfolio')}>Portfolio</NavLink>
          <NavLink to="/activity" active={isActive('/activity')}>Activity</NavLink>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            <Shield size={12} />
            Admin
          </Link>
          <ConnectKitButton />
        </div>
      </div>
    </nav>
  )
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
      style={{
        color: active ? 'var(--ink)' : 'var(--subtle)',
        background: active ? 'var(--surface-strong)' : 'transparent',
      }}
    >
      {children}
    </Link>
  )
}
