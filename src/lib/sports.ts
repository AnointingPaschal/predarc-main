// Client helpers for soccer betting: fixtures, the registry of generated markets, and settlement.
import { useEffect, useState } from 'react'
import { adminAuthHeaders, getEffectiveNetwork, type Network } from './adminConfig'
import type { Fixture, SportsRecord } from './sportsCore'

export interface DueAction { eventId: string; marketId: string; kind: string; action: 'resolve' | 'cancel'; outcome?: number }
export interface DueMatch { eventId: string; title: string; state: 'final' | 'cancelled' | 'manual' | 'pending'; score?: string; reason?: string; actions: DueAction[] }

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

export const fetchFixtures = async (league: string, days: number): Promise<{ fixtures: Fixture[]; reachable: boolean }> =>
  parse<{ fixtures: Fixture[]; reachable: boolean }>(await fetch(`/api/sports?action=fixtures&league=${encodeURIComponent(league)}&days=${days}`))

export const fetchRegistry = async (network: Network = getEffectiveNetwork()): Promise<SportsRecord[]> =>
  (await parse<{ records: SportsRecord[] }>(await fetch(`/api/sports?action=registry&network=${network}`, { cache: 'no-store' }))).records

export const fetchDue = async (network: Network = getEffectiveNetwork()): Promise<DueMatch[]> =>
  (await parse<{ matches: DueMatch[] }>(await fetch(`/api/sports?action=due&network=${network}`, { cache: 'no-store' }))).matches

const post = async (body: Record<string, unknown>) =>
  parse<Record<string, unknown>>(await fetch('/api/sports', {
    method: 'POST', headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify({ network: getEffectiveNetwork(), ...body }),
  }))
export const registerFixtures = (records: unknown[]) => post({ action: 'register', records })
export const recordSettled = (marks: unknown[]) => post({ action: 'settled', marks })

export interface KeeperStatus { configured: boolean; address?: string; balance?: string; isOwner?: boolean | null }
export const fetchSportsKeeper = async (network: Network = getEffectiveNetwork()): Promise<KeeperStatus> =>
  parse<KeeperStatus>(await fetch(`/api/sports-keeper?network=${network}`))

let lastPing = 0
/** Nudges the settlement keeper (throttled). Harmless when nothing is due or no resolver key is configured. */
export function pingSportsKeeper(network: Network = getEffectiveNetwork()) {
  if (Date.now() - lastPing < 90_000) return
  lastPing = Date.now()
  void fetch(`/api/sports-keeper?network=${network}`, { method: 'POST' }).catch(() => undefined)
}

// Shared registry (one fetch for all components)
let cache: { at: number; net: string; data: SportsRecord[] } | null = null
export function useSportsRegistry(pollMs = 60_000) {
  const net = getEffectiveNetwork()
  const [records, setRecords] = useState<SportsRecord[] | null>(cache && cache.net === net ? cache.data : null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        if (!(cache && cache.net === net && Date.now() - cache.at < 15_000)) {
          const data = await fetchRegistry(net)
          cache = { at: Date.now(), net, data }
        }
        if (!dead && cache) { setRecords(cache.data); setError('') }
      } catch (e) { if (!dead) setError(e instanceof Error ? e.message : 'Could not load matches') }
    }
    void load()
    const t = setInterval(load, pollMs)
    return () => { dead = true; clearInterval(t) }
  }, [net, pollMs, tick])
  return { records, error, refresh: () => { cache = null; setTick(x => x + 1) } }
}
