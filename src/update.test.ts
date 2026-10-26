import { describe, expect, it } from 'vitest'
import matches from '../test/recorded/PL/matches.json'
import standings from '../test/recorded/PL/standings.json'
import llMatches from '../test/recorded/LL/matches.json'
import llStandings from '../test/recorded/LL/standings.json'
import saMatches from '../test/recorded/SA/matches.json'
import saStandings from '../test/recorded/SA/standings.json'
import blMatches from '../test/recorded/BL/matches.json'
import blStandings from '../test/recorded/BL/standings.json'
import l1Matches from '../test/recorded/L1/matches.json'
import l1Standings from '../test/recorded/L1/standings.json'
import edMatches from '../test/recorded/ED/matches.json'
import edStandings from '../test/recorded/ED/standings.json'
import leagues from '../config/leagues.json'
import { DEFAULT_SETTINGS, outcomeProbabilities } from './forecast.ts'
import type { OddsResponse, Ratings } from './ratings.ts'
import { FeedsOutOfSync, update, type Deduction, type LeagueConfig, type MatchesResponse, type StandingsResponse } from './update.ts'

const config: LeagueConfig = {
  league: 'PL',
  name: 'Premier League',
  season: 2026,
  championsLeaguePlaces: 4,
  relegationPlaces: 3,
  tieBreaks: 'premierLeague',
  oddsSportKey: 'soccer_epl',
  oddsAliases: {},
  firstSnapshot: '2026-10-27',
  deductions: [],
}
const now = new Date('2026-10-19T20:00:00Z')

const run = (m: MatchesResponse = matches, s: StandingsResponse = standings, deductions: Deduction[] = []) =>
  update({ matches: m, standings: s, config: { ...config, deductions }, now }).season

const ratingsFrom = (odds?: OddsResponse, ratings?: Ratings, league: Partial<LeagueConfig> = {}) =>
  update({ matches, standings, config: { ...config, ...league }, now, odds, ratings }).season.ratings

// A copy of the recorded matches response with one match edited.
const editMatch = (id: number, edit: object): MatchesResponse => ({
  ...matches,
  matches: matches.matches.map((m) => (m.id === id ? { ...m, ...edit } : m)),
})

// A copy of the recorded standings with some teams' official points edited, keyed by team id.
const editPoints = (points: Record<number, number>): StandingsResponse => ({
  standings: standings.standings.map((s) => ({ ...s, table: s.table.map((r) => ({ ...r, points: points[r.team.id] ?? r.points })) })),
})

const IN_PLAY_ID = 560606
const FINISHED_ID = 560542 // Arsenal 3-0 Coventry, Matchweek 1
const TIMED_ID = matches.matches.find((m) => m.status === 'TIMED')!.id

describe('update', () => {
  it('publishes the league, season, config and current time', () => {
    const season = run()
    expect(season.league).toBe('PL')
    expect(season.leagueName).toBe('Premier League')
    expect(season.season).toBe(2026)
    expect(season.championsLeaguePlaces).toBe(4)
    expect(season.relegationPlaces).toBe(3)
    expect(season.tieBreaks).toBe('premierLeague')
    expect(season.updatedAt).toBe('2026-10-19T20:00:00.000Z')
  })

  it('publishes the Forecast’s model settings, unless the League sets its own', () => {
    expect(run()).toMatchObject({ homeAdvantage: DEFAULT_SETTINGS.homeAdvantage, strengthNoise: DEFAULT_SETTINGS.strengthNoise })
    const season = update({ matches, standings, config: { ...config, homeAdvantage: 0.3, strengthNoise: 0.1 }, now }).season
    expect(season).toMatchObject({ homeAdvantage: 0.3, strengthNoise: 0.1 })
  })

  it('keeps the League’s update-only config out of the Season', () => {
    for (const key of ['firstSnapshot', 'oddsSportKey', 'oddsAliases', 'teamNames']) expect(run()).not.toHaveProperty(key)
  })

  it('fails on an unknown tie-break order, naming it', () => {
    expect(() => update({ matches, standings, config: { ...config, tieBreaks: 'nope' as never }, now })).toThrow(/nope/)
  })

  it('publishes all 20 teams', () => {
    const season = run()
    expect(season.teams).toHaveLength(20)
    expect(season.teams).toContainEqual({ id: 57, name: 'Arsenal', crest: 'https://crests.football-data.org/57.png' })
  })

  it('splits matches into Results and Fixtures', () => {
    const season = run()
    expect(season.results).toHaveLength(69)
    expect(season.fixtures).toHaveLength(311)
  })

  it('gives a Result its final Scoreline', () => {
    expect(run().results).toContainEqual({ id: FINISHED_ID, matchweek: 1, homeTeamId: 57, awayTeamId: 1076, kickoff: '2026-08-21T19:00:00Z', scoreline: { home: 3, away: 0 } })
  })

  it('gives a Fixture its kick-off', () => {
    expect(run().fixtures).toContainEqual({ id: 560620, matchweek: 8, homeTeamId: 349, awayTeamId: 351, kickoff: '2026-10-23T19:00:00Z' })
  })

  it('treats an in-progress match as a Fixture', () => {
    const season = run()
    expect(season.fixtures.map((f) => f.id)).toContain(IN_PLAY_ID)
    expect(season.results.map((r) => r.id)).not.toContain(IN_PLAY_ID)
  })

  it('treats a postponed match as a Fixture that keeps its Matchweek', () => {
    const before = run().fixtures.find((f) => f.id === TIMED_ID)!
    const season = run(editMatch(TIMED_ID, { status: 'POSTPONED' }))
    expect(season.fixtures).toContainEqual({ ...before, status: 'postponed' })
  })

  it('marks a Fixture whose time is unconfirmed as TBC', () => {
    expect(run(editMatch(TIMED_ID, { status: 'SCHEDULED' })).fixtures.find((f) => f.id === TIMED_ID)?.status).toBe('tbc')
  })

  it.each(['POSTPONED', 'SUSPENDED', 'CANCELLED'])('marks a %s Fixture as postponed', (status) => {
    expect(run(editMatch(TIMED_ID, { status })).fixtures.find((f) => f.id === TIMED_ID)?.status).toBe('postponed')
  })

  it('gives a confirmed or in-progress Fixture no status', () => {
    const fixtures = run().fixtures
    expect(fixtures.find((f) => f.id === TIMED_ID)).not.toHaveProperty('status')
    expect(fixtures.find((f) => f.id === IN_PLAY_ID)).not.toHaveProperty('status')
    expect(run(editMatch(IN_PLAY_ID, { status: 'PAUSED' })).fixtures.find((f) => f.id === IN_PLAY_ID)).not.toHaveProperty('status')
  })

  it('keeps a rearranged Fixture’s id and Matchweek', () => {
    const before = run().fixtures.find((f) => f.id === TIMED_ID)!
    const season = run(editMatch(TIMED_ID, { utcDate: '2027-05-30T15:00:00Z' }))
    const after = season.fixtures.find((f) => f.id === TIMED_ID)!
    expect(after.id).toBe(before.id)
    expect(after.matchweek).toBe(before.matchweek)
  })

  it('keeps Fixture ids stable when the response order changes', () => {
    const reversed = { ...matches, matches: [...matches.matches].reverse() }
    const ids = (m: MatchesResponse) => new Set(run(m).fixtures.map((f) => f.id))
    expect(ids(reversed)).toEqual(ids(matches))
  })

  it('numbers Matchweeks 1–38 with 10 matches each', () => {
    const season = run()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 10)).toBe(true)
  })

  it('fails when computed points disagree with the official standings, naming the team and both totals', () => {
    expect(() => run(matches, editPoints({ 65: 18 }))).toThrow(/Man City \(id 65\): computed 21, official 18/)
  })

  it('passes once the matching Deduction is added, and publishes it', () => {
    const deductions = [{ teamId: 65, points: 3 }]
    expect(run(matches, editPoints({ 65: 18 }), deductions).deductions).toEqual(deductions)
  })

  it('names every team that disagrees', () => {
    expect(() => run(matches, editPoints({ 65: 18, 57: 17 }))).toThrow(/Man City.*\n.*Arsenal \(id 57\): computed 18, official 17/)
  })

  it('fails as feeds out of sync when the standings count a match the matches feed hasn’t finished, naming both teams', () => {
    const lagging = editMatch(FINISHED_ID, { status: 'TIMED', score: { fullTime: { home: null, away: null } } })
    expect(() => run(lagging)).toThrow(FeedsOutOfSync)
    expect(() => run(lagging)).toThrow(/Arsenal \(id 57\): 6 finished in the matches feed, 7 played in the standings\n.*Coventry/)
  })

  it('fails a missing Deduction as an ordinary error, not as feeds out of sync', () => {
    const error = (() => { try { run(matches, editPoints({ 65: 18 })) } catch (e) { return e } })()
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(FeedsOutOfSync)
  })

  it('rejects a Deduction for a team not in the league', () => {
    expect(() => run(matches, standings, [{ teamId: 1, points: 3 }])).toThrow(/Deduction for unknown team 1/)
  })
})

// The 20 recorded teams, named as The Odds API names them (no FC, "and" for "&").
const TEAMS = standings.standings[0].table.map(({ team }) => ({ id: team.id, oddsName: team.name.replace(/^AFC | A?FC$/, '').replace('&', 'and') }))
// Known Ratings with mean 0, from strongest to weakest.
const KNOWN: Ratings = { teams: Object.fromEntries(TEAMS.map((t, i) => [t.id, 0.57 - i * 0.06])) }
const LAST: Ratings = { teams: Object.fromEntries(TEAMS.map((t, i) => [t.id, i % 2 ? 0.1 : -0.1])), oddsFetchedAt: '2026-10-18T06:00:00.000Z' }
const KICK_OFF = '2026-10-24T14:00:00Z'

// Bookmaker odds from two bookmakers for every pair at home and away from the Known Ratings and a home advantage, each with its own margin.
const oddsFrom = (ratings: Ratings, teams = TEAMS, commenceTime = KICK_OFF, homeAdvantage = DEFAULT_SETTINGS.homeAdvantage): OddsResponse =>
  teams.flatMap((home) =>
    teams
      .filter((away) => away !== home)
      .map((away) => {
        const p = outcomeProbabilities(ratings.teams[home.id] - ratings.teams[away.id] + homeAdvantage)
        const bookmaker = (margin: number) => ({
          key: `book${margin}`,
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: home.oddsName, price: 1 / (p.home * margin) },
                { name: away.oddsName, price: 1 / (p.away * margin) },
                { name: 'Draw', price: 1 / (p.draw * margin) },
              ],
            },
          ],
        })
        return { commence_time: commenceTime, home_team: home.oddsName, away_team: away.oddsName, bookmakers: [bookmaker(1.04), bookmaker(1.07)] }
      }),
  )

describe('update Ratings', () => {
  it('fits Bookmaker odds generated from known Ratings back to those Ratings', () => {
    const ratings = ratingsFrom(oddsFrom(KNOWN))
    for (const t of TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(KNOWN.teams[t.id], 2)
    expect(ratings.oddsFetchedAt).toBe(now.toISOString())
  })

  it('fits with the home advantage from the Forecast settings, not one of its own', () => {
    // Odds priced with a bigger home advantage can only be matched by fitting one, which would recover the Known Ratings.
    const ratings = ratingsFrom(oddsFrom(KNOWN, TEAMS, KICK_OFF, DEFAULT_SETTINGS.homeAdvantage + 0.3))
    expect(ratings).not.toHaveProperty('homeAdvantage')
    expect(Math.max(...TEAMS.map((t) => Math.abs(ratings.teams[t.id] - KNOWN.teams[t.id])))).toBeGreaterThan(0.01)
  })

  it('fits with the League’s own home advantage when it sets one', () => {
    const homeAdvantage = DEFAULT_SETTINGS.homeAdvantage + 0.3
    const ratings = ratingsFrom(oddsFrom(KNOWN, TEAMS, KICK_OFF, homeAdvantage), undefined, { homeAdvantage })
    for (const t of TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(KNOWN.teams[t.id], 2)
  })

  it('fits a single Matchweek of Bookmaker odds, where each team plays once', () => {
    // Team i plays team 19 − i, with the even-numbered team at home.
    const index = (name: string) => TEAMS.findIndex((t) => t.oddsName === name)
    const matchweek = oddsFrom(KNOWN).filter((e) => index(e.home_team) + index(e.away_team) === 19 && index(e.home_team) % 2 === 0)
    expect(matchweek).toHaveLength(10)
    const ratings = ratingsFrom(matchweek, LAST)
    for (const e of matchweek) {
      const [home, away] = [e.home_team, e.away_team].map((n) => TEAMS[index(n)].id)
      // One Matchweek pins only each pair's gap, not the Ratings themselves.
      const gap = (r: Ratings) => r.teams[home] - r.teams[away]
      expect(gap(ratings)).toBeCloseTo(gap(KNOWN), 2)
    }
  })

  it('keeps the last good Ratings when there are no Bookmaker odds', () => {
    expect(ratingsFrom(undefined, LAST)).toEqual(LAST)
  })

  it('keeps the last good Ratings, but records the fetch, when there are none', () => {
    expect(ratingsFrom([], LAST)).toEqual({ ...LAST, oddsFetchedAt: now.toISOString() })
  })

  it('falls back to equal Ratings on the very first run', () => {
    const ratings = ratingsFrom()
    expect(Object.keys(ratings.teams)).toHaveLength(20)
    expect(Object.values(ratings.teams).every((r) => r === 0)).toBe(true)
  })

  it('keeps the last Rating of a team absent from the Bookmaker odds', () => {
    const [absent, ...rest] = TEAMS
    const ratings = ratingsFrom(oddsFrom(KNOWN, rest), LAST)
    expect(ratings.teams[absent.id]).toBe(LAST.teams[absent.id])
    expect(ratings.teams[rest[0].id]).not.toBe(LAST.teams[rest[0].id])
  })

  it('ignores matches that have already kicked off', () => {
    expect(ratingsFrom(oddsFrom(KNOWN, TEAMS, '2026-10-19T19:30:00Z'), LAST).teams).toEqual(LAST.teams)
  })

  it('fails on a Bookmaker odds team it cannot match, naming it', () => {
    const odds = oddsFrom(KNOWN, TEAMS.slice(0, 2)).map((e) => ({ ...e, home_team: 'Real Madrid' }))
    expect(() => ratingsFrom(odds)).toThrow(/Real Madrid/)
  })

  it('ignores accents when matching Bookmaker odds names', () => {
    const odds: OddsResponse = JSON.parse(JSON.stringify(oddsFrom(KNOWN)).replaceAll('"Arsenal"', '"Arsénal"'))
    expect(ratingsFrom(odds).teams[57]).toBeCloseTo(KNOWN.teams[57], 2)
  })

  it('matches a Bookmaker odds name through the League’s aliases', () => {
    const odds: OddsResponse = JSON.parse(JSON.stringify(oddsFrom(KNOWN)).replaceAll('"Arsenal"', '"The Gunners"'))
    expect(() => ratingsFrom(odds)).toThrow(/The Gunners/)
    expect(ratingsFrom(odds, undefined, { oddsAliases: { 'The Gunners': 'Arsenal' } }).teams[57]).toBeCloseTo(KNOWN.teams[57], 2)
  })

  it('publishes no raw Bookmaker odds', () => {
    const odds = oddsFrom(KNOWN)
    const published = JSON.stringify(update({ matches, standings, config, now, odds }))
    expect(published).not.toMatch(/bookmaker|h2h|price|book1/i)
    expect(published).not.toContain(String(odds[0].bookmakers[0].markets[0].outcomes[0].price))
  })
})

// The JSON import types each League's aliases by their own names, which no longer overlap LeagueConfig's.
const LEAGUES = leagues as unknown as LeagueConfig[]

// LaLiga's entry as committed, but with no Deductions, which only the recorded standings can justify.
const LALIGA = { ...LEAGUES.find((l) => l.league === 'LL')!, deductions: [] }
const runLaLiga = (odds?: OddsResponse) => update({ matches: llMatches, standings: llStandings, config: LALIGA, now, odds }).season
// The recorded teams, named as The Odds API named them on 2026-10-22.
const LALIGA_TEAMS = Object.entries({
  81: 'Barcelona', 78: 'Atlético Madrid', 86: 'Real Madrid', 90: 'Real Betis', 92: 'Real Sociedad', 559: 'Sevilla', 263: 'Alavés',
  558: 'Celta Vigo', 560: 'Deportivo La Coruña', 79: 'CA Osasuna', 88: 'Levante', 94: 'Villarreal', 77: 'Athletic Bilbao', 87: 'Rayo Vallecano',
  82: 'Getafe', 80: 'Espanyol', 5335: 'Real Racing Club de Santander', 285: 'Elche CF', 95: 'Valencia', 84: 'Málaga',
}).map(([id, oddsName]) => ({ id: Number(id), oddsName }))

describe('update LaLiga', () => {
  it('publishes LaLiga’s config, passing the standings guard', () => {
    expect(runLaLiga()).toMatchObject({ league: 'LL', leagueName: 'LaLiga', season: 2026, championsLeaguePlaces: 4, relegationPlaces: 3, tieBreaks: 'headToHeadFirst' })
  })

  it('publishes all 20 teams, and its Results and Fixtures', () => {
    const season = runLaLiga()
    expect(season.teams).toHaveLength(20)
    expect(season.teams).toContainEqual({ id: 87, name: 'Rayo Vallecano', crest: 'https://crests.football-data.org/87.png' })
    expect(season.results).toHaveLength(89)
    expect(season.fixtures).toHaveLength(291)
  })

  it('names teams as fans do where the League’s config says so, and as football-data.org does otherwise', () => {
    const names = new Map(runLaLiga().teams.map((t) => [t.id, t.name]))
    expect([81, 78, 86].map((id) => names.get(id))).toEqual(['Barcelona', 'Atlético Madrid', 'Real Madrid'])
    expect(new Map(run().teams.map((t) => [t.id, t.name])).get(65)).toBe('Man City')
  })

  it('numbers Matchweeks 1–38 with 10 matches each', () => {
    const season = runLaLiga()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 10)).toBe(true)
  })

  it('matches every Bookmaker odds name to a team through accents and the League’s aliases', () => {
    const known = { teams: Object.fromEntries(LALIGA_TEAMS.map((t, i) => [t.id, 0.57 - i * 0.06])) }
    const ratings = runLaLiga(oddsFrom(known, LALIGA_TEAMS)).ratings
    for (const t of LALIGA_TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(known.teams[t.id], 2)
  })
})

// Serie A's entry as committed, but with no Deductions, which only the recorded standings can justify.
const SERIE_A = { ...LEAGUES.find((l) => l.league === 'SA')!, deductions: [] }
const runSerieA = (odds?: OddsResponse) => update({ matches: saMatches, standings: saStandings, config: SERIE_A, now, odds }).season
// The recorded teams, named as The Odds API named them on 2026-10-23.
const SERIE_A_TEAMS = Object.entries({
  108: 'Inter Milan', 110: 'Lazio', 100: 'AS Roma', 98: 'AC Milan', 7397: 'Como', 470: 'Frosinone', 104: 'Cagliari', 109: 'Juventus',
  113: 'Napoli', 586: 'Torino', 102: 'Atalanta BC', 5890: 'Lecce', 471: 'Sassuolo', 5911: 'Monza', 103: 'Bologna', 115: 'Udinese',
  107: 'Genoa', 99: 'Fiorentina', 112: 'Parma', 454: 'Venezia',
}).map(([id, oddsName]) => ({ id: Number(id), oddsName }))

describe('update Serie A', () => {
  it('publishes Serie A’s config, passing the standings guard', () => {
    expect(runSerieA()).toMatchObject({ league: 'SA', leagueName: 'Serie A', season: 2026, championsLeaguePlaces: 4, relegationPlaces: 3, tieBreaks: 'serieA' })
  })

  it('publishes all 20 teams, and its Results and Fixtures', () => {
    const season = runSerieA()
    expect(season.teams).toHaveLength(20)
    expect(season.teams).toContainEqual({ id: 108, name: 'Inter', crest: 'https://crests.football-data.org/108.png' })
    expect(season.results).toHaveLength(70)
    expect(season.fixtures).toHaveLength(310)
  })

  it('names teams as fans do where the League’s config says so', () => {
    const names = new Map(runSerieA().teams.map((t) => [t.id, t.name]))
    expect([7397, 454].map((id) => names.get(id))).toEqual(['Como', 'Venezia'])
  })

  it('numbers Matchweeks 1–38 with 10 matches each', () => {
    const season = runSerieA()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 10)).toBe(true)
  })

  it('matches every Bookmaker odds name to a team through the League’s aliases', () => {
    const known = { teams: Object.fromEntries(SERIE_A_TEAMS.map((t, i) => [t.id, 0.57 - i * 0.06])) }
    const ratings = runSerieA(oddsFrom(known, SERIE_A_TEAMS)).ratings
    for (const t of SERIE_A_TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(known.teams[t.id], 2)
  })
})

// The Bundesliga's entry as committed, but with no Deductions, which only the recorded standings can justify.
const BUNDESLIGA = { ...LEAGUES.find((l) => l.league === 'BL')!, deductions: [] }
const runBundesliga = (odds?: OddsResponse) => update({ matches: blMatches, standings: blStandings, config: BUNDESLIGA, now, odds }).season
// The recorded teams, named as The Odds API named them on 2026-10-23.
const BUNDESLIGA_TEAMS = Object.entries({
  5: 'Bayern Munich', 4: 'Borussia Dortmund', 17: 'SC Freiburg', 3: 'Bayer Leverkusen', 15: 'FSV Mainz 05', 719: 'Elversberg',
  721: 'RB Leipzig', 12: 'Werder Bremen', 7: 'Hamburger SV', 16: 'Augsburg', 19: 'Eintracht Frankfurt', 1: '1. FC Köln',
  2: 'TSG Hoffenheim', 10: 'VfB Stuttgart', 6: 'FC Schalke 04', 29: 'SC Paderborn', 28: 'Union Berlin', 18: 'Borussia Monchengladbach',
}).map(([id, oddsName]) => ({ id: Number(id), oddsName }))

describe('update Bundesliga', () => {
  it('publishes the Bundesliga’s config, with its Relegation play-off place, passing the standings guard', () => {
    expect(runBundesliga()).toMatchObject({
      league: 'BL', leagueName: 'Bundesliga', season: 2026, championsLeaguePlaces: 4, relegationPlaces: 2, relegationPlayOffPlace: 16, tieBreaks: 'bundesliga',
    })
  })

  it('publishes no Relegation play-off place for a League without one', () => {
    expect(run()).not.toHaveProperty('relegationPlayOffPlace')
  })

  it('publishes all 18 teams, and its Results and Fixtures', () => {
    const season = runBundesliga()
    expect(season.teams).toHaveLength(18)
    expect(season.teams).toContainEqual({ id: 4, name: 'Dortmund', crest: 'https://crests.football-data.org/4.png' })
    expect(season.results).toHaveLength(55)
    expect(season.fixtures).toHaveLength(251)
  })

  it('names teams as fans do where the League’s config says so', () => {
    const names = new Map(runBundesliga().teams.map((t) => [t.id, t.name]))
    expect([7, 18, 29, 1].map((id) => names.get(id))).toEqual(['Hamburg', 'Gladbach', 'Paderborn', 'Köln'])
  })

  it('numbers Matchweeks 1–34 with 9 matches each', () => {
    const season = runBundesliga()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 34 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 9)).toBe(true)
  })

  it('matches every Bookmaker odds name to a team through accents and the League’s aliases', () => {
    const known = { teams: Object.fromEntries(BUNDESLIGA_TEAMS.map((t, i) => [t.id, 0.51 - i * 0.06])) }
    const ratings = runBundesliga(oddsFrom(known, BUNDESLIGA_TEAMS)).ratings
    for (const t of BUNDESLIGA_TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(known.teams[t.id], 2)
  })
})

// Ligue 1's entry as committed, but with no Deductions, which only the recorded standings can justify.
const LIGUE_1 = { ...LEAGUES.find((l) => l.league === 'L1')!, deductions: [] }
const runLigue1 = (odds?: OddsResponse) => update({ matches: l1Matches, standings: l1Standings, config: LIGUE_1, now, odds }).season
// The recorded teams, named as The Odds API named them on 2026-10-23.
const LIGUE_1_TEAMS = Object.entries({
  523: 'Lyon', 524: 'Paris Saint Germain', 1045: 'Paris FC', 521: 'Lille', 548: 'AS Monaco', 529: 'Rennes', 525: 'Lorient', 522: 'Nice',
  546: 'RC Lens', 516: 'Marseille', 512: 'Brest', 511: 'Toulouse', 519: 'Auxerre', 576: 'Strasbourg', 532: 'Angers', 535: 'Le Mans FC',
  531: 'Troyes', 533: 'Le Havre',
}).map(([id, oddsName]) => ({ id: Number(id), oddsName }))

describe('update Ligue 1', () => {
  it('publishes Ligue 1’s config, with its Relegation play-off place, passing the standings guard', () => {
    expect(runLigue1()).toMatchObject({
      league: 'L1', leagueName: 'Ligue 1', season: 2026, championsLeaguePlaces: 4, relegationPlaces: 2, relegationPlayOffPlace: 16, tieBreaks: 'ligue1',
    })
  })

  it('publishes all 18 teams, and its Results and Fixtures', () => {
    const season = runLigue1()
    expect(season.teams).toHaveLength(18)
    expect(season.teams).toContainEqual({ id: 524, name: 'PSG', crest: 'https://crests.football-data.org/524.png' })
    expect(season.results).toHaveLength(64)
    expect(season.fixtures).toHaveLength(242)
  })

  it('names teams as fans do where the League’s config says so', () => {
    const names = new Map(runLigue1().teams.map((t) => [t.id, t.name]))
    expect([523, 529, 532, 546].map((id) => names.get(id))).toEqual(['Lyon', 'Rennes', 'Angers', 'Lens'])
  })

  it('numbers Matchweeks 1–34 with 9 matches each', () => {
    const season = runLigue1()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 34 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 9)).toBe(true)
  })

  it('matches every Bookmaker odds name to a team through the League’s aliases', () => {
    const known = { teams: Object.fromEntries(LIGUE_1_TEAMS.map((t, i) => [t.id, 0.51 - i * 0.06])) }
    const ratings = runLigue1(oddsFrom(known, LIGUE_1_TEAMS)).ratings
    for (const t of LIGUE_1_TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(known.teams[t.id], 2)
  })
})

// The Eredivisie's entry as committed, but with no Deductions, which only the recorded standings can justify.
const EREDIVISIE = { ...LEAGUES.find((l) => l.league === 'ED')!, deductions: [] }
const runEredivisie = (odds?: OddsResponse) => update({ matches: edMatches, standings: edStandings, config: EREDIVISIE, now, odds }).season
// The recorded teams, named as The Odds API named them on 2026-10-23.
const EREDIVISIE_TEAMS = Object.entries({
  675: 'Feyenoord', 682: 'AZ Alkmaar', 674: 'PSV Eindhoven', 678: 'Ajax', 666: 'FC Twente Enschede', 1920: 'Fortuna Sittard',
  677: 'Groningen', 718: 'Go Ahead Eagles', 673: 'Heerenveen', 670: 'Excelsior', 676: 'FC Utrecht', 1915: 'NEC Nijmegen',
  6806: 'Sparta Rotterdam', 1909: 'SC Cambuur', 684: 'FC Zwolle', 1912: 'SC Telstar', 680: 'ADO Den Haag', 672: 'Willem II',
}).map(([id, oddsName]) => ({ id: Number(id), oddsName }))

describe('update Eredivisie', () => {
  it('publishes the Eredivisie’s config, with its Relegation play-off place, passing the standings guard', () => {
    expect(runEredivisie()).toMatchObject({
      league: 'ED', leagueName: 'Eredivisie', season: 2026, championsLeaguePlaces: 2, relegationPlaces: 2, relegationPlayOffPlace: 16, tieBreaks: 'eredivisie',
    })
  })

  it('publishes all 18 teams, and its Results and Fixtures', () => {
    const season = runEredivisie()
    expect(season.teams).toHaveLength(18)
    expect(season.teams).toContainEqual({ id: 675, name: 'Feyenoord', crest: 'https://crests.football-data.org/675.png' })
    expect(season.results).toHaveLength(82)
    expect(season.fixtures).toHaveLength(224)
  })

  it('names teams as fans do where the League’s config says so', () => {
    const names = new Map(runEredivisie().teams.map((t) => [t.id, t.name]))
    expect([1920, 684, 680].map((id) => names.get(id))).toEqual(['Fortuna Sittard', 'PEC Zwolle', 'ADO Den Haag'])
  })

  it('numbers Matchweeks 1–34 with 9 matches each', () => {
    const season = runEredivisie()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 34 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 9)).toBe(true)
  })

  it('matches every Bookmaker odds name to a team through the League’s aliases', () => {
    const known = { teams: Object.fromEntries(EREDIVISIE_TEAMS.map((t, i) => [t.id, 0.51 - i * 0.06])) }
    const ratings = runEredivisie(oddsFrom(known, EREDIVISIE_TEAMS)).ratings
    for (const t of EREDIVISIE_TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(known.teams[t.id], 2)
  })
})

// Each due Snapshot runs two full Forecasts, so a test that takes two can pass 5 seconds on a busy machine.
describe('update Snapshot', { timeout: 30_000 }, () => {
  const snapshotAt = (iso: string, lastSnapshot?: string, ratings?: Ratings, league: Partial<LeagueConfig> = {}) =>
    update({ matches, standings, config: { ...config, ...league }, now: new Date(iso), lastSnapshot, ratings }).snapshot

  it('is not due before the first Snapshot date, even on a Tuesday after 06:00 UTC', () => {
    expect(snapshotAt('2026-10-20T06:00:00Z')).toBeUndefined()
  })

  it('is not due at Tuesday 05:59 UTC', () => {
    expect(snapshotAt('2026-10-27T05:59:59Z')).toBeUndefined()
  })

  it('is due on the first run at or after Tuesday 06:00 UTC', () => {
    expect(snapshotAt('2026-10-27T06:00:00Z')?.date).toBe('2026-10-27T06:00:00.000Z')
    expect(snapshotAt('2026-10-29T14:00:00Z')?.date).toBe('2026-10-29T14:00:00.000Z')
  })

  it('is not due again in the same week', () => {
    expect(snapshotAt('2026-10-27T08:00:00Z', '2026-10-27T06:00:00.000Z')).toBeUndefined()
    expect(snapshotAt('2026-11-03T05:59:59Z', '2026-10-27T06:00:00.000Z')).toBeUndefined()
  })

  it('is due again from the next Tuesday 06:00 UTC', () => {
    expect(snapshotAt('2026-11-03T06:00:00Z', '2026-10-27T06:00:00.000Z')).toBeDefined()
  })

  it('records the Ratings, Forecast settings and seed, and every team’s Baseline and Benchmark Chances', () => {
    const snapshot = snapshotAt('2026-10-27T06:00:00Z', undefined, LAST)!
    expect(snapshot.ratings).toEqual(LAST)
    expect(snapshot.seed).toEqual(expect.any(Number))
    expect(snapshot.settings).toEqual({ ...DEFAULT_SETTINGS, championsLeaguePlaces: 4, relegationPlaces: 3 })
    for (const chances of [snapshot.baseline, snapshot.benchmark]) {
      expect(Object.keys(chances)).toHaveLength(20)
      const total = Object.values(chances).reduce((sum, c) => sum + c.title, 0)
      expect(total).toBeCloseTo(1)
    }
    expect(snapshot.baseline).not.toEqual(snapshot.benchmark)
  })

  it('records the League’s own model settings when it sets them', () => {
    expect(snapshotAt('2026-10-27T06:00:00Z', undefined, LAST, { strengthNoise: 0.1, homeAdvantage: 0.3 })!.settings).toMatchObject({ strengthNoise: 0.1, homeAdvantage: 0.3 })
  })

  it('gives every team the same Rating for the Benchmark', () => {
    const equal = { ...LAST, teams: Object.fromEntries(TEAMS.map((t) => [t.id, 0])) }
    expect(snapshotAt('2026-10-27T06:00:00Z', undefined, LAST)!.benchmark).toEqual(snapshotAt('2026-10-27T06:00:00Z', undefined, equal)!.baseline)
  })
})
