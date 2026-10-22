// Ratings: works backwards from Bookmaker odds to one Rating per team, using the Forecast's own match model
// and home advantage. Pure: the caller passes in the Bookmaker odds and the last good Ratings.
import { DEFAULT_SETTINGS, outcomeProbabilities, type Outcome } from './forecast.ts'

// The Odds API's response for the head-to-head market (only the fields we read).
export type OddsResponse = {
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: { markets: { key: string; outcomes: { name: string; price: number }[] }[] }[]
}[]

export type Ratings = {
  teams: Record<number, number> // team id → Rating
  oddsFetchedAt?: string // when Bookmaker odds were last fetched, even if there were none
}

// Pulls each Rating gently towards its last good value, so a team (or group of teams) the Bookmaker odds
// don't connect to the rest keeps its last Rating, and a single Matchweek of them still gives a unique fit.
// ponytail: if the window is a single Matchweek, only each pair's gap is pinned, so from equal Ratings the spread
// builds up over several Matchweeks; carry the market's probabilities between runs (off the public repo) if too slow.
const ANCHOR = 0.001

export function rate(input: {
  odds?: OddsResponse
  last?: Ratings
  teams: { id: number; name: string }[] // football-data.org's full names, e.g. "Brighton & Hove Albion FC"
  now: Date
  homeAdvantage?: number // the League's, else the Forecast's
  aliases?: Record<string, string> // Bookmaker odds name → football-data.org name, for names normalising can't match
}): Ratings {
  const { odds, now, homeAdvantage = DEFAULT_SETTINGS.homeAdvantage, aliases = {} } = input
  const last = {
    teams: Object.fromEntries(input.teams.map((t) => [t.id, input.last?.teams[t.id] ?? 0])),
    oddsFetchedAt: input.last?.oddsFetchedAt,
  }
  if (!odds) return last

  const ids = new Map(input.teams.map((t) => [normalise(t.name), t.id]))
  const id = (name: string) => {
    const found = ids.get(normalise(aliases[name] ?? name))
    if (found === undefined) throw new Error(`Bookmaker odds name "${name}" matches no team`)
    return found
  }
  // Fixtures already in progress are skipped: their Bookmaker odds reflect the Scoreline so far, not the Ratings.
  const matches = odds
    .filter((e) => Date.parse(e.commence_time) > now.getTime())
    .flatMap((e) => {
      const [home, away, p] = [id(e.home_team), id(e.away_team), probabilities(e)]
      return p ? [{ home, away, p }] : []
    })

  return { teams: fit(matches, last.teams, homeAdvantage), oddsFetchedAt: now.toISOString() }
}

// Average Outcome probabilities across bookmakers, each with its margin removed by normalising.
function probabilities(event: OddsResponse[number]) {
  const books = event.bookmakers.flatMap((b) => {
    const outcomes = b.markets.find((m) => m.key === 'h2h')?.outcomes ?? []
    const price = (name: string) => outcomes.find((o) => o.name === name)?.price
    const prices = [price(event.home_team), price('Draw'), price(event.away_team)]
    if (prices.some((p) => !p)) return []
    const implied = prices.map((p) => 1 / p!)
    const total = implied[0] + implied[1] + implied[2]
    return [implied.map((q) => q / total)]
  })
  if (!books.length) return undefined
  const mean = (i: number) => books.reduce((sum, b) => sum + b[i], 0) / books.length
  return { home: mean(0), draw: mean(1), away: mean(2) }
}

// Minimises the cross-entropy between the market's and the match model's Outcome probabilities,
// plus the anchor, by gradient descent.
function fit(matches: { home: number; away: number; p: Record<Outcome, number> }[], last: Ratings['teams'], homeAdvantage: number) {
  const teams = { ...last }
  const played = new Map<number, number>()
  for (const m of matches) for (const t of [m.home, m.away]) played.set(t, (played.get(t) ?? 0) + 1)
  const loss = (gap: number, p: Record<Outcome, number>) => {
    const q = outcomeProbabilities(gap)
    return -(p.home * Math.log(q.home) + p.draw * Math.log(q.draw) + p.away * Math.log(q.away))
  }

  for (let iteration = 0; iteration < 10_000; iteration++) {
    const gradient = new Map(Object.keys(teams).map((t) => [Number(t), 2 * ANCHOR * (teams[Number(t)] - last[Number(t)])]))
    for (const m of matches) {
      const gap = teams[m.home] - teams[m.away] + homeAdvantage
      const slope = (loss(gap + 1e-5, m.p) - loss(gap - 1e-5, m.p)) / 2e-5
      gradient.set(m.home, gradient.get(m.home)! + slope)
      gradient.set(m.away, gradient.get(m.away)! - slope)
    }
    // Each match's loss curves by at most 1.6 per unit of gap (for gaps within ±3) and moves 2 Ratings,
    // so dividing by 2 per match keeps the descent from overshooting.
    let largest = 0
    for (const [t, g] of gradient) {
      const step = g / (2 * ((played.get(t) ?? 0) + 1))
      teams[t] -= step
      largest = Math.max(largest, Math.abs(step))
    }
    if (largest < 1e-9) break
  }
  return teams
}

// "Brighton & Hove Albion FC" and "Brighton and Hove Albion" both become "brighton and hove albion";
// "Atlético" and "Atletico" both become "atletico"; "Valencia CF" (Spain's FC) becomes "valencia".
const normalise = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .split(/\s+/)
    .filter((w) => w && w !== 'fc' && w !== 'afc' && w !== 'cf')
    .join(' ')
