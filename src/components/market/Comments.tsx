import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { toast } from 'sonner'
import { Heart, Trash2, Reply } from 'lucide-react'
import { addComment, deleteComment, fetchComments, getUserSession, likeComment, signInUser, type Comment } from '../../lib/api'
import { getAdminSession } from '../../lib/adminConfig'
import { shortAddr, timeAgo } from './format'

export default function Comments({ marketId, admin }: { marketId: bigint; admin: boolean }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [list, setList] = useState<Comment[] | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => fetchComments(marketId).then(c => { setList(c); setError('') }).catch(e => setError(e instanceof Error ? e.message : 'Failed to load comments')), [marketId])
  useEffect(() => { void load(); const id = setInterval(() => { void load() }, 20000); return () => clearInterval(id) }, [load])

  const ensureSession = async () => {
    if (!address) throw new Error('Connect your wallet to join the discussion.')
    if (!getUserSession(address)) await signInUser(address, a => signMessageAsync(a))
  }
  const act = async (fn: () => Promise<Comment[]>) => {
    setBusy(true)
    try { await ensureSession(); setList(await fn()) } catch (e) { toast.error(e instanceof Error ? e.message.split('\n')[0] : 'Action failed') } finally { setBusy(false) }
  }

  const { top, replies } = useMemo(() => {
    const all = list ?? []
    const rep = new Map<string, Comment[]>()
    all.filter(c => c.parentId).forEach(c => rep.set(c.parentId!, [...(rep.get(c.parentId!) ?? []), c]))
    return { top: all.filter(c => !c.parentId).sort((a, b) => b.ts - a.ts), replies: rep }
  }, [list])

  const post = async () => {
    const t = text.trim(); if (!t) return
    await act(async () => { const r = await addComment(marketId, t, reply ?? undefined); setText(''); setReply(null); return r })
  }

  const row = (c: Comment, nested = false) => {
    const mine = !!address && c.address === address.toLowerCase()
    const liked = !!address && (c.likes ?? []).includes(address.toLowerCase())
    return (
      <div key={c.id} className={nested ? 'ml-8 mt-3' : ''}>
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: `hsl(${parseInt(c.address.slice(2, 8), 16) % 360} 60% 55%)` }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold" style={{ color: mine ? 'var(--accent)' : 'var(--ink)' }}>{shortAddr(c.address)}{mine ? ' (you)' : ''}</span>
              <span style={{ color: 'var(--subtle)' }}>{timeAgo(Math.floor(c.ts / 1000))}</span>
            </div>
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'var(--ink-2)' }}>{c.text}</p>
            <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              <button disabled={busy} onClick={() => act(() => likeComment(marketId, c.id))} className="flex items-center gap-1" style={{ color: liked ? 'var(--danger)' : undefined }}>
                <Heart size={12} fill={liked ? 'currentColor' : 'none'} />{c.likes?.length || ''}
              </button>
              {!nested && <button onClick={() => setReply(reply === c.id ? null : c.id)} className="flex items-center gap-1"><Reply size={12} />Reply</button>}
              {(mine || admin) && <button disabled={busy} onClick={() => {
                if (!admin || mine) { void act(() => deleteComment(marketId, c.id, false)) }
                else { setBusy(true); deleteComment(marketId, c.id, true).then(setList).catch(e => toast.error(e.message)).finally(() => setBusy(false)) }
              }} className="flex items-center gap-1"><Trash2 size={12} />Delete</button>}
            </div>
          </div>
        </div>
        {(replies.get(c.id) ?? []).map(r => row(r, true))}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        {reply && <div className="text-xs mb-1" style={{ color: 'var(--subtle)' }}>Replying to a comment · <button onClick={() => setReply(null)} style={{ color: 'var(--accent)' }}>cancel</button></div>}
        <div className="flex gap-2">
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, 600))} rows={2} placeholder={address ? 'Share your take…' : 'Connect a wallet to comment'}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
          <button onClick={post} disabled={busy || !text.trim() || !address} className="px-4 rounded-lg text-sm font-semibold disabled:opacity-50 self-stretch" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Post</button>
        </div>
        <div className="text-xs mt-1 flex justify-between" style={{ color: 'var(--subtle)' }}>
          <span>{address && !getUserSession(address) ? 'You will be asked to sign a free message once (no gas).' : ' '}</span><span>{text.length}/600</span>
        </div>
      </div>
      {error && <p className="text-xs mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      {list === null && !error && <p className="text-sm" style={{ color: 'var(--subtle)' }}>Loading…</p>}
      {list && top.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--subtle)' }}>No comments yet. Start the conversation.</p>}
      <div className="space-y-4">{top.map(c => row(c))}</div>
      {admin && !getAdminSession() && <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>Sign in on the Admin page to moderate other users' comments.</p>}
    </div>
  )
}
