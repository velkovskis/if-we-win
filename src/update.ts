// Update: turns raw football-data.org responses into the published Season.
// Pure: no network, no clock; the caller passes everything in.

type ProviderTeam = { id: number; shortName: string; crest: string }

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
  standings: { type: string; table: { team: ProviderTeam }[] }[]
}

export type SeasonConfig = { league: string; season: number; championsLeaguePlaces: number }

export type Team = { id: number; name: string; crest: string }
export type Scoreline = { home: number; away: number }
export type Fixture = { id: number; matchweek: number; homeTeamId: number; awayTeamId: number }
export type Result = Fixture & { scoreline: Scoreline }

export type Season = SeasonConfig & {
  leagueName: string
  updatedAt: string
  teams: Team[]
  results: Result[]
  fixtures: Fixture[]
}

// Everything else, including in-progress and postponed matches, is a Fixture.
const FINISHED = new Set(['FINISHED', 'AWARDED'])

export function update(input: {
  matches: MatchesResponse
  standings: StandingsResponse
  config: SeasonConfig
  now: Date
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

  return { ...input.config, leagueName: input.matches.competition.name, updatedAt: input.now.toISOString(), teams, results, fixtures }
}
