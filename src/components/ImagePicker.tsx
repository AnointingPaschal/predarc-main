import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { uploadMarketImage } from '../lib/api'
import { getAdminSession } from '../lib/adminConfig'

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const inputStyle = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' } as const

/** Paste an image URL or upload a file (resized, stored on Cloudflare, short link goes onchain). */
export default function ImagePicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const pick = async (file?: File) => {
    if (!file) return
    if (!getAdminSession()) return toast.error('Sign in on the Admin page first.')
    setBusy(true)
    try { onChange(await uploadMarketImage(file)); toast.success('Image uploaded') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Upload failed') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  return (
    <div className="space-y-2">
      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['url', 'upload'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} className="px-3 py-1.5 text-xs font-medium"
            style={{ background: mode === m ? 'var(--accent)' : 'var(--surface-muted)', color: mode === m ? '#fff' : 'var(--muted)' }}>
            {m === 'url' ? 'Image URL' : 'Upload file'}
          </button>
        ))}
      </div>
      {mode === 'url' ? (
        <input value={value} onChange={e => onChange(e.target.value.trim())} placeholder="https://…" className={inputCls} style={inputStyle} />
      ) : (
        <div className="flex items-center gap-3">
          {value && <img src={value} alt="" className="h-12 w-12 object-cover rounded-lg flex-shrink-0" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />}
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs disabled:opacity-60"
            style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <Upload size={12} />{busy ? 'Uploading…' : value ? 'Replace image' : 'Choose image'}
          </button>
          {value && <button type="button" onClick={() => onChange('')} className="text-xs" style={{ color: 'var(--danger)' }}>Remove</button>}
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { void pick(e.target.files?.[0]) }} />
        </div>
      )}
      {value && mode === 'url' && <p className="text-[11px] truncate" style={{ color: 'var(--subtle)' }}>{value}</p>}
    </div>
  )
}
