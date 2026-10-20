// Forecast: simulates the rest of the season many times to estimate each team's Chance of each Zone,
// and checks which Zones each team has Clinched or been Eliminated from.
// Pure and deterministic for a given seed. Each random draw is keyed by (seed, simulation, Fixture or team id),
// never by draw order, so a Baseline and a Scenario share identical draws wherever their Locks agree.
import { rank, table } from './table.ts'
import type { Season } from './update.ts'

export type Outcome = 'home' | 'draw' | 'away'
export type Chances = { title: number; championsLeague: number; relegation: number }
export type Zone = keyof Chances
export type Status = 'clinched' | 'eliminated' | 'open'
export type Forecast = {
  chances: Record<number, Chances>
  status: Record<number, Record<Zone, Status>>
  // Fixture id → Outcome → team id → Chance among the simulations where that Outcome was sampled; an Outcome never sampled is left out.
  conditional: Record<number, Partial<Record<Outcome, Record<number, Chances>>>>
}

// Average goals per side in an even match; Ratings and home advantage are in log expected goals.
const GOALS = 1.35

// ponytail: placeholder strength noise; the backtest (#13) sets the real one.
export const DEFAULT_SETTINGS = { relegationPlaces: 3, simulations: 20_000, strengthNoise: 0.1 }
// The site and Snapshots both use it, so a Snapshot's Baseline matches what the site showed.
export const SEED = 1

export type Input = {
  season: Pick<Season, 'teams' | 'results' | 'fixtures' | 'deductions'>
  ratings: Record<number, number> // team id → Rating
  homeAdvantage: number
  locks: Record<number, Outcome> // Fixture id → Outcome
  seed: number
  settings: { championsLeaguePlaces: number } & Partial<typeof DEFAULT_SETTINGS>
}
// Zone finishes by team (team index × 3 + Zone index), overall and per Fixture and sampled Outcome, with how often each Outcome was sampled.
export type Tally = { counts: Uint32Array; conditionalCounts: Uint32Array; samples: Uint32Array }

export const forecast = (input: Input): Forecast => finish(input, [tally(input)])

// The table before any simulation, with one mutable standing per team that each simulation resets.
function setup(input: Input) {
  const { season, locks } = input
  const settings = { ...DEFAULT_SETTINGS, ...input.settings }
  const start = table(season.teams, season.results, season.deductions)
  const index = new Map(start.map((row, i) => [row.team.id, i]))
  // Meetings point at the standings so rank() can settle head-to-head.
  const teams = start.map((_, i) => ({ i, points: 0, goalDifference: 0, goalsFor: 0, rating: 0, tieBreak: 0 }))
  const meetings = season.results.map((r) => ({ home: teams[index.get(r.homeTeamId)!], away: teams[index.get(r.awayTeamId)!], homeGoals: r.scoreline.home, awayGoals: r.scoreline.away }))
  const fixtures = season.fixtures.map((f) => ({ id: f.id, home: teams[index.get(f.homeTeamId)!], away: teams[index.get(f.awayTeamId)!], homeGoals: 0, awayGoals: 0, lock: locks[f.id], outcome: 0 }))
  meetings.push(...fixtures)
  return { settings, start, teams, meetings, fixtures }
}

// Simulations `from` up to `to`. Draws are keyed by simulation, so tallies of ranges that split the
// simulations add up to exactly the tally of one run over all of them, which lets workers share a Forecast.
export function tally(input: Input, from = 0, to?: number): Tally {
  const { ratings, homeAdvantage, seed } = input
  const { settings, start, teams, meetings, fixtures } = setup(input)
  const { championsLeaguePlaces, relegationPlaces, strengthNoise } = settings
  to ??= settings.simulations
  const n = start.length
  const counts = new Uint32Array(n * 3)
  const conditionalCounts = new Uint32Array(fixtures.length * 3 * n * 3)
  const samples = new Uint32Array(fixtures.length * 3)

  for (let sim = from; sim < to; sim++) {
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
      f.outcome = OUTCOMES.indexOf(outcome)
      if (outcome === 'home') f.home.points += 3
      else if (outcome === 'away') f.away.points += 3
      else (f.home.points++, f.away.points++)
    }
    // The coin flip stands in for a play-off.
    const order = rank(teams, meetings, (a, b) => a.tieBreak - b.tieBreak)
    const finishes = [order[0].i * 3, ...order.slice(0, championsLeaguePlaces).map((t) => t.i * 3 + 1), ...order.slice(n - relegationPlaces).map((t) => t.i * 3 + 2)]
    for (const at of finishes) counts[at]++
    // ponytail: every Fixture × every Zone finish per simulation, about a fifth more run time; tally only Fixtures a page shows if runs get slow.
    for (let fi = 0; fi < fixtures.length; fi++) {
      const sampled = fi * 3 + fixtures[fi].outcome
      samples[sampled]++
      for (const at of finishes) conditionalCounts[sampled * n * 3 + at]++
    }
  }
  return { counts, conditionalCounts, samples }
}

// Adds up the tallies of all the simulations and turns them into the Forecast.
export function finish(input: Input, tallies: Tally[]): Forecast {
  const { settings, start, fixtures } = setup(input)
  const { championsLeaguePlaces, relegationPlaces, simulations } = settings
  const n = start.length
  const sum = (key: keyof Tally) => {
    const total = new Uint32Array(tallies[0][key].length)
    for (const t of tallies) for (let i = 0; i < total.length; i++) total[i] += t[key][i]
    return total
  }
  const [counts, conditionalCounts, samples] = [sum('counts'), sum('conditionalCounts'), sum('samples')]

  // ponytail: Clinched and Eliminated from points bounds alone: sound, but it misses cases that hinge on who plays whom; a max-flow check finds them all.
  // Locked Outcomes count as played, every unlocked Fixture can be won or lost, and a tie on points can go either way.
  const minPoints = start.map((row) => row.points)
  const maxPoints = [...minPoints]
  for (const f of fixtures) {
    const [home, away] = f.lock === 'home' ? [3, 0] : f.lock === 'away' ? [0, 3] : f.lock === 'draw' ? [1, 1] : [0, 0]
    minPoints[f.home.i] += home
    minPoints[f.away.i] += away
    maxPoints[f.home.i] += f.lock ? home : 3
    maxPoints[f.away.i] += f.lock ? away : 3
  }
  const zones: Record<Zone, [number, number]> = { title: [1, 1], championsLeague: [1, championsLeaguePlaces], relegation: [n - relegationPlaces + 1, n] }

  const chancesOf = (finishes: Uint32Array, runs: number) =>
    Object.fromEntries(start.map((row, i) => [row.team.id, { title: finishes[i * 3] / runs, championsLeague: finishes[i * 3 + 1] / runs, relegation: finishes[i * 3 + 2] / runs }]))

  return {
    chances: chancesOf(counts, simulations),
    conditional: Object.fromEntries(
      fixtures.map((f, fi) => [
        f.id,
        Object.fromEntries(
          OUTCOMES.flatMap((outcome, o) => {
            const at = fi * 3 + o
            return samples[at] ? [[outcome, chancesOf(conditionalCounts.subarray(at * n * 3, (at + 1) * n * 3), samples[at])]] : []
          }),
        ),
      ]),
    ),
    status: Object.fromEntries(
      start.map((row, i) => {
        // Final positions this team can still reach: below every team that must outscore it, at best; below every team that can match it, at worst.
        const best = 1 + minPoints.filter((m, j) => j !== i && m > maxPoints[i]).length
        const worst = 1 + maxPoints.filter((m, j) => j !== i && m >= minPoints[i]).length
        const statusIn = ([first, last]: [number, number]): Status => (first <= best && worst <= last ? 'clinched' : worst < first || best > last ? 'eliminated' : 'open')
        return [row.team.id, { title: statusIn(zones.title), championsLeague: statusIn(zones.championsLeague), relegation: statusIn(zones.relegation) }]
      }),
    ),
  }
}

// Fixtures by Swing for one team and Zone, biggest first. Swing is the gap between its Chance under the best and worst
// sampled Outcome. Swings under 1 point are left out, as with Shift arrows, and so is a Locked Fixture, which has none.
// ponytail: each Outcome's Chance has sampling noise of up to ~1.5 points on a rare Outcome, so a Swing near the cutoff may be noise;
// a minimum sample count per Outcome would tighten it.
export function keyFixtures(conditional: Forecast['conditional'], teamId: number, zone: Zone) {
  return Object.entries(conditional)
    .map(([id, outcomes]) => {
      const chances: Partial<Record<Outcome, number>> = Object.fromEntries(Object.entries(outcomes).map(([outcome, c]) => [outcome, c[teamId][zone]]))
      const values = Object.values(chances)
      return { id: Number(id), swing: Math.max(...values) - Math.min(...values), chances }
    })
    .filter((k) => k.swing >= 0.01)
    .toSorted((a, b) => b.swing - a.swing)
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

const OUTCOMES = ['home', 'draw', 'away'] as const satisfies Outcome[]
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
