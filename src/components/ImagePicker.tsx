import { useRef, useState } from 'react'
import { Upload, Sparkles, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { uploadMarketImage, generateMarketImage } from '../lib/api'
import { getAdminSession, loadConfig } from '../lib/adminConfig'

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const inputStyle = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' } as const

export interface ImageAiContext { question: string; outcomes: string[]; category?: string }

/** Paste an image URL, upload a file, or generate a cover with AI that is strictly about this market (and regenerate until it's right). */
export default function ImagePicker({ value, onChange, ai }: { value: string; onChange: (url: string) => void; ai?: ImageAiContext }) {
  const [mode, setMode] = useState<'url' | 'upload' | 'ai'>(ai ? 'ai' : 'url')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [web, setWeb] = useState(() => loadConfig().openrouterWebSearch)
  const ref = useRef<HTMLInputElement>(null)

  const pick = async (file?: File) => {
    if (!file) return
    if (!getAdminSession()) return toast.error('Sign in on the Admin page first.')
    setBusy(true)
    try { onChange(await uploadMarketImage(file)); toast.success('Image uploaded') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Upload failed') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  const generate = async () => {
    if (!ai) return
    if (!getAdminSession()) return toast.error('Sign in on the Admin page first.')
    if (!ai.question.trim()) return toast.error('Write the market question first — the image is made from it.')
    setBusy(true)
    try { onChange(await generateMarketImage({ question: ai.question, outcomes: ai.outcomes, category: ai.category, webSearch: web, hint })); toast.success('Cover generated') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Image generation failed') }
    finally { setBusy(false) }
  }

  const modes = (ai ? ['ai', 'url', 'upload'] : ['url', 'upload']) as ('ai' | 'url' | 'upload')[]
  const label = { ai: 'Generate with AI', url: 'Image URL', upload: 'Upload file' }
  return (
    <div className="space-y-2">
      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', width: 'fit-content' }}>
        {modes.map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} className="px-3 py-1.5 text-xs font-medium"
            style={{ background: mode === m ? 'var(--accent)' : 'var(--surface-muted)', color: mode === m ? '#fff' : 'var(--muted)' }}>
            {label[m]}
          </button>
        ))}
      </div>

      {value && (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="h-20 w-20 object-cover rounded-xl flex-shrink-0" style={{ border: '1px solid var(--border)' }} onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
          <button type="button" onClick={() => onChange('')} className="text-xs" style={{ color: 'var(--danger)' }}>Remove image</button>
        </div>
      )}

      {mode === 'ai' && ai && (
        <div className="space-y-2">
          <input value={hint} onChange={e => setHint(e.target.value)} placeholder="Optional direction, e.g. “show the Swedish parliament building”" className={inputCls} style={inputStyle} />
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={web} onChange={e => setWeb(e.target.checked)} />
            Search the web first so the picture matches the real teams, flags and places (uses a little credit)
          </label>
          <button type="button" disabled={busy} onClick={() => { void generate() }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: '#fff' }}>
            {busy ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}{busy ? 'Generating… (can take ~30s)' : value ? 'Regenerate image' : 'Generate image'}
          </button>
        </div>
      )}
      {mode === 'url' && <input value={value} onChange={e => onChange(e.target.value.trim())} placeholder="https://…" className={inputCls} style={inputStyle} />}
      {mode === 'upload' && (
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs disabled:opacity-60"
            style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <Upload size={12} />{busy ? 'Uploading…' : value ? 'Replace image' : 'Choose image'}
          </button>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { void pick(e.target.files?.[0]) }} />
        </div>
      )}
    </div>
  )
}
