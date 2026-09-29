import { useEffect, useState } from 'react'
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt, readContract } from 'wagmi/actions'
import { formatUnits, isAddress, parseUnits, zeroAddress } from 'viem'
import { toast } from 'sonner'
import { Save, Power, RefreshCw } from 'lucide-react'
import BtcLogo from '../BtcLogo'
import { BTC_ROUNDS_ABI } from '../../lib/btcRounds'
import { loadConfig, saveConfig, useNetwork, CHAIN_IDS, type Network, type SiteConfig } from '../../lib/adminConfig'
import { parseOnchainError } from '../../lib/errors'

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)]'
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="text-xs mb-1 block" style={{ color: 'var(--subtle)' }}>{label}</label>{children}</div>
)
const card = { background: 'var(--surface)', border: '1px solid var(--border)' } as const

interface Chain {
  enabled: boolean; feeBps: number; minBet: bigint; maxBet: bigint; buffer: number; feed: string; maxStaleness: bigint
  feeRecipient: string; accrued: bigint; owner: string; duration: number
}
interface KeeperInfo { configured: boolean; address?: string; balance?: string; authorized?: boolean | null; feed?: string }

export default function BtcAdmin() {
  const activeNet = useNetwork()
  const [net, setNet] = useState<Network>(activeNet)
  const [cfg, setCfg] = useState<SiteConfig>(loadConfig)
  const addr = (cfg[net].btcRoundsAddress ?? '').trim()
  const valid = isAddress(addr)
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const wagmi = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [chain, setChain] = useState<Chain | null>(null)
  const [keeper, setKeeper] = useState<KeeperInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [f, setF] = useState({ fee: '', min: '', max: '', buffer: '', feed: '', stale: '120', keeper: '', recipient: '' })

  const read = async () => {
    if (!valid) { setChain(null); return }
    const a = addr as `0x${string}`, chainId = CHAIN_IDS[net], abi = BTC_ROUNDS_ABI
    const r = <T,>(functionName: string) => readContract(wagmi, { address: a, abi, functionName, chainId } as never) as Promise<T>
    try {
      const [enabled, feeBps, minBet, maxBet, buffer, feed, maxStaleness, feeRecipient, accrued, owner, duration] = await Promise.all([
        r<boolean>('enabled'), r<bigint>('feeBps'), r<bigint>('minBet'), r<bigint>('maxBet'), r<bigint>('buffer'),
        r<string>('feed'), r<bigint>('maxStaleness'), r<string>('feeRecipient'), r<bigint>('accruedFees'), r<string>('owner'), r<bigint>('duration'),
      ])
      const c = { enabled, feeBps: Number(feeBps), minBet, maxBet, buffer: Number(buffer), feed, maxStaleness, feeRecipient, accrued, owner, duration: Number(duration) }
      setChain(c)
      setF(x => ({ ...x, fee: String(c.feeBps / 100), min: formatUnits(minBet, 6), max: maxBet > 0n ? formatUnits(maxBet, 6) : '0', buffer: String(c.buffer), feed: feed === zeroAddress ? '' : feed, stale: String(maxStaleness), recipient: feedRecipientOr(feeRecipient) }))
    } catch { setChain(null); toast.error('Could not read the rounds contract — check the address and network.') }
    try { setKeeper(await (await fetch(`/api/btc-keeper?network=${net}`)).json()) } catch { setKeeper(null) }
  }
  const feedRecipientOr = (v: string) => v
  useEffect(() => { void read() }, [net, addr]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSite = async () => {
    try { await saveConfig(cfg); setCfg(loadConfig()); toast.success('BTC settings saved') } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed') }
  }

  const tx = async (label: string, functionName: string, args: unknown[]) => {
    if (!valid) return
    setBusy(label)
    try {
      if (chainId !== CHAIN_IDS[net]) await switchChainAsync({ chainId: CHAIN_IDS[net] })
      const hash = await writeContractAsync({ address: addr as `0x${string}`, abi: BTC_ROUNDS_ABI, functionName, args, chainId: CHAIN_IDS[net] } as never)
      await waitForTransactionReceipt(wagmi, { hash, chainId: CHAIN_IDS[net] })
      toast.success(`${label} — done`)
      await read()
    } catch (e) { toast.error(parseOnchainError(e)) } finally { setBusy(null) }
  }

  const notOwner = !!chain && !!address && chain.owner.toLowerCase() !== address.toLowerCase()
  const btn = 'px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-40'
  const primary = { background: 'var(--accent)', color: '#0d1b2f' } as const
  const setCfgNet = (v: string) => setCfg(c => ({ ...c, [net]: { ...c[net], btcRoundsAddress: v } }))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BtcLogo size={28} />
        <h2 className="display text-lg font-700" style={{ color: 'var(--ink)' }}>Bitcoin Up/Down rounds</h2>
        <div className="ml-auto flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['mainnet', 'testnet'] as Network[]).map(n => (
            <button key={n} onClick={() => setNet(n)} className="px-3 py-1 text-xs capitalize" style={{ background: net === n ? 'var(--surface-strong)' : 'transparent', color: net === n ? 'var(--ink)' : 'var(--subtle)' }}>{n}</button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl p-4 space-y-3" style={card}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Site settings (all visitors)</h3>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={cfg.btcEnabled} onChange={e => setCfg(c => ({ ...c, btcEnabled: e.target.checked }))} />
          Enable Bitcoin rounds (off hides the page, menu link and home card)
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={cfg.btcShowOnHome} onChange={e => setCfg(c => ({ ...c, btcShowOnHome: e.target.checked }))} />
          Show the live card on the home page
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={cfg.btcAutoKeeper} onChange={e => setCfg(c => ({ ...c, btcAutoKeeper: e.target.checked }))} />
          Let visitors' browsers trigger the keeper (recommended; also add an external cron, see below)
        </label>
        <Field label="Title"><input className={inputCls} value={cfg.btcTitle} onChange={e => setCfg(c => ({ ...c, btcTitle: e.target.value }))} /></Field>
        <Field label={`Rounds contract address (${net})`}><input className={inputCls + ' mono'} placeholder="0x…" value={cfg[net].btcRoundsAddress ?? ''} onChange={e => setCfgNet(e.target.value)} /></Field>
        <button onClick={saveSite} className={btn + ' w-full flex items-center justify-center gap-2'} style={primary}><Save size={14} /> Save BTC settings</button>
      </section>

      <section className="rounded-2xl p-4 space-y-3" style={card}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>On-chain controls</h3>
          <button onClick={read} className="ml-auto p-1.5 rounded-md" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }} title="Refresh"><RefreshCw size={13} /></button>
        </div>
        {!valid && <p className="text-xs" style={{ color: 'var(--subtle)' }}>Add and save the deployed contract address above to unlock these controls.</p>}
        {valid && !chain && <p className="text-xs" style={{ color: 'var(--subtle)' }}>Reading contract…</p>}
        {notOwner && <p className="text-xs" style={{ color: 'var(--warning)' }}>Your connected wallet isn't the contract owner ({chain?.owner}); changes will fail.</p>}
        {chain && (
          <>
            <div className="flex items-center gap-3 flex-wrap text-sm" style={{ color: 'var(--muted)' }}>
              <span>Round length: <b style={{ color: 'var(--ink)' }}>{chain.duration / 60} min</b> (fixed)</span>
              <span>Betting: <b style={{ color: chain.enabled ? 'var(--success)' : 'var(--danger)' }}>{chain.enabled ? 'open' : 'paused'}</b></span>
              <button disabled={!!busy} onClick={() => tx(chain.enabled ? 'Pause betting' : 'Resume betting', 'setEnabled', [!chain.enabled])} className={btn + ' ml-auto flex items-center gap-1.5'} style={chain.enabled ? { background: 'var(--danger)', color: '#1a0505' } : { background: 'var(--success)', color: '#04140d' }}>
                <Power size={13} /> {chain.enabled ? 'Pause betting' : 'Resume betting'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Fee % (max 10)"><div className="flex gap-2"><input className={inputCls} value={f.fee} onChange={e => setF({ ...f, fee: e.target.value })} /><button disabled={!!busy} className={btn} style={primary} onClick={() => tx('Fee updated', 'setFee', [BigInt(Math.round(Number(f.fee) * 100))])}>Set</button></div></Field>
              <Field label="Settlement window (seconds after each boundary)"><div className="flex gap-2"><input className={inputCls} value={f.buffer} onChange={e => setF({ ...f, buffer: e.target.value })} /><button disabled={!!busy} className={btn} style={primary} onClick={() => tx('Window updated', 'setBuffer', [BigInt(f.buffer || 0)])}>Set</button></div></Field>
              <Field label="Min bet (USDC)"><input className={inputCls} value={f.min} onChange={e => setF({ ...f, min: e.target.value })} /></Field>
              <Field label="Max bet (USDC, 0 = none)"><div className="flex gap-2"><input className={inputCls} value={f.max} onChange={e => setF({ ...f, max: e.target.value })} /><button disabled={!!busy} className={btn} style={primary} onClick={() => tx('Limits updated', 'setBetLimits', [parseUnits(f.min || '0', 6), parseUnits(f.max || '0', 6)])}>Set</button></div></Field>
              <Field label="Chainlink BTC/USD feed (blank = keeper mode)"><input className={inputCls + ' mono'} placeholder="0x… or empty" value={f.feed} onChange={e => setF({ ...f, feed: e.target.value })} /></Field>
              <Field label="Max feed age (seconds)"><div className="flex gap-2"><input className={inputCls} value={f.stale} onChange={e => setF({ ...f, stale: e.target.value })} /><button disabled={!!busy} className={btn} style={primary} onClick={() => { if (f.feed && !isAddress(f.feed)) { toast.error('Invalid feed address'); return } tx('Price source updated', 'setFeed', [(f.feed || zeroAddress) as `0x${string}`, BigInt(f.stale || 120)]) }}>Set</button></div></Field>
              <Field label="Fee recipient"><div className="flex gap-2"><input className={inputCls + ' mono'} value={f.recipient} onChange={e => setF({ ...f, recipient: e.target.value })} /><button disabled={!!busy} className={btn} style={primary} onClick={() => { if (!isAddress(f.recipient)) { toast.error('Invalid address'); return } tx('Recipient updated', 'setFeeRecipient', [f.recipient]) }}>Set</button></div></Field>
              <Field label={`Accrued fees: $${formatUnits(chain.accrued, 6)}`}><button disabled={!!busy || chain.accrued === 0n} className={btn + ' w-full'} style={primary} onClick={() => tx('Fees withdrawn', 'withdrawFees', [])}>Withdraw fees</button></Field>
            </div>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Price source: {chain.feed === zeroAddress ? 'keeper mode (server fetches Coinbase spot at every boundary)' : `Chainlink feed ${chain.feed} — anyone can trigger a price update`}.</p>
          </>
        )}
      </section>

      <section className="rounded-2xl p-4 space-y-3" style={card}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Keeper (automatic price recording)</h3>
        {!keeper?.configured ? (
          <p className="text-xs" style={{ color: 'var(--warning)' }}>
            No keeper wallet yet. In Cloudflare Pages → Settings → Variables and Secrets add a secret <b>KEEPER_PRIVATE_KEY</b> (a fresh wallet used only for this), redeploy, then reopen this tab.
          </p>
        ) : (
          <div className="text-xs space-y-1.5" style={{ color: 'var(--muted)' }}>
            <div>Keeper wallet: <span className="mono" style={{ color: 'var(--ink)' }}>{keeper.address}</span></div>
            <div>Gas balance: <b style={{ color: 'var(--ink)' }}>{keeper.balance ? Number(keeper.balance).toFixed(4) : '—'} USDC</b> {keeper.balance && Number(keeper.balance) < 0.5 ? <span style={{ color: 'var(--warning)' }}>— send a little USDC to this address</span> : null}</div>
            <div>Authorized on the contract: <b style={{ color: keeper.authorized ? 'var(--success)' : 'var(--warning)' }}>{keeper.authorized ? 'yes' : 'no'}</b></div>
            {!keeper.authorized && chain && keeper.address && (
              <button disabled={!!busy} className={btn} style={primary} onClick={() => tx('Keeper authorized', 'setKeeper', [keeper.address, true])}>Authorize this keeper on-chain</button>
            )}
          </div>
        )}
        <details className="text-xs" style={{ color: 'var(--muted)' }}>
          <summary className="cursor-pointer" style={{ color: 'var(--ink)' }}>Make it fully hands-free (external cron)</summary>
          <p className="mt-2">Browsers only ping while someone has the site open. For 24/7 rounds add a free cron (e.g. cron-job.org) that sends a <b>POST</b> every minute to:</p>
          <p className="mono mt-1 break-all" style={{ color: 'var(--ink)' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/btc-keeper?network={net}</p>
          <p className="mt-2">Set the settlement window to at least 90 seconds so a once-a-minute ping always lands inside it.</p>
        </details>
        <Field label="Add / remove another keeper address">
          <div className="flex gap-2 flex-wrap">
            <input className={inputCls + ' mono flex-1'} placeholder="0x…" value={f.keeper} onChange={e => setF({ ...f, keeper: e.target.value })} />
            <button disabled={!!busy} className={btn} style={primary} onClick={() => isAddress(f.keeper) ? tx('Keeper added', 'setKeeper', [f.keeper, true]) : toast.error('Invalid address')}>Add</button>
            <button disabled={!!busy} className={btn} style={{ border: '1px solid var(--border)', color: 'var(--ink)' }} onClick={() => isAddress(f.keeper) ? tx('Keeper removed', 'setKeeper', [f.keeper, false]) : toast.error('Invalid address')}>Remove</button>
          </div>
        </Field>
      </section>
    </div>
  )
}
