import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useAccount } from 'wagmi'
import { arc, arcTestnet } from 'viem/chains'
import { Github, Twitter, MessageCircle, ExternalLink, ShieldCheck, Zap, Coins, Trophy } from 'lucide-react'
import BtcLogo from './BtcLogo'
import { useSiteConfig, useNetwork, activeChainId, getNetworkSettings, isAdminAddress } from '../lib/adminConfig'
import { useBtcAvailable, usd } from '../lib/btcRounds'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function Footer() {
  const cfg = useSiteConfig()
  const network = useNetwork()
  const { address } = useAccount()
  const client = usePublicClient({ chainId: activeChainId() })
  const btcOn = useBtcAvailable()
  const isAdmin = isAdminAddress(address, cfg.adminWallet)
  const chain = network === 'testnet' ? arcTestnet : arc
  const explorer = chain.blockExplorers?.default.url?.replace(/\/$/, '') ?? ''
  const ns = getNetworkSettings(cfg, network)
  const contract = ns.contractAddress?.trim()
  const btcContract = ns.btcRoundsAddress?.trim()

  const { data: block, isError } = useQuery({
    queryKey: ['footer-block', activeChainId()],
    enabled: !!client,
    refetchInterval: 15_000,
    queryFn: async () => Number(await client!.getBlockNumber()),
  })
  const { data: btc } = useQuery({
    queryKey: ['footer-btc'],
    refetchInterval: 20_000,
    queryFn: async () => Number(((await (await fetch('/api/btc-price')).json()) as { price?: number }).price ?? 0),
  })
  const ok = !!block && !isError

  const socials = [
    { href: cfg.twitterUrl, label: 'Twitter / X', icon: <Twitter size={15} /> },
    { href: cfg.discordUrl, label: 'Discord', icon: <MessageCircle size={15} /> },
    { href: cfg.githubUrl || 'https://github.com/AnointingPaschal/predarc-main', label: 'GitHub', icon: <Github size={15} /> },
  ].filter(s => s.href)

  const steps = [
    { icon: <Zap size={16} />, t: 'Pick a market', d: 'Politics, sports, crypto and more — every price is a live probability.' },
    { icon: <Coins size={16} />, t: 'Trade with USDC', d: 'Buy and sell outcome shares any time before the market closes.' },
    { icon: <Trophy size={16} />, t: 'Get paid onchain', d: 'Winning shares redeem 1:1 in USDC straight to your wallet.' },
    { icon: <ShieldCheck size={16} />, t: 'Transparent by design', d: 'Open contract, public trades, refunds if a market is cancelled.' },
  ]
  const link = 'text-sm theme-transition hover:opacity-100 opacity-80'
  const head = 'text-[11px] font-semibold uppercase tracking-widest mb-3'

  return (
    <footer className="mt-16 theme-transition" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* How it works strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-8" style={{ borderBottom: '1px solid var(--border)' }}>
          {steps.map(s => (
            <div key={s.t} className="flex gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>{s.icon}</div>
              <div><div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.t}</div><div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{s.d}</div></div>
            </div>
          ))}
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] gap-8 py-10">
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              {cfg.logoUrl ? <img src={cfg.logoUrl} alt="" className="h-7 w-auto" /> : null}
              <span className="display font-700 text-lg" style={{ color: 'var(--ink)' }}>{cfg.siteName || 'Predarc'}</span>
            </div>
            <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>{cfg.tagline || 'Predict. Trade. Win.'} Onchain prediction markets on Arc, settled in USDC.</p>
            <div className="flex gap-2 mt-4">
              {socials.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} className="w-9 h-9 rounded-lg flex items-center justify-center theme-transition hover:-translate-y-0.5 transition" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>{s.icon}</a>
              ))}
            </div>
          </div>

          <nav>
            <div className={head} style={{ color: 'var(--subtle)' }}>Markets</div>
            <ul className="space-y-2">
              <li><Link to="/" className={link} style={{ color: 'var(--ink)' }}>All markets</Link></li>
              {btcOn && <li><Link to="/btc" className={link + ' inline-flex items-center gap-1.5'} style={{ color: 'var(--ink)' }}><BtcLogo size={13} /> Bitcoin Up/Down</Link></li>}
              <li><Link to="/portfolio" className={link} style={{ color: 'var(--ink)' }}>Portfolio</Link></li>
            </ul>
          </nav>

          <nav>
            <div className={head} style={{ color: 'var(--subtle)' }}>Protocol</div>
            <ul className="space-y-2">
              {explorer && contract && <li><a href={`${explorer}/address/${contract}`} target="_blank" rel="noopener noreferrer" className={link + ' inline-flex items-center gap-1'} style={{ color: 'var(--ink)' }}>Market contract <ExternalLink size={11} /></a></li>}
              {explorer && btcContract && <li><a href={`${explorer}/address/${btcContract}`} target="_blank" rel="noopener noreferrer" className={link + ' inline-flex items-center gap-1'} style={{ color: 'var(--ink)' }}>Bitcoin rounds <ExternalLink size={11} /></a></li>}
              {explorer && <li><a href={explorer} target="_blank" rel="noopener noreferrer" className={link + ' inline-flex items-center gap-1'} style={{ color: 'var(--ink)' }}>Block explorer <ExternalLink size={11} /></a></li>}
              <li><a href={cfg.githubUrl || 'https://github.com/AnointingPaschal/predarc-main'} target="_blank" rel="noopener noreferrer" className={link + ' inline-flex items-center gap-1'} style={{ color: 'var(--ink)' }}>Source code <ExternalLink size={11} /></a></li>
            </ul>
          </nav>

          <nav>
            <div className={head} style={{ color: 'var(--subtle)' }}>Community</div>
            <ul className="space-y-2">
              {cfg.twitterUrl && <li><a href={cfg.twitterUrl} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--ink)' }}>Twitter / X</a></li>}
              {cfg.discordUrl && <li><a href={cfg.discordUrl} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--ink)' }}>Discord</a></li>}
              <li><a href={cfg.githubUrl || 'https://github.com/AnointingPaschal/predarc-main'} target="_blank" rel="noopener noreferrer" className={link} style={{ color: 'var(--ink)' }}>GitHub</a></li>
              {isAdmin && <li><Link to="/admin" className={link} style={{ color: 'var(--ink)' }}>Admin</Link></li>}
            </ul>
          </nav>

          {/* Live status */}
          <div className="rounded-2xl p-4 col-span-2 md:col-span-2 lg:col-span-1" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div className={head} style={{ color: 'var(--subtle)' }}>Network status</div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span style={{ color: 'var(--muted)' }}>Network</span><span className="font-semibold" style={{ color: 'var(--ink)' }}>Arc {network === 'testnet' ? 'Testnet' : 'Mainnet'}</span></div>
              <div className="flex items-center justify-between"><span style={{ color: 'var(--muted)' }}>Status</span><span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--warning)' }}><span className={`w-1.5 h-1.5 rounded-full ${ok ? 'animate-pulse' : ''}`} style={{ background: 'currentColor' }} />{ok ? 'Operational' : 'Connecting'}</span></div>
              <div className="flex items-center justify-between"><span style={{ color: 'var(--muted)' }}>Latest block</span><span className="num" style={{ color: 'var(--ink)' }}>{block ? `#${block.toLocaleString()}` : '—'}</span></div>
              {btc ? <div className="flex items-center justify-between"><span style={{ color: 'var(--muted)' }}>BTC / USD</span><span className="num" style={{ color: 'var(--ink)' }}>{usd(btc)}</span></div> : null}
              {contract && <div className="flex items-center justify-between"><span style={{ color: 'var(--muted)' }}>Contract</span>{explorer ? <a href={`${explorer}/address/${contract}`} target="_blank" rel="noopener noreferrer" className="mono" style={{ color: 'var(--accent)' }}>{short(contract)}</a> : <span className="mono" style={{ color: 'var(--ink)' }}>{short(contract)}</span>}</div>}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-5 flex flex-col md:flex-row md:items-center gap-3 md:justify-between text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--subtle)' }}>
          <span>© {new Date().getFullYear()} {cfg.siteName || 'Predarc'}. {cfg.footerText || 'Powered by Arc. Built with Circle USDC.'}</span>
          <span className="max-w-xl">Prediction markets involve risk and you can lose what you trade. Prices reflect crowd opinion, not advice. Only trade what you can afford to lose, and check that markets are available where you live.</span>
        </div>
      </div>
    </footer>
  )
}
