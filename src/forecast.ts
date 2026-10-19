// Forecast: simulates the rest of the season many times to estimate each team's Chance of each Zone.
// Pure and deterministic for a given seed. Each random draw is keyed by (seed, simulation, Fixture or team id),
// never by draw order, so a Baseline and a Scenario share identical draws wherever their Locks agree.
import { table } from './table.ts'
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
  const fixtures = season.fixtures.map((f) => ({ id: f.id, home: index.get(f.homeTeamId)!, away: index.get(f.awayTeamId)!, lock: locks[f.id] }))

  const points = new Int32Array(n)
  const goalDifference = new Int32Array(n)
  const goalsFor = new Int32Array(n)
  const rating = new Float64Array(n)
  const tieBreak = new Float64Array(n)
  const order = start.map((_, i) => i)
  const counts = start.map(() => ({ title: 0, championsLeague: 0, relegation: 0 }))

  for (let sim = 0; sim < simulations; sim++) {
    for (let i = 0; i < n; i++) {
      const row = start[i]
      const random = stream(seed, sim, TEAM, row.team.id)
      points[i] = row.points
      goalDifference[i] = row.goalDifference
      goalsFor[i] = row.goalsFor
      rating[i] = ratings[row.team.id] + strengthNoise * normal(random)
      tieBreak[i] = random()
    }
    for (const f of fixtures) {
      const gap = rating[f.home] - rating[f.away] + homeAdvantage
      const [home, away] = scoreline(stream(seed, sim, FIXTURE, f.id), GOALS * Math.exp(gap / 2), GOALS * Math.exp(-gap / 2), f.lock)
      goalsFor[f.home] += home
      goalsFor[f.away] += away
      goalDifference[f.home] += home - away
      goalDifference[f.away] += away - home
      const outcome = outcomeOf(home, away)
      if (outcome === 'home') points[f.home] += 3
      else if (outcome === 'away') points[f.away] += 3
      else (points[f.home]++, points[f.away]++)
    }
    // ponytail: no head-to-head yet, like table(); #6 adds the official tie-breaks.
    order.sort((a, b) => points[b] - points[a] || goalDifference[b] - goalDifference[a] || goalsFor[b] - goalsFor[a] || tieBreak[a] - tieBreak[b])
    counts[order[0]].title++
    for (let p = 0; p < championsLeaguePlaces; p++) counts[order[p]].championsLeague++
    for (let p = n - relegationPlaces; p < n; p++) counts[order[p]].relegation++
  }

  return Object.fromEntries(
    start.map((row, i) => [
      row.team.id,
      { title: counts[i].title / simulations, championsLeague: counts[i].championsLeague / simulations, relegation: counts[i].relegation / simulations },
    ]),
  )
}

const outcomeOf = (home: number, away: number): Outcome => (home > away ? 'home' : home === away ? 'draw' : 'away')

// ponytail: rejection sampling for a Locked Fixture; slow only if a Lock is an extreme long shot.
function scoreline(random: () => number, homeGoals: number, awayGoals: number, lock?: Outcome) {
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
