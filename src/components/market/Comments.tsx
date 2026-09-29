import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useSignMessage, useSwitchChain } from 'wagmi'
import type { PublicClient } from 'viem'
import { toast } from 'sonner'
import { Heart, Trash2, Reply, Link2 } from 'lucide-react'
import { addComment, deleteComment, fetchComments, getUserSession, likeComment, signInUser, type Comment } from '../../lib/api'
import { activeChainId, activeContract, activeSettings, getAdminSession } from '../../lib/adminConfig'
import { loadOnchainComments } from '../../lib/marketHistory'
import { useCommentTx } from '../../hooks/useEscrow'
import { useContractVersion } from '../../hooks/useMarkets'
import { parseOnchainError } from '../../lib/errors'
import { explorerBase, shortAddr, timeAgo } from './format'
import type { Network } from '../../lib/adminConfig'

interface Row extends Comment { txHash?: string }

/**
 * Contract v2+ → comments are onchain (events; posting is a wallet transaction).
 * Older contracts → comments are stored on Cloudflare and posted with a free signature.
 */
export default function Comments({ marketId, admin, network }: { marketId: bigint; admin: boolean; network: Network }) {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { signMessageAsync } = useSignMessage()
  const { version, loading: versionLoading } = useContractVersion()
  const onchain = version >= 2
  const client = usePublicClient({ chainId: activeChainId() }) as PublicClient | undefined
  const tx = useCommentTx()

  const [list, setList] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (versionLoading) return
    try {
      if (onchain) { if (!client) return; setList(await loadOnchainComments(client, activeContract(), marketId, activeSettings().deployBlock)) }
      else setList(await fetchComments(marketId))
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load comments') }
  }, [onchain, client, marketId, versionLoading])
  useEffect(() => { setList(null); void load(); const id = setInterval(() => { void load() }, 20000); return () => clearInterval(id) }, [load])

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    try {
      if (!address) throw new Error('Connect your wallet to join the discussion.')
      if (onchain) { if (chainId !== activeChainId()) await switchChainAsync({ chainId: activeChainId() }) }
      else if (!getUserSession(address)) await signInUser(address, a => signMessageAsync(a))
      await fn(); after?.(); await load()
    } catch (e) { toast.error(onchain ? parseOnchainError(e) : e instanceof Error ? e.message.split('\n')[0] : 'Action failed') } finally { setBusy(false) }
  }

  const { top, replies } = useMemo(() => {
    const all = list ?? []
    const rep = new Map<string, Row[]>()
    all.filter(c => c.parentId).forEach(c => rep.set(c.parentId!, [...(rep.get(c.parentId!) ?? []), c]))
    const ids = new Set(all.map(c => c.id))
    return { top: all.filter(c => !c.parentId || !ids.has(c.parentId)).sort((a, b) => b.ts - a.ts), replies: rep }
  }, [list])

  const post = () => {
    const t = text.trim(); if (!t) return
    void act(async () => { if (onchain) await tx.post(marketId, t, BigInt(reply ?? 0)); else await addComment(marketId, t, reply ?? undefined) }, () => { setText(''); setReply(null) })
  }
  const like = (c: Row, liked: boolean) => void act(() => (onchain ? tx.react(BigInt(c.id), !liked) : likeComment(marketId, c.id)))
  const remove = (c: Row, mine: boolean) => {
    if (onchain) return void act(() => tx.remove(BigInt(c.id)))
    if (!mine && admin) { setBusy(true); deleteComment(marketId, c.id, true).then(() => load()).catch(e => toast.error(e.message)).finally(() => setBusy(false)); return }
    void act(() => deleteComment(marketId, c.id, false))
  }

  const row = (c: Row, nested = false) => {
    const mine = !!address && c.address === address.toLowerCase()
    const liked = !!address && (c.likes ?? []).includes(address.toLowerCase())
    return (
      <div key={c.id} className={nested ? 'ml-8 mt-3' : ''}>
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: `hsl(${parseInt(c.address.slice(2, 8), 16) % 360} 60% 55%)` }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold" style={{ color: mine ? 'var(--accent)' : 'var(--ink)' }}>{shortAddr(c.address)}{mine ? ' (you)' : ''}</span>
              <span style={{ color: 'var(--subtle)' }}>{c.ts ? timeAgo(Math.floor(c.ts / 1000)) : ''}</span>
              {c.txHash && <a href={`${explorerBase(network)}/tx/${c.txHash}`} target="_blank" rel="noopener noreferrer" title="View onchain" style={{ color: 'var(--subtle)' }}><Link2 size={11} /></a>}
            </div>
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words" style={{ color: 'var(--ink-2)' }}>{c.text}</p>
            <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              <button disabled={busy} onClick={() => like(c, liked)} className="flex items-center gap-1" style={{ color: liked ? 'var(--danger)' : undefined }}>
                <Heart size={12} fill={liked ? 'currentColor' : 'none'} />{c.likes?.length || ''}
              </button>
              {!nested && <button onClick={() => setReply(reply === c.id ? null : c.id)} className="flex items-center gap-1"><Reply size={12} />Reply</button>}
              {(mine || admin) && <button disabled={busy} onClick={() => remove(c, mine)} className="flex items-center gap-1"><Trash2 size={12} />Delete</button>}
            </div>
          </div>
        </div>
        {(replies.get(c.id) ?? []).sort((a, b) => a.ts - b.ts).map(r => row(r, true))}
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
          <button onClick={post} disabled={busy || !text.trim() || !address} className="px-4 rounded-lg text-sm font-semibold disabled:opacity-50 self-stretch" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? '…' : 'Post'}</button>
        </div>
        <div className="text-xs mt-1 flex justify-between gap-3" style={{ color: 'var(--subtle)' }}>
          <span>{onchain ? 'Comments are stored onchain — posting is a transaction and costs a little gas.' : address && !getUserSession(address) ? 'You will be asked to sign a free message once (no gas).' : ' '}</span><span>{text.length}/600</span>
        </div>
      </div>
      {error && <p className="text-xs mb-3" style={{ color: 'var(--danger)' }}>{error} <button className="underline" onClick={() => { void load() }}>Retry</button></p>}
      {list === null && !error && <p className="text-sm" style={{ color: 'var(--subtle)' }}>Loading…</p>}
      {list && top.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--subtle)' }}>No comments yet. Start the conversation.</p>}
      <div className="space-y-4">{top.map(c => row(c))}</div>
      {!onchain && admin && !getAdminSession() && <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>Sign in on the Admin page to moderate other users' comments.</p>}
    </div>
  )
}
