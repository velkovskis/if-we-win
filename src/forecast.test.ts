import { describe, expect, it } from 'vitest'
import { forecast, type Outcome } from './forecast.ts'
import type { Deduction, Fixture, Result } from './update.ts'

const team = (id: number) => ({ id, name: `T${id}`, crest: '' })
const fixture = (homeTeamId: number, awayTeamId: number): Fixture => ({ id: homeTeamId * 100 + awayTeamId, matchweek: 1, homeTeamId, awayTeamId })
const result = (homeTeamId: number, awayTeamId: number, home: number, away: number): Result => ({ ...fixture(homeTeamId, awayTeamId), scoreline: { home, away } })
const equal = (ids: number[]) => Object.fromEntries(ids.map((id) => [id, 0]))

// Every pair plays once; the lower id always wins at home, so the final points are 9, 6, 3, 0.
const IDS = [1, 2, 3, 4]
const FIXTURES = [fixture(1, 2), fixture(1, 3), fixture(1, 4), fixture(2, 3), fixture(2, 4), fixture(3, 4)]
const HOME_WINS: Record<number, Outcome> = Object.fromEntries(FIXTURES.map((f) => [f.id, 'home']))

const run = (opts: { results?: Result[]; fixtures?: Fixture[]; locks?: Record<number, Outcome>; deductions?: Deduction[]; seed?: number; simulations?: number } = {}) =>
  forecast({
    season: { teams: IDS.map(team), results: opts.results ?? [], fixtures: opts.fixtures ?? FIXTURES, deductions: opts.deductions ?? [] },
    ratings: equal(IDS),
    homeAdvantage: 0.25,
    locks: opts.locks ?? {},
    seed: opts.seed ?? 1,
    settings: { simulations: opts.simulations ?? 2_000, championsLeaguePlaces: 2, relegationPlaces: 1 },
  })

describe('forecast', () => {
  it('gives Chances of exactly 0 or 1 when every Fixture is Locked', () => {
    expect(run({ locks: HOME_WINS })).toEqual({
      1: { title: 1, championsLeague: 1, relegation: 0 },
      2: { title: 0, championsLeague: 1, relegation: 0 },
      3: { title: 0, championsLeague: 0, relegation: 0 },
      4: { title: 0, championsLeague: 0, relegation: 1 },
    })
  })

  it('takes Deductions off the final points', () => {
    // Team 2 falls from 6 to 2 points, below team 3 (3) and above team 4 (0).
    const chances = run({ locks: HOME_WINS, deductions: [{ teamId: 2, points: 4 }] })
    expect(chances[2]).toEqual({ title: 0, championsLeague: 0, relegation: 0 })
    expect(chances[3]).toEqual({ title: 0, championsLeague: 1, relegation: 0 })
  })

  it('counts a Locked home win as a home win in every simulation', () => {
    // One Fixture left: whoever wins it takes the Title.
    const only = fixture(3, 4)
    const open = run({ fixtures: [only] })
    expect(open[3].title).toBeGreaterThan(0.2)
    expect(open[3].title).toBeLessThan(0.8)
    expect(run({ fixtures: [only], locks: { [only.id]: 'home' } })[3].title).toBe(1)
    expect(run({ fixtures: [only], locks: { [only.id]: 'away' } })[4].title).toBe(1)
  })

  describe('settles ties like the Premier League', () => {
    // No Fixtures left, so each Chance is 0 or 1 unless the tie goes to the coin flip.
    const settled = (results: Result[]) => run({ results, fixtures: [] })

    it('by goal difference, then goals scored', () => {
      // 3, 1 and 4 are level on 3 points: 3 and 1 on +2, split by goals scored; 4 on -1.
      const chances = settled([result(1, 2, 2, 0), result(3, 4, 3, 1), result(4, 2, 1, 0)])
      expect(chances[3]).toMatchObject({ title: 1, championsLeague: 1 })
      expect(chances[1]).toMatchObject({ title: 0, championsLeague: 1 })
      expect(chances[4]).toMatchObject({ championsLeague: 0 })
    })

    it('then head-to-head points', () => {
      // 2 and 1 are level on 3 points, 0 goal difference and 1 scored; 2 beat 1.
      const chances = settled([result(2, 1, 1, 0), result(1, 4, 1, 0), result(3, 2, 1, 0)])
      expect(chances[2].championsLeague).toBe(1)
      expect(chances[1].championsLeague).toBe(0)
    })

    it('then head-to-head away goals', () => {
      // Level on everything else; 2 scored 2 away at 1, 1 scored 1 away at 2.
      const chances = settled([result(1, 2, 2, 2), result(2, 1, 1, 1)])
      expect(chances[2].title).toBe(1)
      expect(chances[1].title).toBe(0)
    })

    it('then a coin flip', () => {
      // 1 and 2 are level on everything at the top; 3 and 4 have played nothing at the bottom.
      const chances = run({ results: [result(1, 2, 1, 1), result(2, 1, 1, 1)], fixtures: [], simulations: 20_000 })
      // ±0.02 is about 6 standard errors at 20,000 simulations.
      for (const id of [1, 2]) expect(Math.abs(chances[id].title - 0.5)).toBeLessThan(0.02)
      for (const id of [3, 4]) expect(Math.abs(chances[id].relegation - 0.5)).toBeLessThan(0.02)
    })
  })

  it('gives identical Chances for the same inputs and seed', () => {
    expect(run({ seed: 7 })).toEqual(run({ seed: 7 }))
    expect(run({ seed: 7 })).not.toEqual(run({ seed: 8 }))
  })

  it('draws by Fixture id, not by the order Fixtures are listed in', () => {
    expect(run({ fixtures: [...FIXTURES].reverse() })).toEqual(run())
  })

  it('gives every team roughly equal Chances in a symmetric league with equal Ratings', () => {
    // Every pair plays home and away, so no team is favoured by the schedule.
    const fixtures = IDS.flatMap((h) => IDS.filter((a) => a !== h).map((a) => fixture(h, a)))
    const chances = run({ fixtures, simulations: 20_000 })
    // ±0.02 is about 6 standard errors at 20,000 simulations.
    for (const id of IDS) {
      expect(Math.abs(chances[id].title - 0.25)).toBeLessThan(0.02)
      expect(Math.abs(chances[id].championsLeague - 0.5)).toBeLessThan(0.02)
      expect(Math.abs(chances[id].relegation - 0.25)).toBeLessThan(0.02)
    }
  })
})
