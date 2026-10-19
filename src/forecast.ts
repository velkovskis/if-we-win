// Forecast: simulates the rest of the season many times to estimate each team's Chance of each Zone.
// Pure and deterministic for a given seed. Each random draw is keyed by (seed, simulation, Fixture or team id),
// never by draw order, so a Baseline and a Scenario share identical draws wherever their Locks agree.
import { rank, table } from './table.ts'
import type { Season } from './update.ts'

export type Outcome = 'home' | 'draw' | 'away'
export type Chances = { title: number; championsLeague: number; relegation: number }

// Average goals per side in an even match; Ratings and home advantage are in log expected goals.
const GOALS = 1.35

export function forecast(input: {
  season: Pick<Season, 'teams' | 'results' | 'fixtures' | 'deductions'>
  ratings: Record<number, number> // team id → Rating
  homeAdvantage: number
  locks: Record<number, Outcome> // Fixture id → Outcome
  seed: number
  settings: { championsLeaguePlaces: number; relegationPlaces?: number; simulations?: number; strengthNoise?: number }
}): Record<number, Chances> {
  const { season, ratings, homeAdvantage, locks, seed } = input
  // ponytail: placeholder strength noise; the backtest (#13) sets the real one.
  const { championsLeaguePlaces, relegationPlaces = 3, simulations = 20_000, strengthNoise = 0.1 } = input.settings

  const start = table(season.teams, season.results, season.deductions)
  const n = start.length
  const index = new Map(start.map((row, i) => [row.team.id, i]))
  // One mutable standing per team, reset each simulation; meetings point at them so rank() can settle head-to-head.
  const teams = start.map((_, i) => ({ i, points: 0, goalDifference: 0, goalsFor: 0, rating: 0, tieBreak: 0 }))
  const meetings = season.results.map((r) => ({ home: teams[index.get(r.homeTeamId)!], away: teams[index.get(r.awayTeamId)!], homeGoals: r.scoreline.home, awayGoals: r.scoreline.away }))
  const fixtures = season.fixtures.map((f) => ({ id: f.id, home: teams[index.get(f.homeTeamId)!], away: teams[index.get(f.awayTeamId)!], homeGoals: 0, awayGoals: 0, lock: locks[f.id] }))
  meetings.push(...fixtures)
  const counts = start.map(() => ({ title: 0, championsLeague: 0, relegation: 0 }))

  for (let sim = 0; sim < simulations; sim++) {
    for (const t of teams) {
      const row = start[t.i]
      const random = stream(seed, sim, TEAM, row.team.id)
      t.points = row.points
      t.goalDifference = row.goalDifference
      t.goalsFor = row.goalsFor
      t.rating = ratings[row.team.id] + strengthNoise * normal(random)
      t.tieBreak = random()
    }
    for (const f of fixtures) {
      const [home, away] = scoreline(stream(seed, sim, FIXTURE, f.id), expectedGoals(f.home.rating - f.away.rating + homeAdvantage), f.lock)
      f.homeGoals = home
      f.awayGoals = away
      f.home.goalsFor += home
      f.away.goalsFor += away
      f.home.goalDifference += home - away
      f.away.goalDifference += away - home
      const outcome = outcomeOf(home, away)
      if (outcome === 'home') f.home.points += 3
      else if (outcome === 'away') f.away.points += 3
      else (f.home.points++, f.away.points++)
    }
    // The coin flip stands in for a play-off.
    const order = rank(teams, meetings, (a, b) => a.tieBreak - b.tieBreak)
    counts[order[0].i].title++
    for (let p = 0; p < championsLeaguePlaces; p++) counts[order[p].i].championsLeague++
    for (let p = n - relegationPlaces; p < n; p++) counts[order[p].i].relegation++
  }

  return Object.fromEntries(
    start.map((row, i) => [
      row.team.id,
      { title: counts[i].title / simulations, championsLeague: counts[i].championsLeague / simulations, relegation: counts[i].relegation / simulations },
    ]),
  )
}

// The match model, shared with the Ratings fit: each side's expected goals from the gap
// (home Rating minus away Rating plus home advantage), then independent Poisson goals.
export const expectedGoals = (gap: number) => [GOALS * Math.exp(gap / 2), GOALS * Math.exp(-gap / 2)] as const

// Each Outcome's exact probability under the match model.
export function outcomeProbabilities(gap: number): Record<Outcome, number> {
  const [h, a] = expectedGoals(gap)
  let home = 0
  let draw = 0
  let pHome = Math.exp(-h) // P(home scores k)
  let pAway = Math.exp(-a) // P(away scores k)
  let awayBelow = 0 // P(away scores fewer than k)
  for (let k = 0; k < 40; k++) {
    home += pHome * awayBelow
    draw += pHome * pAway
    awayBelow += pAway
    pHome *= h / (k + 1)
    pAway *= a / (k + 1)
  }
  return { home, draw, away: 1 - home - draw }
}

const outcomeOf = (home: number, away: number): Outcome => (home > away ? 'home' : home === away ? 'draw' : 'away')

// ponytail: rejection sampling for a Locked Fixture; slow only if a Lock is an extreme long shot.
function scoreline(random: () => number, [homeGoals, awayGoals]: readonly [number, number], lock?: Outcome) {
  for (;;) {
    const home = poisson(random, homeGoals)
    const away = poisson(random, awayGoals)
    if (!lock || outcomeOf(home, away) === lock) return [home, away]
  }
}

function poisson(random: () => number, mean: number) {
  const limit = Math.exp(-mean)
  let k = 0
  for (let p = random(); p > limit; p *= random()) k++
  return k
}

const normal = (random: () => number) => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())

// Separate key spaces so a team id never shares draws with a Fixture id.
const TEAM = 0
const FIXTURE = 1

// A mulberry32 generator seeded by hashing the keys (murmur3 finaliser).
function stream(...keys: number[]) {
  let s = 0
  for (const k of keys) {
    s = (s ^ k) + 0x9e3779b9
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b)
    s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35)
    s ^= s >>> 16
  }
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
