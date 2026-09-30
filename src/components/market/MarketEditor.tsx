import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import ImagePicker from '../ImagePicker'
import { useUpdateMarketFlow } from '../../hooks/useEscrow'
import { useContractVersion } from '../../hooks/useMarkets'
import { saveMarketMeta, type MarketMeta } from '../../lib/api'
import { getAdminSession } from '../../lib/adminConfig'
import { parseOnchainError } from '../../lib/errors'
import { CATEGORIES, Market, MarketStatus } from '../../lib/contract'

const toLocal = (ts: bigint) => { const d = new Date(Number(ts) * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const fromLocal = (v: string) => BigInt(Math.floor(new Date(v).getTime() / 1000))
const field = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' } as const

export default function MarketEditor({ market, meta, onMeta, onClose, onSaved }: {
  market: Market; meta: MarketMeta; onMeta: (m: MarketMeta) => void; onClose: () => void; onSaved: () => void
}) {
  const { version } = useContractVersion()
  const upd = useUpdateMarketFlow()
  const canChain = version >= 2
  const open = market.status === MarketStatus.Open
  const [question, setQuestion] = useState(market.question)
  const [category, setCategory] = useState(market.category)
  const [imageUrl, setImageUrl] = useState(market.imageUrl)
  const [endTime, setEndTime] = useState(toLocal(market.endTime))
  const [resTime, setResTime] = useState(toLocal(market.resolutionTime))
  const [desc, setDesc] = useState(meta.description ?? '')
  const [rules, setRules] = useState(meta.resolutionCriteria ?? '')
  const [src, setSrc] = useState((meta.sources ?? []).map(s => `${s.title} | ${s.url}`).join('\n'))
  const [saving, setSaving] = useState(false)
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  const save = async () => {
    const info = question.trim() !== market.question || category !== market.category || imageUrl !== market.imageUrl
    const timesChanged = fromLocal(endTime) !== market.endTime || fromLocal(resTime) !== market.resolutionTime
    const parsedSources = src.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [a, b] = l.includes('|') ? l.split('|') : [l, l]; return { title: a.trim(), url: b.trim() } })
    const metaChanged = desc !== (meta.description ?? '') || rules !== (meta.resolutionCriteria ?? '') || src !== (meta.sources ?? []).map(s => `${s.title} | ${s.url}`).join('\n')

    if (!question.trim() || new TextEncoder().encode(question.trim()).length > 300) return toast.error('The question must be 1–300 characters.')
    if (imageUrl.length > 500) return toast.error('Image link is too long. Use the Upload option.')
    if (timesChanged && (fromLocal(endTime) <= BigInt(Math.floor(Date.now() / 1000)) || fromLocal(resTime) < fromLocal(endTime))) return toast.error('End time must be in the future and resolution time must not be before it.')
    if ((info || timesChanged) && !canChain) return toast.error('This contract version cannot edit those fields onchain. Deploy the updated contract first.')
    if (metaChanged && !getAdminSession()) return toast.error('Sign in on the Admin page first to save rules and sources.')

    setSaving(true)
    try {
      if (info || timesChanged) {
        await upd.run(market.id, {
          info: info ? { question: question.trim(), category, imageUrl } : undefined,
          times: timesChanged && open ? { endTime: fromLocal(endTime), resolutionTime: fromLocal(resTime) } : undefined,
        })
      }
      if (metaChanged) onMeta(await saveMarketMeta(market.id, { description: desc, resolutionCriteria: rules, sources: parsedSources }))
      toast.success('Market updated'); onSaved(); onClose()
    } catch (e) { toast.error(parseOnchainError(e), { duration: 9000 }) } finally { setSaving(false) }
  }

  const label = 'block text-xs mb-1'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Edit market #{String(market.id)}</h2>
          <button onClick={onClose} style={{ color: 'var(--subtle)' }}><X size={18} /></button>
        </div>
        {!canChain && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--warning)', background: 'var(--warning-bg)' }}>
            This market's contract is an older version, so the title, category, image and times can't be changed onchain. Rules and sources below still save. Deploy the updated contract (docs/remix) to unlock full editing.
          </p>
        )}
        <div>
          <label className={label} style={{ color: 'var(--subtle)' }}>Question (onchain)</label>
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} disabled={!canChain} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={field} />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--subtle)' }}>Category (onchain)</label>
          <select value={category} onChange={e => setCategory(e.target.value)} disabled={!canChain} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={field}>
            {[...new Set([...CATEGORIES.filter(c => c !== 'All'), market.category])].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className={canChain ? '' : 'opacity-50 pointer-events-none'}>
          <label className={label} style={{ color: 'var(--subtle)' }}>Image (onchain link)</label>
          <ImagePicker value={imageUrl} onChange={setImageUrl} ai={{ question, outcomes: market.outcomes, category }} />
        </div>
        {open && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={label} style={{ color: 'var(--subtle)' }}>Trading ends</label><input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={!canChain} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={field} /></div>
            <div><label className={label} style={{ color: 'var(--subtle)' }}>Resolution time</label><input type="datetime-local" value={resTime} onChange={e => setResTime(e.target.value)} disabled={!canChain} className="w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50" style={field} /></div>
          </div>
        )}
        <div><label className={label} style={{ color: 'var(--subtle)' }}>About</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={field} /></div>
        <div><label className={label} style={{ color: 'var(--subtle)' }}>Resolution criteria</label><textarea value={rules} onChange={e => setRules(e.target.value)} rows={4} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={field} /></div>
        <div><label className={label} style={{ color: 'var(--subtle)' }}>Sources — one per line: Title | https://url</label><textarea value={src} onChange={e => setSrc(e.target.value)} rows={3} className="w-full rounded-lg px-3 py-2 text-sm outline-none mono" style={field} /></div>
        <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>Changes to the question, category, image and times are onchain transactions (your wallet will ask you to confirm). About, rules and sources are saved on Cloudflare.</p>
        <div className="flex gap-2">
          <button onClick={() => { void save() }} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{saving ? (upd.step || 'Saving…') : 'Save changes'}</button>
          <button onClick={onClose} className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
