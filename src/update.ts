// Update: turns raw football-data.org responses, and The Odds API's when fetched, into the published Season,
// plus a Snapshot when one is due. Pure: no network, no clock; the caller passes everything in.
import { DEFAULT_SETTINGS, forecast, SEED, type Chances } from './forecast.ts'
import { rate, type OddsResponse, type Ratings } from './ratings.ts'
import { table, type TieBreaks } from './table.ts'

type ProviderTeam = { id: number; name: string; shortName: string; crest: string }

export type MatchesResponse = {
  matches: {
    id: number
    status: string
    matchday: number
    utcDate: string
    homeTeam: { id: number }
    awayTeam: { id: number }
    score: { fullTime: { home: number | null; away: number | null } }
  }[]
}

export type StandingsResponse = {
  standings: { type: string; table: { team: ProviderTeam; points: number }[] }[]
}

// One League's entry in config/leagues.json, hand-edited.
export type LeagueConfig = {
  league: string // football-data.org's competition code, which also names the League in links and data, e.g. "PL"
  name: string // as fans call it, for the League tabs and header, e.g. "LaLiga" where football-data.org says "Primera Division"
  season: number
  championsLeaguePlaces: number
  relegationPlaces: number
  tieBreaks: TieBreaks
  oddsSportKey: string // The Odds API's, e.g. "soccer_epl"
  oddsAliases: Record<string, string> // Bookmaker odds name → football-data.org name, for names that don't match on their own
  firstSnapshot: string // the date (YYYY-MM-DD) from which weekly Snapshots start, e.g. once Ratings have had a few weeks to settle
  deductions: Deduction[]
  // Model settings, only when the backtest shows this League needs its own; the Forecast's defaults otherwise.
  homeAdvantage?: number
  strengthNoise?: number
}

// Points taken off a team by the league.
export type Deduction = { teamId: number; points: number }

export type Team = { id: number; name: string; crest: string }
export type Scoreline = { home: number; away: number }
// kickoff: an ISO timestamp, as the provider gives it. status: absent for a confirmed Kick-off, 'tbc' when only the date is set,
// 'postponed' when the date is no longer right.
export type Fixture = { id: number; matchweek: number; homeTeamId: number; awayTeamId: number; kickoff: string; status?: 'tbc' | 'postponed' }
export type Result = Fixture & { scoreline: Scoreline }

export type Season = Pick<LeagueConfig, 'league' | 'season' | 'championsLeaguePlaces' | 'relegationPlaces' | 'tieBreaks' | 'deductions'> & {
  homeAdvantage: number
  strengthNoise: number
  leagueName: LeagueConfig['name']
  updatedAt: string
  teams: Team[]
  results: Result[]
  fixtures: Fixture[]
  ratings: Ratings
}

// Enough to score the Baseline and Benchmark Chances against the final table, and to re-run either Forecast.
export type Snapshot = {
  date: string
  ratings: Ratings
  seed: number
  settings: typeof DEFAULT_SETTINGS & { championsLeaguePlaces: number; relegationPlaces: number }
  baseline: Record<number, Chances>
  benchmark: Record<number, Chances>
}

// Everything else, including in-progress and postponed matches, is a Fixture.
const FINISHED = new Set(['FINISHED', 'AWARDED'])
// In-progress matches (IN_PLAY, PAUSED) get no status: the data is hours old, so a "Live" label would go stale.
const STATUS: Record<string, Fixture['status']> = { SCHEDULED: 'tbc', POSTPONED: 'postponed', SUSPENDED: 'postponed', CANCELLED: 'postponed' }

export function update(input: {
  matches: MatchesResponse
  standings: StandingsResponse
  config: LeagueConfig
  now: Date
  odds?: OddsResponse // absent when not fetched this run, or when the fetch failed
  ratings?: Ratings // the last good Ratings, absent on the very first run
  lastSnapshot?: string // the last Snapshot's date, absent before the first
}): { season: Season; snapshot?: Snapshot } {
  const results: Result[] = []
  const fixtures: Fixture[] = []
  for (const m of input.matches.matches) {
    const fixture = { id: m.id, matchweek: m.matchday, homeTeamId: m.homeTeam.id, awayTeamId: m.awayTeam.id, kickoff: m.utcDate }
    if (!FINISHED.has(m.status)) {
      const status = STATUS[m.status]
      fixtures.push(status ? { ...fixture, status } : fixture)
      continue
    }
    const { home, away } = m.score.fullTime
    if (home === null || away === null) throw new Error(`Match ${m.id} is ${m.status} but has no Scoreline`)
    results.push({ ...fixture, scoreline: { home, away } })
  }

  const total = input.standings.standings.find((s) => s.type === 'TOTAL')
  if (!total) throw new Error('Standings response has no TOTAL table')
  const teams = total.table.map(({ team }) => ({ id: team.id, name: team.shortName, crest: team.crest }))

  const { league, season: year, championsLeaguePlaces, relegationPlaces, tieBreaks, deductions, firstSnapshot } = input.config
  const { homeAdvantage = DEFAULT_SETTINGS.homeAdvantage, strengthNoise = DEFAULT_SETTINGS.strengthNoise } = input.config
  for (const d of deductions) if (!teams.some((t) => t.id === d.teamId)) throw new Error(`Deduction for unknown team ${d.teamId}`)

  // Standings guard: a mismatch usually means a Deduction is missing from the League's config.
  const official = new Map(total.table.map((r) => [r.team.id, r.points]))
  const mismatches = table(teams, results, deductions, tieBreaks).flatMap((r) => {
    const points = official.get(r.team.id)
    return r.points === points ? [] : [`${r.team.name} (id ${r.team.id}): computed ${r.points}, official ${points}`]
  })
  if (mismatches.length) throw new Error(`Points disagree with the official standings:\n${mismatches.join('\n')}`)

  const ratings = rate({ odds: input.odds, last: input.ratings, teams: total.table.map((r) => r.team), now: input.now, homeAdvantage, aliases: input.config.oddsAliases })

  const season = { league, season: year, championsLeaguePlaces, relegationPlaces, tieBreaks, homeAdvantage, strengthNoise, deductions, leagueName: input.config.name, updatedAt: input.now.toISOString(), teams, results, fixtures, ratings }
  return { season, snapshot: snapshotDue(input.now, firstSnapshot, input.lastSnapshot) ? snapshot(season, input.now) : undefined }
}

// Due on the first run at or after Tuesday 06:00 UTC, at most once a week, from the first Snapshot date on.
function snapshotDue(now: Date, first: string, last?: string) {
  const weekStart = new Date(now)
  weekStart.setUTCHours(6, 0, 0, 0)
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 5) % 7)) // back to Tuesday (day 2)
  if (weekStart > now) weekStart.setUTCDate(weekStart.getUTCDate() - 7)
  return weekStart.getTime() >= Date.parse(first) && !(last && Date.parse(last) >= weekStart.getTime())
}

function snapshot(season: Season, now: Date): Snapshot {
  const { ratings, championsLeaguePlaces, relegationPlaces, homeAdvantage, strengthNoise } = season
  const settings = { ...DEFAULT_SETTINGS, championsLeaguePlaces, relegationPlaces, homeAdvantage, strengthNoise }
  const run = (teamRatings: Record<number, number>) => forecast({ season, ratings: teamRatings, locks: {}, seed: SEED, settings }).chances
  const equal = Object.fromEntries(season.teams.map((t) => [t.id, 0]))
  return { date: now.toISOString(), ratings, seed: SEED, settings, baseline: run(ratings.teams), benchmark: run(equal) }
}
