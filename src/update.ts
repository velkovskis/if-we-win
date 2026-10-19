// Update: turns raw football-data.org responses, and The Odds API's when fetched, into the published Season.
// Pure: no network, no clock; the caller passes everything in.
import { rate, type OddsResponse, type Ratings } from './ratings.ts'
import { table } from './table.ts'

type ProviderTeam = { id: number; name: string; shortName: string; crest: string }

export type MatchesResponse = {
  competition: { name: string }
  matches: {
    id: number
    status: string
    matchday: number
    homeTeam: { id: number }
    awayTeam: { id: number }
    score: { fullTime: { home: number | null; away: number | null } }
  }[]
}

export type StandingsResponse = {
  standings: { type: string; table: { team: ProviderTeam; points: number }[] }[]
}

export type SeasonConfig = { league: string; season: number; championsLeaguePlaces: number }

// Points taken off a team by the league; hand-edited in config/deductions.json.
export type Deduction = { teamId: number; points: number }

export type Team = { id: number; name: string; crest: string }
export type Scoreline = { home: number; away: number }
export type Fixture = { id: number; matchweek: number; homeTeamId: number; awayTeamId: number }
export type Result = Fixture & { scoreline: Scoreline }

export type Season = SeasonConfig & {
  deductions: Deduction[]
  leagueName: string
  updatedAt: string
  teams: Team[]
  results: Result[]
  fixtures: Fixture[]
  ratings: Ratings
}

// Everything else, including in-progress and postponed matches, is a Fixture.
const FINISHED = new Set(['FINISHED', 'AWARDED'])

export function update(input: {
  matches: MatchesResponse
  standings: StandingsResponse
  config: SeasonConfig
  deductions: Deduction[]
  now: Date
  odds?: OddsResponse // absent when not fetched this run, or when the fetch failed
  ratings?: Ratings // the last good Ratings, absent on the very first run
}): Season {
  const results: Result[] = []
  const fixtures: Fixture[] = []
  for (const m of input.matches.matches) {
    const fixture = { id: m.id, matchweek: m.matchday, homeTeamId: m.homeTeam.id, awayTeamId: m.awayTeam.id }
    if (!FINISHED.has(m.status)) {
      fixtures.push(fixture)
      continue
    }
    const { home, away } = m.score.fullTime
    if (home === null || away === null) throw new Error(`Match ${m.id} is ${m.status} but has no Scoreline`)
    results.push({ ...fixture, scoreline: { home, away } })
  }

  const total = input.standings.standings.find((s) => s.type === 'TOTAL')
  if (!total) throw new Error('Standings response has no TOTAL table')
  const teams = total.table.map(({ team }) => ({ id: team.id, name: team.shortName, crest: team.crest }))

  const { deductions } = input
  for (const d of deductions) if (!teams.some((t) => t.id === d.teamId)) throw new Error(`Deduction for unknown team ${d.teamId}`)

  // Standings guard: a mismatch usually means a Deduction is missing from config/deductions.json.
  const official = new Map(total.table.map((r) => [r.team.id, r.points]))
  const mismatches = table(teams, results, deductions).flatMap((r) => {
    const points = official.get(r.team.id)
    return r.points === points ? [] : [`${r.team.name} (id ${r.team.id}): computed ${r.points}, official ${points}`]
  })
  if (mismatches.length) throw new Error(`Points disagree with the official standings:\n${mismatches.join('\n')}`)

  const ratings = rate({ odds: input.odds, last: input.ratings, teams: total.table.map((r) => r.team), now: input.now })

  return { ...input.config, deductions, leagueName: input.matches.competition.name, updatedAt: input.now.toISOString(), teams, results, fixtures, ratings }
}
