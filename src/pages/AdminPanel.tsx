import { useState, useRef, useEffect } from 'react'
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Shield, Plus, Settings, DollarSign, BarChart2, Palette, Save, Upload, RefreshCw, Sparkles, Bitcoin, Trophy } from 'lucide-react'
import BtcAdmin from '../components/admin/BtcAdmin'
import SportsAdmin from '../components/admin/SportsAdmin'
import { Link } from 'react-router-dom'
import { useAllMarkets, usePlatformFee, useFeeRecipient, useAccruedFees, useContractGuard } from '../hooks/useMarkets'
import {
  useCreateMarketFlow, useSetMinLiquidity, useResolveMarket, useResolveScalarMarket,
  useCancelMarket, useCloseMarket, useFeatureMarket, useSetFee, useWithdrawFees
} from '../hooks/useEscrow'
import { Market, MarketStatus, MarketType, formatUsdc, parseUsdc, CATEGORIES } from '../lib/contract'
import { loadConfig, useNetwork, activeSettings, saveConfig, resetConfig, useSiteConfig, isAdminAddress, getAdminSession, signInAsAdmin, DEFAULT_DARK, DEFAULT_LIGHT, CHAIN_IDS, SiteConfig, ThemeColors, NetworkSettings, Network, getActiveContractAddress } from '../lib/adminConfig'
import { checkContract, type CheckLine } from '../lib/contractCheck'
import ImagePicker from '../components/ImagePicker'
import { normalizeDraft, OPENROUTER_MODELS, testOpenRouterConnection, fetchOpenRouterModels, type ConnectionStep, type OpenRouterModel } from '../lib/aiMarkets'
import AIMarketGenerator from '../components/AIMarketGenerator'
import type { AIMarketDraft } from '../lib/aiMarkets'
import { parseOnchainError } from '../lib/errors'

function activeAddress() { return getActiveContractAddress(loadConfig()) as `0x${string}` }

type Tab = 'markets' | 'create' | 'fees' | 'branding' | 'config' | 'ai' | 'btc' | 'sports'

export default function AdminPanel() {
  const { address } = useAccount()
  const siteConfig = useSiteConfig()
  const { signMessageAsync } = useSignMessage()
  const [tab, setTab] = useState<Tab>('markets')
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')
  const [, bump] = useState(0)
  const isAdmin = isAdminAddress(address, siteConfig.adminWallet)
  const verified = !!address && !!getAdminSession(address)

  async function handleSignIn() {
    if (!address) return
    setSigning(true)
    setSignError('')
    try {
      await signInAsAdmin(address, args => signMessageAsync(args))
      bump(n => n + 1)
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setSigning(false)
    }
  }

  if (address && !isAdmin) {
    // Non-admins get the same page as an unknown route — no hint of what lives here.
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <p className="display text-5xl font-700 mb-3" style={{ color: 'var(--surface-strong)' }}>404</p>
        <p className="font-medium mb-6" style={{ color: 'var(--muted)' }}>Page not found</p>
        <a href="/" className="inline-flex px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          Back to Markets
        </a>
      </div>
    )
  }

  if (address && isAdmin && !verified) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Shield size={40} className="mx-auto mb-4" style={{ color: 'var(--accent)' }} />
        <h1 className="display text-2xl font-600 mb-2" style={{ color: 'var(--ink)' }}>Admin Panel</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--subtle)' }}>
          Sign a message with your admin wallet to unlock settings. This costs no gas and is valid for one hour.
        </p>
        <button
          onClick={handleSignIn}
          disabled={signing}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          {signing ? 'Waiting for signature…' : 'Sign in as admin'}
        </button>
        {signError && (
          <p className="mt-4 text-xs rounded-lg px-3 py-2 text-left" style={{ color: 'var(--danger)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            {signError}
          </p>
        )}
      </div>
    )
  }

  if (!address) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Shield size={40} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--muted)' }} />
        <h1 className="display text-2xl font-600 mb-2" style={{ color: 'var(--ink)' }}>Admin Panel</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--subtle)' }}>Connect your wallet to access admin controls.</p>
        <ConnectKitButton />
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'markets', label: 'Markets', icon: <BarChart2 size={14} /> },
    { id: 'create', label: 'Create', icon: <Plus size={14} /> },
    { id: 'ai', label: 'AI', icon: <Sparkles size={14} /> },
    { id: 'sports', label: 'Sports', icon: <Trophy size={14} /> },
    { id: 'btc', label: 'BTC Rounds', icon: <Bitcoin size={14} /> },
    { id: 'fees', label: 'Fees', icon: <DollarSign size={14} /> },
    { id: 'branding', label: 'Branding', icon: <Palette size={14} /> },
    { id: 'config', label: 'Config', icon: <Settings size={14} /> },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={20} style={{ color: 'var(--accent)' }} />
        <h1 className="display text-2xl font-700" style={{ color: 'var(--ink)' }}>Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: tab === t.id ? 'var(--surface-strong)' : 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--subtle)',
            }}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'markets' && <MarketsTab />}
      {tab === 'create' && <CreateTab />}
      <div hidden={tab !== 'ai'}><AITab /></div>
      {tab === 'btc' && <BtcAdmin />}
      {tab === 'sports' && <SportsAdmin />}
      {tab === 'fees' && <FeesTab />}
      {tab === 'branding' && <BrandingTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  )
}

function MarketsTab() {
  const { data: raw, refetch } = useAllMarkets()
  const markets = raw as Market[] | undefined
  const featureMarket = useFeatureMarket()
  const cancelMarket = useCancelMarket()
  const closeMarket = useCloseMarket()
  const resolveMarket = useResolveMarket()
  const resolveScalar = useResolveScalarMarket()
  const [resolveInputs, setResolveInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (featureMarket.isSuccess || cancelMarket.isSuccess || closeMarket.isSuccess || resolveMarket.isSuccess || resolveScalar.isSuccess) {
      void refetch()
      toast.success('Market updated.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureMarket.isSuccess, cancelMarket.isSuccess, closeMarket.isSuccess, resolveMarket.isSuccess, resolveScalar.isSuccess])

  useEffect(() => {
    const err = featureMarket.error || cancelMarket.error || closeMarket.error || resolveMarket.error || resolveScalar.error
    if (err) toast.error(parseOnchainError(err))
  }, [featureMarket.error, cancelMarket.error, closeMarket.error, resolveMarket.error, resolveScalar.error])

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{markets?.length ?? 0} total markets</p>
      {markets?.map(m => (
        <div key={m.id.toString()} className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--ink-2)' }}>{m.question}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                #{m.id.toString()} · {m.category} · {MarketType[m.marketType]} · ${formatUsdc(m.totalLiquidity)} pool
              </p>
            </div>
            <span className={`text-xs flex-shrink-0 font-medium ${m.status === MarketStatus.Open ? 'text-green-400' : m.status === MarketStatus.Resolved ? 'text-blue-400' : 'text-yellow-400'}`}>
              {MarketStatus[m.status]}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {(m.status === MarketStatus.Open || m.status === MarketStatus.Closed) && (
              <Link to={`/market/${m.id}?edit=1`} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>Edit</Link>
            )}
            {m.status === MarketStatus.Open && (
              <>
                <AdminBtn onClick={() => closeMarket.close(m.id)} loading={closeMarket.isPending}>Close</AdminBtn>
                <AdminBtn onClick={() => featureMarket.feature(m.id, !m.featured)} loading={featureMarket.isPending}>
                  {m.featured ? 'Unfeature' : 'Feature'}
                </AdminBtn>
                <AdminBtn onClick={() => cancelMarket.cancel(m.id)} loading={cancelMarket.isPending} danger>Cancel</AdminBtn>
              </>
            )}
            {(m.status === MarketStatus.Open || m.status === MarketStatus.Closed) && (
              <div className="flex items-center gap-2 w-full mt-1">
                {m.marketType !== MarketType.Scalar ? (
                  <>
                    <select
                      value={resolveInputs[m.id.toString()] ?? ''}
                      onChange={e => setResolveInputs(prev => ({ ...prev, [m.id.toString()]: e.target.value }))}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    >
                      <option value="">Select winner</option>
                      {m.outcomes.map((o, i) => <option key={i} value={i}>{o}</option>)}
                    </select>
                    <AdminBtn
                      onClick={() => {
                        const v = resolveInputs[m.id.toString()]
                        if (v === '' || v === undefined) return toast.error('Select a winner first.')
                        resolveMarket.resolve(m.id, BigInt(v))
                      }}
                      loading={resolveMarket.isPending}
                    >
                      Resolve
                    </AdminBtn>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      placeholder="Resolved value"
                      value={resolveInputs[m.id.toString()] ?? ''}
                      onChange={e => setResolveInputs(prev => ({ ...prev, [m.id.toString()]: e.target.value }))}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    />
                    <AdminBtn
                      onClick={() => {
                        const v = resolveInputs[m.id.toString()]
                        if (!v) return toast.error('Enter a value.')
                        resolveScalar.resolveScalar(m.id, BigInt(Math.round(parseFloat(v))))
                      }}
                      loading={resolveScalar.isPending}
                    >
                      Resolve Scalar
                    </AdminBtn>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function AITab() {
  const flow = useCreateMarketFlow()
  const guard = useContractGuard()
  const { chainId } = useAccount()
  const network = useNetwork()

  const publishDrafts = async (drafts: AIMarketDraft[]) => {
    const target = CHAIN_IDS[network]
    if (!activeAddress()) { toast.error(`No ${network} contract set. Add it in Config.`); return }
    if (chainId !== target) { toast.error(`Switch your wallet to Arc ${network === 'testnet' ? 'Testnet' : 'Mainnet'} first.`); return }
    if (guard.owner && !guard.isOwner) { toast.error(parseOnchainError({ message: 'OwnableUnauthorizedAccount' })); return }
    let published = 0
    const failed: string[] = []
    for (const raw of drafts) {
      const draft = normalizeDraft(raw)
      try {
        const endDate = new Date(Date.now() + draft.suggestedDurationDays * 24 * 60 * 60 * 1000)
        const resDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
        const minLiq = Math.max(guard.minLiquidityUsdc ?? 0, activeSettings().minLiquidityUsdc)
        const liquidity = Math.max(minLiq, loadConfig().aiInitialLiquidityUsdc || 0)
        await flow.run({
          marketType: draft.marketType,
          question: draft.question,
          outcomes: draft.outcomes,
          endTime: BigInt(Math.floor(endDate.getTime() / 1000)),
          resolutionTime: BigInt(Math.floor(resDate.getTime() / 1000)),
          scalarLow: BigInt(draft.scalarLow),
          scalarHigh: BigInt(draft.scalarHigh),
          category: draft.category,
          imageUrl: draft.imageUrl.startsWith('data:') ? '' : draft.imageUrl,
          initialLiquidity: parseUsdc(String(liquidity)),
        }, {
          description: draft.rationale,
          resolutionCriteria: draft.resolutionCriteria,
          sources: draft.sources,
        })
        published++
        toast.success(`Published ${published}/${drafts.length} on ${network}`)
      } catch (e) {
        const msg = parseOnchainError(e)
        // A rejected signature means the admin is stopping; anything else only skips this market.
        if (/reject|denied|cancel/i.test(msg) || /User rejected/i.test((e as Error)?.message ?? '')) {
          toast.error(`Stopped after ${published}/${drafts.length}: you rejected the signature`)
          return
        }
        failed.push(draft.question.slice(0, 50))
        toast.error(`Skipped "${draft.question.slice(0, 40)}…": ${msg}`)
      }
    }
    if (failed.length) toast.warning(`${published} published, ${failed.length} skipped`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>AI Market Generator</p>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Generate markets from a topic, news, or auto-pick. Markets publish to the network you are viewing (<strong>{network === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'}</strong>). Click <strong>Publish All</strong> to deploy all drafts onchain, or <strong>Use</strong> per-market to load into the Create form.
        </p>
      </div>
      <AIMarketGenerator
        onUseMarket={d => toast.info('Use the Create tab to deploy: ' + d.question.slice(0, 40))}
        onPublishAll={publishDrafts}
      />
    </div>
  )
}

function CreateTab() {
  const flow = useCreateMarketFlow()
  const guard = useContractGuard()
  const setMinLiq = useSetMinLiquidity()
  const minLiq = Math.max(guard.minLiquidityUsdc ?? 0, activeSettings().minLiquidityUsdc)
  useEffect(() => {
    if (setMinLiq.isSuccess) toast.success('Contract minimum liquidity is now 0 — market creation is free. Refresh to see it.')
    if (setMinLiq.error) toast.error(parseOnchainError(setMinLiq.error))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMinLiq.isSuccess, setMinLiq.error])
  const [form, setForm] = useState({
    marketType: '0',
    question: '',
    outcomes: ['Yes', 'No'],
    endTime: '',
    resolutionTime: '',
    scalarLow: '0',
    scalarHigh: '100',
    category: 'Crypto',
    imageUrl: '',
    initialLiquidity: String(minLiq),
  })

  const setOutcome = (i: number, val: string) => {
    setForm(f => {
      const outcomes = [...f.outcomes]
      outcomes[i] = val
      return { ...f, outcomes }
    })
  }

  const addOutcome = () => {
    if (form.outcomes.length >= 10) return
    setForm(f => ({ ...f, outcomes: [...f.outcomes, `Option ${f.outcomes.length + 1}`] }))
  }

  const removeOutcome = (i: number) => {
    if (form.outcomes.length <= 2) return
    setForm(f => ({ ...f, outcomes: f.outcomes.filter((_, idx) => idx !== i) }))
  }

  const handleCreate = async () => {
    if (!form.question.trim()) return toast.error('Question is required.')
    if (!form.endTime || !form.resolutionTime) return toast.error('Dates are required.')
    if (guard.owner && !guard.isOwner) return toast.error(parseOnchainError({ message: 'OwnableUnauthorizedAccount' }))

    const endTs = BigInt(Math.floor(new Date(form.endTime).getTime() / 1000))
    const resTs = BigInt(Math.floor(new Date(form.resolutionTime).getTime() / 1000))
    const now = Math.floor(Date.now() / 1000)
    if (Number(endTs) <= now + 3600) return toast.error('Trading must end at least 1 hour from now.')
    if (resTs < endTs) return toast.error('Resolution time must be at or after the trading end time.')
    if (parseFloat(form.initialLiquidity) < minLiq) return toast.error(`Initial liquidity must be at least ${minLiq} USDC.`)
    if (form.imageUrl.length > 500) return toast.error('Image link is too long. Use the Upload option or a shorter URL.')
    if (form.outcomes.some(o => !o.trim())) return toast.error('Every outcome needs a name.')

    try {
      await flow.run({
        marketType: parseInt(form.marketType),
        question: form.question.trim(),
        outcomes: form.outcomes.map(o => o.trim()),
        endTime: endTs,
        resolutionTime: resTs,
        scalarLow: BigInt(parseInt(form.scalarLow) || 0),
        scalarHigh: BigInt(parseInt(form.scalarHigh) || 0),
        category: form.category,
        imageUrl: form.imageUrl,
        initialLiquidity: parseUsdc(form.initialLiquidity),
      })
      toast.success('Market created!')
    } catch (e) {
      toast.error(parseOnchainError(e), { duration: 10000 })
    }
  }

  const isLoading = flow.busy

  const applyDraft = (draft: AIMarketDraft) => {
    const now = new Date()
    const endDate = new Date(now.getTime() + draft.suggestedDurationDays * 24 * 60 * 60 * 1000)
    const resDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().slice(0, 16)
    setForm({
      marketType: String(draft.marketType),
      question: draft.question,
      outcomes: draft.outcomes,
      endTime: fmt(endDate),
      resolutionTime: fmt(resDate),
      scalarLow: String(draft.scalarLow),
      scalarHigh: String(draft.scalarHigh),
      category: draft.category,
      imageUrl: draft.imageUrl,
      initialLiquidity: String(Math.max(minLiq, loadConfig().aiInitialLiquidityUsdc || 0)),
    })
    toast.success('Market loaded from AI — review and deploy')
  }

  return (
    <div className="space-y-4">
      <AIMarketGenerator onUseMarket={applyDraft} />

    <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Create New Market</h2>
      {!guard.hasContract && (
        <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          No contract address is set for this network. Add it in Config.
        </p>
      )}
      {guard.owner && !guard.isOwner && (
        <p className="text-xs rounded-lg px-3 py-2 break-all" style={{ color: 'var(--danger)', background: 'var(--surface-muted)', border: '1px solid var(--danger)' }}>
          The connected wallet is not the owner of this contract, so creating markets will fail. Owner: {guard.owner}. Connect that wallet, or deploy your own contract from your admin wallet and put its address in Config.
        </p>
      )}
      {guard.minLiquidityUsdc !== undefined && (
        <div className="text-[11px] flex flex-wrap items-center gap-2" style={{ color: 'var(--subtle)' }}>
          <span>Minimum initial liquidity on this contract: {guard.minLiquidityUsdc} USDC. Trading must end at least 1 hour from now.</span>
          {guard.isOwner && guard.minLiquidityUsdc > 0 && (
            <button
              type="button"
              disabled={setMinLiq.isPending || setMinLiq.isConfirming}
              onClick={() => setMinLiq.setMin(0n)}
              className="px-2 py-1 rounded-md font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              {setMinLiq.isPending || setMinLiq.isConfirming ? 'Updating…' : 'Make creation free (minimum 0)'}
            </button>
          )}
        </div>
      )}

      <Field label="Market Type">
        <select value={form.marketType} onChange={e => setForm(f => ({ ...f, marketType: e.target.value, outcomes: e.target.value === '0' ? ['Yes', 'No'] : f.outcomes }))} className={selectCls}>
          <option value="0">Binary (Yes/No)</option>
          <option value="1">Multiple Choice</option>
          <option value="2">Scalar (Numeric Range)</option>
        </select>
      </Field>

      <Field label="Question">
        <input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="Will ETH exceed $5,000 by end of 2025?" className={inputCls} />
      </Field>

      <Field label="Category">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={selectCls}>
          {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>

      {form.marketType !== '2' ? (
        <Field label="Outcomes">
          <div className="space-y-2">
            {form.outcomes.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input value={o} onChange={e => setOutcome(i, e.target.value)} className={inputCls + ' flex-1'} />
                {form.outcomes.length > 2 && (
                  <button onClick={() => removeOutcome(i)} className="px-2 py-1.5 rounded text-xs" style={{ background: 'var(--danger)', color: '#fff' }}>×</button>
                )}
              </div>
            ))}
            {form.marketType === '1' && form.outcomes.length < 10 && (
              <button onClick={addOutcome} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-strong)', color: 'var(--accent)' }}>+ Add Option</button>
            )}
          </div>
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Scalar Low">
            <input type="number" value={form.scalarLow} onChange={e => setForm(f => ({ ...f, scalarLow: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Scalar High">
            <input type="number" value={form.scalarHigh} onChange={e => setForm(f => ({ ...f, scalarHigh: e.target.value }))} className={inputCls} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Trading Ends">
          <input type="datetime-local" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Resolution After">
          <input type="datetime-local" value={form.resolutionTime} onChange={e => setForm(f => ({ ...f, resolutionTime: e.target.value }))} className={inputCls} />
        </Field>
      </div>

      <Field label="Initial Liquidity (USDC)">
        <input type="number" value={form.initialLiquidity} onChange={e => setForm(f => ({ ...f, initialLiquidity: e.target.value }))} className={inputCls} />
      </Field>

      <Field label="Market Image (optional)">
        <div className="space-y-2">
          <ImagePicker value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} ai={{ question: form.question, outcomes: form.marketType === '2' ? [] : form.outcomes, category: form.category }} />
        </div>
      </Field>

      <button
        onClick={() => void handleCreate()}
        disabled={isLoading}
        className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#0d1b2f' }}
      >
        {flow.step === 'approving' ? 'Approve USDC in wallet…' : flow.step === 'creating' ? 'Creating market…' : 'Create Market'}
      </button>
    </div>
    </div>
  )
}

function FeesTab() {
  const { data: feeBps, refetch: refetchFee } = usePlatformFee()
  const { data: feeAddr } = useFeeRecipient()
  const { data: accrued, refetch: refetchAccrued } = useAccruedFees()
  const setFee = useSetFee()
  const withdraw = useWithdrawFees()
  const [newFee, setNewFee] = useState('')

  useEffect(() => {
    if (setFee.isSuccess) { toast.success('Fee updated.'); void refetchFee() }
    if (withdraw.isSuccess) { toast.success('Fees withdrawn.'); void refetchAccrued() }
    if (setFee.error) toast.error(parseOnchainError(setFee.error))
    if (withdraw.error) toast.error(parseOnchainError(withdraw.error))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFee.isSuccess, withdraw.isSuccess, setFee.error, withdraw.error])

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--ink)' }}>Fee Settings</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--subtle)' }}>Current fee</span>
            <span className="tabular-nums font-medium" style={{ color: 'var(--accent)' }}>{feeBps !== undefined ? Number(feeBps) / 100 : '—'}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--subtle)' }}>Fee recipient</span>
            <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{feeAddr ? (feeAddr as string).slice(0, 8) + '...' : '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--subtle)' }}>Accrued fees</span>
            <span className="tabular-nums font-medium" style={{ color: 'var(--success)' }}>${accrued !== undefined ? formatUsdc(accrued) : '—'}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Update Fee (max 5%)</h3>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            max="500"
            step="1"
            placeholder="200 = 2%"
            value={newFee}
            onChange={e => setNewFee(e.target.value)}
            className={inputCls + ' flex-1'}
          />
          <button
            onClick={() => { if (!newFee) return; setFee.setFee(BigInt(parseInt(newFee))) }}
            disabled={setFee.isPending || setFee.isConfirming}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            {setFee.isPending || setFee.isConfirming ? 'Saving...' : 'Update'}
          </button>
        </div>
      </div>

      <button
        onClick={() => withdraw.withdraw()}
        disabled={withdraw.isPending || withdraw.isConfirming}
        className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--success)', color: '#0d1b2f' }}
      >
        {withdraw.isPending || withdraw.isConfirming ? 'Withdrawing...' : `Withdraw $${accrued !== undefined ? formatUsdc(accrued) : '0.00'} Fees`}
      </button>
    </div>
  )
}

type ThemeMode = 'dark' | 'light'

const THEME_COLOR_FIELDS: { key: keyof ThemeColors; label: string; isColor: boolean }[] = [
  { key: 'bg',          label: 'Background',   isColor: false },
  { key: 'surface',     label: 'Surface',       isColor: false },
  { key: 'surfaceMuted',label: 'Surface Muted', isColor: false },
  { key: 'ink',         label: 'Text',          isColor: true  },
  { key: 'muted',       label: 'Muted Text',    isColor: true  },
  { key: 'accent',      label: 'Accent',        isColor: true  },
  { key: 'border',      label: 'Border',        isColor: false },
  { key: 'success',     label: 'Success',       isColor: true  },
  { key: 'danger',      label: 'Danger',        isColor: true  },
  { key: 'warning',     label: 'Warning',       isColor: true  },
]

function ThemeEditor({
  label, theme, defaults, onChange,
}: {
  label: string
  theme: ThemeColors
  defaults: ThemeColors
  onChange: (t: ThemeColors) => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{label}</span>
        <button
          onClick={() => onChange(label === 'Dark Mode' ? DEFAULT_DARK : DEFAULT_LIGHT)}
          className="text-xs px-2 py-1 rounded-lg"
          style={{ background: 'var(--surface)', color: 'var(--subtle)', border: '1px solid var(--border)' }}
        >
          Reset
        </button>
      </div>
      {THEME_COLOR_FIELDS.map(({ key, label: fieldLabel, isColor }) => {
        const val = theme[key] ?? defaults[key]
        const isHex = /^#[0-9a-fA-F]{3,8}$/.test(val)
        return (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs w-28 flex-shrink-0" style={{ color: 'var(--subtle)' }}>{fieldLabel}</label>
            {isHex && isColor ? (
              <input
                type="color"
                value={val}
                onChange={e => onChange({ ...theme, [key]: e.target.value })}
                className="h-7 w-8 rounded cursor-pointer border-0 flex-shrink-0"
                style={{ background: 'transparent' }}
              />
            ) : (
              <div className="h-7 w-8 rounded flex-shrink-0 border" style={{ background: val, borderColor: 'var(--border)' }} />
            )}
            <input
              value={val}
              onChange={e => onChange({ ...theme, [key]: e.target.value })}
              className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>
        )
      })}
    </div>
  )
}

function BrandingTab() {
  const [config, setConfig] = useState<SiteConfig>(loadConfig)
  const [themeTab, setThemeTab] = useState<ThemeMode>('dark')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setConfig(c => ({ ...c, logoUrl: ev.target?.result as string ?? '' }))
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    try {
      await saveConfig(config)
      toast.success('Branding saved to Cloudflare and verified ✓')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Identity</h2>

        <Field label="Site Name">
          <input value={config.siteName} onChange={e => setConfig(c => ({ ...c, siteName: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Tagline">
          <input value={config.tagline} onChange={e => setConfig(c => ({ ...c, tagline: e.target.value }))} className={inputCls} />
        </Field>

        <Field label="Logo">
          <div className="flex items-center gap-3">
            {config.logoUrl && <img src={config.logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded-lg" />}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              <Upload size={12} /> Upload Logo
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </Field>

        <Field label="Footer Text">
          <input value={config.footerText} onChange={e => setConfig(c => ({ ...c, footerText: e.target.value }))} className={inputCls} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Twitter"><input value={config.twitterUrl} onChange={e => setConfig(c => ({ ...c, twitterUrl: e.target.value }))} placeholder="https://..." className={inputCls} /></Field>
          <Field label="Discord"><input value={config.discordUrl} onChange={e => setConfig(c => ({ ...c, discordUrl: e.target.value }))} placeholder="https://..." className={inputCls} /></Field>
          <Field label="GitHub"><input value={config.githubUrl} onChange={e => setConfig(c => ({ ...c, githubUrl: e.target.value }))} placeholder="https://..." className={inputCls} /></Field>
        </div>
      </div>

      {/* Theme Colors */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Theme Colors</h2>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Configure separate color tokens for dark mode and light mode. Changes apply live when saved.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {(['dark', 'light'] as ThemeMode[]).map(m => (
            <button
              key={m}
              onClick={() => setThemeTab(m)}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
              style={{
                background: themeTab === m ? 'var(--surface-strong)' : 'transparent',
                color: themeTab === m ? 'var(--ink)' : 'var(--subtle)',
                border: themeTab === m ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              {m === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </button>
          ))}
        </div>

        {themeTab === 'dark' ? (
          <ThemeEditor
            label="Dark Mode"
            theme={config.darkTheme}
            defaults={DEFAULT_DARK}
            onChange={t => setConfig(c => ({ ...c, darkTheme: t }))}
          />
        ) : (
          <ThemeEditor
            label="Light Mode"
            theme={config.lightTheme}
            defaults={DEFAULT_LIGHT}
            onChange={t => setConfig(c => ({ ...c, lightTheme: t }))}
          />
        )}
      </div>

      {/* Custom CSS */}
      <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Custom CSS</h2>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>Injected into the page after all theme variables — overrides anything.</p>
        <textarea
          value={config.customCss}
          onChange={e => setConfig(c => ({ ...c, customCss: e.target.value }))}
          placeholder="/* Custom CSS overrides */"
          rows={5}
          className={inputCls}
          style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
        />
      </div>

      <button onClick={handleSave} className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
        <Save size={14} /> Save Branding
      </button>
    </div>
  )
}

function ConfigTab() {
  const [config, setConfig] = useState<SiteConfig>(loadConfig)
  const [testing, setTesting] = useState(false)
  const [catalog, setCatalog] = useState<OpenRouterModel[]>([])
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [freeOnly, setFreeOnly] = useState(true)
  const [modelQuery, setModelQuery] = useState('')
  const [testSteps, setTestSteps] = useState<ConnectionStep[] | null>(null)
  // Which network's settings are being edited (independent of the site's active network)
  const [editNet, setEditNet] = useState<Network>(loadConfig().network)
  const [checking, setChecking] = useState(false)
  const [checkLines, setCheckLines] = useState<CheckLine[] | null>(null)
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const ns = config[editNet]
  const setNs = (patch: Partial<NetworkSettings>) => setConfig(c => ({ ...c, [editNet]: { ...c[editNet], ...patch } }))

  const handleSave = async () => {
    const before = loadConfig().network
    if (config.network !== before) {
      const ok = window.confirm(`This switches the WHOLE site to Arc ${config.network === 'testnet' ? 'Testnet' : 'Mainnet'} for every visitor. Continue?`)
      if (!ok) return
    }
    try {
      await saveConfig(config)
      setConfig(loadConfig())
      toast.success('Config saved to Cloudflare and verified ✓')
      const target = CHAIN_IDS[config.network]
      if (config.network !== before && chainId !== target) {
        try { await switchChainAsync({ chainId: target }) }
        catch { toast.info(`Site is now on ${config.network}. Switch your wallet to Arc ${config.network === 'testnet' ? 'Testnet' : 'Mainnet'} to transact.`) }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const runCheck = async () => {
    setChecking(true); setCheckLines(null)
    try {
      setCheckLines(await checkContract({
        network: editNet, rpcUrl: ns.rpcUrl, contractAddress: ns.contractAddress,
        usdcAddress: ns.usdcAddress, adminWallet: config.adminWallet,
      }))
    } finally { setChecking(false) }
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Advanced Config</h2>
      <p className="text-xs" style={{ color: 'var(--subtle)' }}>
        These values are saved to Cloudflare and apply to every visitor. Only the admin wallet can change them.
      </p>

      {/* Site network — this is the only place the network is switched */}
      <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Site network</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              {config.network === 'testnet'
                ? 'Arc Testnet (chain 5042002) — free test USDC. Visitors see testnet markets.'
                : 'Arc Mainnet (chain 5042) — real USDC. Visitors see live markets.'}
            </p>
          </div>
          <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
            {(['mainnet', 'testnet'] as const).map(n => (
              <button
                key={n}
                onClick={() => { setConfig(c => ({ ...c, network: n })); setEditNet(n) }}
                className="px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
                style={{
                  background: config.network === n ? (n === 'mainnet' ? 'var(--accent)' : '#059669') : 'var(--surface-muted)',
                  color: config.network === n ? '#fff' : 'var(--muted)',
                }}
              >
                {n === 'mainnet' ? '🔴 Mainnet' : '🟢 Testnet'}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs px-3 py-2 rounded-lg break-all" style={{
          background: config.network === 'testnet' ? 'rgba(5,150,105,0.1)' : 'rgba(91,156,246,0.1)',
          color: config.network === 'testnet' ? '#059669' : 'var(--accent)',
          border: `1px solid ${config.network === 'testnet' ? 'rgba(5,150,105,0.3)' : 'rgba(91,156,246,0.3)'}`,
        }}>
          Active contract: {getActiveContractAddress(config) || '(not set)'}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>Changing the network applies to all visitors after you press Save Config.</p>
      </div>

      {/* Per-network settings */}
      <div className="rounded-xl p-4 space-y-4" style={{ border: '1px solid var(--border)' }}>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['mainnet', 'testnet'] as const).map(n => (
            <button
              key={n}
              onClick={() => { setEditNet(n); setCheckLines(null) }}
              className="flex-1 py-2 text-xs font-semibold capitalize"
              style={{
                background: editNet === n ? 'var(--surface-strong)' : 'transparent',
                color: editNet === n ? 'var(--ink)' : 'var(--subtle)',
              }}
            >
              {n === 'mainnet' ? '🔴 Mainnet settings' : '🟢 Testnet settings'}{config.network === n ? ' · live' : ''}
            </button>
          ))}
        </div>

        <Field label={`${editNet === 'mainnet' ? 'Mainnet' : 'Testnet'} Contract Address`}>
          <input value={ns.contractAddress} onChange={e => setNs({ contractAddress: e.target.value })} placeholder={`0x... (PredarcMarket on Arc ${editNet})`} className={inputCls + ' mono'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="RPC URL">
            <input value={ns.rpcUrl} onChange={e => setNs({ rpcUrl: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Min Liquidity (USDC)">
            <input type="number" min={0} step={1} value={ns.minLiquidityUsdc} onChange={e => setNs({ minLiquidityUsdc: Math.max(0, parseFloat(e.target.value) || 0) })} className={inputCls + ' tabular-nums'} />
          </Field>
        </div>
        <Field label="USDC Address">
          <input value={ns.usdcAddress} onChange={e => setNs({ usdcAddress: e.target.value })} className={inputCls + ' mono'} />
        </Field>
        <Field label="Fee Recipient">
          <input value={ns.feeRecipient} onChange={e => setNs({ feeRecipient: e.target.value })} placeholder="0x..." className={inputCls + ' mono'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chainlink BTC/USD Feed">
            <input value={ns.chainlinkBtcFeed} onChange={e => setNs({ chainlinkBtcFeed: e.target.value })} placeholder="0x..." className={inputCls + ' mono'} />
          </Field>
          <Field label="Chainlink ETH/USD Feed">
            <input value={ns.chainlinkEthFeed} onChange={e => setNs({ chainlinkEthFeed: e.target.value })} placeholder="0x..." className={inputCls + ' mono'} />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={checking}
          className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border)' }}
        >
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking…' : `Check ${editNet} contract`}
        </button>
        {checkLines && (
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            {checkLines.map((l, i) => (
              <p key={i} className="text-xs break-words" style={{ color: l.ok ? 'var(--success)' : 'var(--danger)' }}>
                {l.ok ? '✓' : '✗'} <strong>{l.label}</strong> — {l.detail}
              </p>
            ))}
          </div>
        )}
      </div>

      <Field label="Admin Wallet (set by the ADMIN_WALLET variable in Cloudflare)">
        <input value={config.adminWallet} readOnly className={inputCls + ' mono opacity-70'} />
      </Field>

      {/* AI Settings */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: '#8b5cf6' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>AI Settings (OpenRouter)</h3>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--subtle)' }}>
          Get a free API key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>openrouter.ai/keys</a>. Your key is stored server-side in Cloudflare and is only ever sent to the admin wallet.
        </p>
        <div className="space-y-3">
          <Field label="OpenRouter API Key">
            <input
              type="password"
              value={config.openrouterApiKey}
              onChange={e => setConfig(c => ({ ...c, openrouterApiKey: e.target.value }))}
              placeholder="sk-or-v1-..."
              className={inputCls + ' mono'}
              autoComplete="off"
            />
          </Field>
          <Field label="AI Model (any OpenRouter model ID — free models end in :free)">
            <input
              list="or-models"
              value={config.openrouterModel}
              onChange={e => setConfig(c => ({ ...c, openrouterModel: e.target.value.trim() }))}
              placeholder="e.g. meta-llama/llama-3.3-70b-instruct:free"
              className={inputCls + ' mono'}
            />
            <datalist id="or-models">
              {[...OPENROUTER_MODELS, ...catalog.map(m => ({ id: m.id, label: m.name }))].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </datalist>
          </Field>
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={catalogBusy} onClick={async () => {
                setCatalogBusy(true)
                try { setCatalog(await fetchOpenRouterModels()); setFreeOnly(true) } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load models') } finally { setCatalogBusy(false) }
              }} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                {catalogBusy ? 'Loading…' : catalog.length ? 'Reload model list' : 'Browse OpenRouter models'}
              </button>
              {catalog.length > 0 && (
                <>
                  <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--muted)' }}><input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)} />Free only</label>
                  <input value={modelQuery} onChange={e => setModelQuery(e.target.value)} placeholder="Search…" className={inputCls + ' flex-1 min-w-[8rem]'} />
                </>
              )}
            </div>
            {catalog.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {catalog.filter(m => (!freeOnly || m.free) && (m.id + m.name).toLowerCase().includes(modelQuery.toLowerCase())).slice(0, 80).map(m => (
                  <button key={m.id} type="button" onClick={() => setConfig(c => ({ ...c, openrouterModel: m.id }))}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center justify-between gap-2"
                    style={{ background: config.openrouterModel === m.id ? 'var(--accent-bg)' : 'transparent', color: 'var(--ink-2)' }}>
                    <span className="truncate">{m.name}<span className="mono ml-2" style={{ color: 'var(--subtle)' }}>{m.id}</span></span>
                    {m.free && <span className="px-1.5 rounded" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>free</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" className="mt-0.5" checked={config.openrouterWebSearch} onChange={e => setConfig(c => ({ ...c, openrouterWebSearch: e.target.checked }))} />
            <span><strong style={{ color: 'var(--ink)' }}>Web search (online)</strong> — lets the model look things up live when generating markets and insights. Works with free models too, but OpenRouter bills the search itself, so the account needs a little credit.</span>
          </label>
          <Field label="Image model for market covers">
            <input value={config.openrouterImageModel} onChange={e => setConfig(c => ({ ...c, openrouterImageModel: e.target.value.trim() }))} placeholder="google/gemini-2.5-flash-image" className={inputCls + ' mono'} />
            <p className="text-[11px] mt-1" style={{ color: 'var(--subtle)' }}>Nothing is generated automatically. Use “Generate with AI” when creating or editing a market, or on an AI draft. Your AI first writes a picture brief from the question (its countries, teams, coins…), optionally researching online, then this model paints exactly that. Each picture costs a little image-model credit.</p>
          </Field>
          <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" className="mt-0.5" checked={config.aiImageSvgFallback} onChange={e => setConfig(c => ({ ...c, aiImageSvgFallback: e.target.checked }))} />
            <span>If the image model fails, let the text model draw a simple SVG cover. Off = no image rather than a vague one.</span>
          </label>
          <Field label="Initial liquidity for AI-published markets (USDC, 0 = free)">
            <input type="number" min={0} step={1} value={config.aiInitialLiquidityUsdc} onChange={e => setConfig(c => ({ ...c, aiInitialLiquidityUsdc: Math.max(0, parseFloat(e.target.value) || 0) }))} className={inputCls + ' tabular-nums'} />
            <p className="text-[11px] mt-1" style={{ color: 'var(--subtle)' }}>A market with 0 liquidity is created for free but can't be traded until you fund it (Fund market box on its page).</p>
          </Field>
          <div className="space-y-2">
            <button
              type="button"
              onClick={async () => {
                setTesting(true); setTestSteps(null)
                try { setTestSteps(await testOpenRouterConnection(config.openrouterApiKey, config.openrouterModel)) }
                finally { setTesting(false) }
              }}
              disabled={testing}
              className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border)' }}
            >
              <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
              {testing ? 'Testing connection…' : 'Test OpenRouter connection'}
            </button>
            {testSteps && (
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                {testSteps.map((st, i) => (
                  <p key={i} className="text-xs" style={{ color: st.ok ? 'var(--success)' : 'var(--danger)' }}>
                    {st.ok ? '✓' : '✗'} <strong>{st.label}</strong> — {st.detail}
                  </p>
                ))}
                {testSteps.every(x => x.ok) && (
                  <p className="text-xs font-medium" style={{ color: 'var(--success)' }}>Connected — AI is ready. Press Save Config to keep these settings.</p>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Auto-gen interval (minutes)">
              <input
                type="number"
                min={15}
                value={config.aiAutoGenInterval}
                onChange={e => setConfig(c => ({ ...c, aiAutoGenInterval: parseInt(e.target.value) || 60 }))}
                className={inputCls}
              />
            </Field>
            <Field label="Auto-gen categories">
              <input
                value={config.aiAutoGenCategories}
                onChange={e => setConfig(c => ({ ...c, aiAutoGenCategories: e.target.value }))}
                placeholder="Crypto,Sports,Politics"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>Enable auto-generation</p>
              <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>AI drafts 3 new markets per interval for you to review and publish (admin panel must stay open)</p>
            </div>
            <button
              onClick={() => setConfig(c => ({ ...c, aiAutoGenEnabled: !c.aiAutoGenEnabled }))}
              className="h-6 w-11 rounded-full transition-colors flex-shrink-0 relative"
              style={{ background: config.aiAutoGenEnabled ? 'var(--accent)' : 'var(--border)' }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                style={{ left: config.aiAutoGenEnabled ? '22px' : '2px' }}
              />
            </button>
          </div>
        </div>
      </div>

      <button onClick={handleSave} className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ background: 'var(--accent)', color: '#0d1b2f' }}>
        <Save size={14} /> Save Config
      </button>

      <button
        onClick={async () => {
          if (!window.confirm('Delete all saved settings from Cloudflare and reset to defaults?')) return
          try { await resetConfig(); setConfig(loadConfig()); toast.success('Reset to defaults.') }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Reset failed') }
        }}
        className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
        style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid var(--border)' }}
      >
        <RefreshCw size={11} /> Reset to Defaults
      </button>
    </div>
  )
}

// Shared components
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs mb-1 block" style={{ color: 'var(--subtle)' }}>{label}</label>
      {children}
    </div>
  )
}

function AdminBtn({ onClick, loading, danger, children }: { onClick: () => void; loading?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
      style={{
        background: danger ? 'rgba(232,109,122,0.15)' : 'var(--surface-strong)',
        color: danger ? 'var(--danger)' : 'var(--muted)',
        border: '1px solid ' + (danger ? 'rgba(232,109,122,0.3)' : 'var(--border)'),
      }}
    >
      {loading ? '...' : children}
    </button>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm outline-none'
  + ' bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)]'
const selectCls = inputCls
