// Soccer betting lines: definitions, question wording and settlement rules.
// Dependency-free so it runs both in the browser and in the Cloudflare functions (auto-settlement).

export interface KindDef {
  id: string
  group: 'Match result' | 'Double chance' | 'Total goals' | 'Both teams to score' | 'Goals'
  label: string
  short: string
  outcomes: (home: string, away: string) => string[]
  /** Winning outcome index for a full-time score */
  settle: (h: number, a: number) => number
}

const ou = (line: number): KindDef => ({
  id: `ou_${line}`, group: 'Total goals', label: `Over/Under ${line}`, short: `O/U ${line}`,
  outcomes: () => ['Over', 'Under'],
  settle: (h, a) => (h + a > line ? 0 : 1),
})
const yn = (id: string, label: string, short: string, group: KindDef['group'], yes: (h: number, a: number) => boolean): KindDef => ({
  id, group, label, short, outcomes: () => ['Yes', 'No'], settle: (h, a) => (yes(h, a) ? 0 : 1),
})

export const KINDS: KindDef[] = [
  { id: '1x2', group: 'Match result', label: 'Full-time result (1X2)', short: '1X2', outcomes: (h, a) => [h, 'Draw', a], settle: (h, a) => (h > a ? 0 : h === a ? 1 : 2) },
  yn('dc_1x', 'Double chance: Home or Draw (1X)', '1X', 'Double chance', (h, a) => h >= a),
  yn('dc_12', 'Double chance: Home or Away (12)', '12', 'Double chance', (h, a) => h !== a),
  yn('dc_x2', 'Double chance: Draw or Away (X2)', 'X2', 'Double chance', (h, a) => a >= h),
  ou(0.5), ou(1.5), ou(2.5), ou(3.5), ou(4.5), ou(5.5),
  { id: 'btts', group: 'Both teams to score', label: 'Both teams to score (GG/NG)', short: 'GG/NG', outcomes: () => ['GG', 'NG'], settle: (h, a) => (h > 0 && a > 0 ? 0 : 1) },
  { id: 'oe', group: 'Goals', label: 'Total goals odd/even', short: 'Odd/Even', outcomes: () => ['Odd', 'Even'], settle: (h, a) => ((h + a) % 2 === 1 ? 0 : 1) },
  yn('cs_h', 'Home team keeps a clean sheet', 'Home CS', 'Goals', (_h, a) => a === 0),
  yn('cs_a', 'Away team keeps a clean sheet', 'Away CS', 'Goals', h => h === 0),
  yn('wtn_h', 'Home team wins to nil', 'Home WTN', 'Goals', (h, a) => h > a && a === 0),
  yn('wtn_a', 'Away team wins to nil', 'Away WTN', 'Goals', (h, a) => a > h && h === 0),
]
export const KIND_BY_ID: Record<string, KindDef> = Object.fromEntries(KINDS.map(k => [k.id, k]))
export const DEFAULT_KINDS = ['1x2', 'dc_1x', 'dc_12', 'dc_x2', 'ou_1.5', 'ou_2.5', 'ou_3.5', 'ou_4.5', 'btts']

export const SPORTS_CATEGORY = 'Soccer'

export interface Team { name: string; abbr: string; logo: string }
export interface Fixture {
  eventId: string; league: string; leagueName: string
  kickoff: number // ms
  home: Team; away: Team
}

/** Outcome names must be short and unique for the contract. */
export function outcomesFor(kind: KindDef, f: Pick<Fixture, 'home' | 'away'>): string[] {
  const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 40)
  const out = kind.outcomes(clip(f.home.name), clip(f.away.name))
  return out.map((o, i) => (out.indexOf(o) === i ? o : `${o} (${i + 1})`))
}
export function questionFor(kind: KindDef, f: Pick<Fixture, 'home' | 'away' | 'leagueName'>): string {
  const q = `${f.home.name} vs ${f.away.name} · ${kind.label}`
  return q.length <= 150 ? q : q.slice(0, 149) + '…'
}
export const descriptionFor = (f: Fixture) =>
  `${f.leagueName}: ${f.home.name} vs ${f.away.name}. Kick-off ${new Date(f.kickoff).toISOString().replace('T', ' ').slice(0, 16)} UTC.`
export const criteriaFor = (kind: KindDef) =>
  `Settled on the full-time score after 90 minutes plus stoppage time (extra time and penalty shoot-outs do not count), taken from ESPN's official match result. ` +
  `${kind.label}. If the match is cancelled or abandoned the market is cancelled and stakes are refunded.`

/** Trading closes at kick-off; resolution is possible two hours later (a match lasts ~115 minutes). */
export const endTimeFor = (f: Fixture) => Math.floor(f.kickoff / 1000)
export const resolutionTimeFor = (f: Fixture) => Math.floor(f.kickoff / 1000) + 2 * 3600

export interface SportsRecord {
  eventId: string; league: string; leagueName: string
  kickoff: number
  home: Team; away: Team
  markets: Record<string, string> // kind id -> market id
  status: 'scheduled' | 'final' | 'cancelled' | 'manual'
  result?: { home: number; away: number }
  settled: Record<string, 'resolved' | 'cancelled'> // market id -> how it ended
  createdAt: number
}

export const LEAGUES: { id: string; name: string; region: string }[] = [
  { id: 'eng.1', name: 'Premier League', region: 'England' },
  { id: 'eng.2', name: 'Championship', region: 'England' },
  { id: 'eng.3', name: 'League One', region: 'England' },
  { id: 'eng.4', name: 'League Two', region: 'England' },
  { id: 'eng.fa', name: 'FA Cup', region: 'England' },
  { id: 'eng.league_cup', name: 'EFL Cup', region: 'England' },
  { id: 'esp.1', name: 'LaLiga', region: 'Spain' },
  { id: 'esp.2', name: 'LaLiga 2', region: 'Spain' },
  { id: 'esp.copa_del_rey', name: 'Copa del Rey', region: 'Spain' },
  { id: 'ger.1', name: 'Bundesliga', region: 'Germany' },
  { id: 'ger.2', name: '2. Bundesliga', region: 'Germany' },
  { id: 'ger.dfb_pokal', name: 'DFB-Pokal', region: 'Germany' },
  { id: 'ita.1', name: 'Serie A', region: 'Italy' },
  { id: 'ita.2', name: 'Serie B', region: 'Italy' },
  { id: 'ita.coppa_italia', name: 'Coppa Italia', region: 'Italy' },
  { id: 'fra.1', name: 'Ligue 1', region: 'France' },
  { id: 'fra.2', name: 'Ligue 2', region: 'France' },
  { id: 'fra.coupe_de_france', name: 'Coupe de France', region: 'France' },
  { id: 'ned.1', name: 'Eredivisie', region: 'Netherlands' },
  { id: 'por.1', name: 'Primeira Liga', region: 'Portugal' },
  { id: 'sco.1', name: 'Scottish Premiership', region: 'Scotland' },
  { id: 'bel.1', name: 'Belgian Pro League', region: 'Belgium' },
  { id: 'tur.1', name: 'Süper Lig', region: 'Turkey' },
  { id: 'gre.1', name: 'Super League Greece', region: 'Greece' },
  { id: 'rus.1', name: 'Russian Premier League', region: 'Russia' },
  { id: 'den.1', name: 'Danish Superliga', region: 'Denmark' },
  { id: 'swe.1', name: 'Allsvenskan', region: 'Sweden' },
  { id: 'nor.1', name: 'Eliteserien', region: 'Norway' },
  { id: 'sui.1', name: 'Swiss Super League', region: 'Switzerland' },
  { id: 'aut.1', name: 'Austrian Bundesliga', region: 'Austria' },
  { id: 'usa.1', name: 'MLS', region: 'USA' },
  { id: 'usa.nwsl', name: 'NWSL', region: 'USA' },
  { id: 'mex.1', name: 'Liga MX', region: 'Mexico' },
  { id: 'bra.1', name: 'Brasileirão Série A', region: 'Brazil' },
  { id: 'arg.1', name: 'Liga Profesional', region: 'Argentina' },
  { id: 'col.1', name: 'Categoría Primera A', region: 'Colombia' },
  { id: 'chi.1', name: 'Primera División Chile', region: 'Chile' },
  { id: 'uru.1', name: 'Primera División Uruguay', region: 'Uruguay' },
  { id: 'jpn.1', name: 'J1 League', region: 'Japan' },
  { id: 'chn.1', name: 'Chinese Super League', region: 'China' },
  { id: 'aus.1', name: 'A-League Men', region: 'Australia' },
  { id: 'ksa.1', name: 'Saudi Pro League', region: 'Saudi Arabia' },
  { id: 'uefa.champions', name: 'UEFA Champions League', region: 'Europe' },
  { id: 'uefa.europa', name: 'UEFA Europa League', region: 'Europe' },
  { id: 'uefa.europa.conf', name: 'UEFA Conference League', region: 'Europe' },
  { id: 'uefa.nations', name: 'UEFA Nations League', region: 'Europe' },
  { id: 'uefa.euro', name: 'UEFA Euro', region: 'Europe' },
  { id: 'uefa.euroq', name: 'Euro Qualifying', region: 'Europe' },
  { id: 'conmebol.libertadores', name: 'Copa Libertadores', region: 'South America' },
  { id: 'conmebol.sudamericana', name: 'Copa Sudamericana', region: 'South America' },
  { id: 'concacaf.champions', name: 'CONCACAF Champions Cup', region: 'North America' },
  { id: 'afc.champions', name: 'AFC Champions League', region: 'Asia' },
  { id: 'caf.champions', name: 'CAF Champions League', region: 'Africa' },
  { id: 'caf.nations', name: 'Africa Cup of Nations', region: 'Africa' },
  { id: 'fifa.world', name: 'FIFA World Cup', region: 'World' },
  { id: 'fifa.worldq.uefa', name: 'World Cup Qualifying (UEFA)', region: 'World' },
  { id: 'fifa.friendly', name: 'International Friendlies', region: 'World' },
]

export type ResultCheck =
  | { state: 'final'; home: number; away: number }
  | { state: 'cancelled' }
  | { state: 'manual'; reason: string }
  | { state: 'pending' }

/** Interprets ESPN's status name + scores for a match. Only a plain 90-minute finish settles automatically. */
export function interpretResult(statusName: string, home: unknown, away: unknown): ResultCheck {
  const s = String(statusName || '').toUpperCase()
  const h = Number(home), a = Number(away)
  if (s === 'STATUS_CANCELED' || s === 'STATUS_CANCELLED' || s === 'STATUS_ABANDONED' || s === 'STATUS_FORFEIT') return { state: 'cancelled' }
  if (s === 'STATUS_FULL_TIME' || s === 'STATUS_FINAL') {
    if (!Number.isFinite(h) || !Number.isFinite(a) || home === '' || away === '') return { state: 'pending' }
    return { state: 'final', home: h, away: a }
  }
  if (s === 'STATUS_FINAL_AET' || s === 'STATUS_FINAL_PEN' || s === 'STATUS_FINAL_ET') return { state: 'manual', reason: 'Went to extra time or penalties: settle on the 90-minute score by hand.' }
  if (s === 'STATUS_POSTPONED' || s === 'STATUS_SUSPENDED') return { state: 'manual', reason: 'Postponed or suspended: wait for a new date or cancel the markets.' }
  return { state: 'pending' }
}

// ── Opening odds: a Poisson goals model fitted to bookmaker prices ────────────────────────────────────
const pois = (mu: number, max = 12) => { const out = [Math.exp(-mu)]; for (let k = 1; k <= max; k++) out.push(out[k - 1] * mu / k); return out }

function scoreGrid(lh: number, la: number) {
  const ph = pois(lh), pa = pois(la), grid: number[][] = []
  let sum = 0
  for (let h = 0; h < ph.length; h++) { grid[h] = []; for (let a = 0; a < pa.length; a++) { grid[h][a] = ph[h] * pa[a]; sum += grid[h][a] } }
  for (const row of grid) for (let a = 0; a < row.length; a++) row[a] /= sum
  return grid
}

export interface OddsInput { home: number; draw: number; away: number; /** goals line + P(over) if known */ line?: number; over?: number }

/** Fits home/away scoring rates to the 1X2 probabilities (and the totals line if given). */
export function fitGoals(o: OddsInput): { lh: number; la: number } {
  const t = o.home + o.draw + o.away
  const ph = o.home / t, pd = o.draw / t, pa = o.away / t
  let best = { e: Infinity, lh: 1.4, la: 1.2 }
  for (let mu = 1.3; mu <= 4.4; mu += 0.05) {
    for (let lh = 0.15; lh < mu - 0.1; lh += 0.03) {
      const g = scoreGrid(lh, mu - lh)
      let h = 0, d = 0, a = 0, over = 0
      for (let i = 0; i < g.length; i++) for (let j = 0; j < g[i].length; j++) {
        const p = g[i][j]
        if (i > j) h += p; else if (i === j) d += p; else a += p
        if (o.line !== undefined && i + j > o.line) over += p
      }
      let e = (h - ph) ** 2 + (d - pd) ** 2 + (a - pa) ** 2
      if (o.line !== undefined && o.over !== undefined) e += 0.6 * (over - o.over) ** 2
      if (e < best.e) best = { e, lh, la: mu - lh }
    }
  }
  return { lh: best.lh, la: best.la }
}

/** Probability (basis points, summing to 10000) of every outcome of every betting line. */
export function lineProbabilities(o: OddsInput): Record<string, number[]> {
  const { lh, la } = fitGoals(o)
  const g = scoreGrid(lh, la)
  const out: Record<string, number[]> = {}
  for (const k of KINDS) {
    const n = k.outcomes('h', 'a').length
    const p = new Array(n).fill(0)
    for (let h = 0; h < g.length; h++) for (let a = 0; a < g[h].length; a++) p[k.settle(h, a)] += g[h][a]
    // keep every outcome tradable and away from the contract's 1%..99% limits
    const c = p.map(x => Math.min(0.97, Math.max(0.03, x)))
    const s = c.reduce((x, y) => x + y, 0)
    const bps = c.map(x => Math.round((x / s) * 10000))
    bps[bps.indexOf(Math.max(...bps))] += 10000 - bps.reduce((x, y) => x + y, 0)
    out[k.id] = bps
  }
  return out
}
export const GENERIC_ODDS: OddsInput = { home: 0.43, draw: 0.27, away: 0.30 }
