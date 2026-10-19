import { describe, expect, it } from 'vitest'
import { forecast, keyFixtures, type Outcome } from './forecast.ts'
import type { Deduction, Fixture, Result } from './update.ts'

const team = (id: number) => ({ id, name: `T${id}`, crest: '' })
const fixture = (homeTeamId: number, awayTeamId: number): Fixture => ({ id: homeTeamId * 100 + awayTeamId, matchweek: 1, homeTeamId, awayTeamId })
const result = (homeTeamId: number, awayTeamId: number, home: number, away: number): Result => ({ ...fixture(homeTeamId, awayTeamId), scoreline: { home, away } })
const equal = (ids: number[]) => Object.fromEntries(ids.map((id) => [id, 0]))

// Every pair plays once; the lower id always wins at home, so the final points are 9, 6, 3, 0.
const IDS = [1, 2, 3, 4]
const FIXTURES = [fixture(1, 2), fixture(1, 3), fixture(1, 4), fixture(2, 3), fixture(2, 4), fixture(3, 4)]
const HOME_WINS: Record<number, Outcome> = Object.fromEntries(FIXTURES.map((f) => [f.id, 'home']))

type Opts = { results?: Result[]; fixtures?: Fixture[]; locks?: Record<number, Outcome>; deductions?: Deduction[]; seed?: number; simulations?: number }
const forecastOf = (opts: Opts = {}) =>
  forecast({
    season: { teams: IDS.map(team), results: opts.results ?? [], fixtures: opts.fixtures ?? FIXTURES, deductions: opts.deductions ?? [] },
    ratings: equal(IDS),
    homeAdvantage: 0.25,
    locks: opts.locks ?? {},
    seed: opts.seed ?? 1,
    settings: { simulations: opts.simulations ?? 2_000, championsLeaguePlaces: 2, relegationPlaces: 1 },
  })
const run = (opts?: Opts) => forecastOf(opts).chances
const status = (opts?: Opts) => forecastOf(opts).status

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

  it('leaves a runaway leader alone when a Lock is between two bottom-half teams', () => {
    // A 20-team double round robin halfway through: team 1 beat teams 2–13 and drew the rest; every other match was a draw,
    // so teams 2–13 (18 points) are the bottom half, below teams 14–20 (19 points).
    const ids = Array.from({ length: 20 }, (_, i) => i + 1)
    const all = ids.flatMap((h) => ids.filter((a) => a !== h).map((a) => fixture(h, a)))
    const firstHalf = all.filter((f) => f.homeTeamId < f.awayTeamId)
    const results = firstHalf.map((f) => ({ ...f, scoreline: f.homeTeamId === 1 && f.awayTeamId <= 13 ? { home: 2, away: 0 } : { home: 1, away: 1 } }))
    const fixtures = all.filter((f) => f.homeTeamId > f.awayTeamId)
    const title = (locks: Record<number, Outcome>) =>
      forecast({
        season: { teams: ids.map(team), results, fixtures, deductions: [] },
        ratings: equal(ids),
        homeAdvantage: 0.25,
        locks,
        seed: 1,
        settings: { championsLeaguePlaces: 4 },
      }).chances[1].title
    const baseline = title({})
    // About 85%: not settled, so a Lock could move it.
    expect(baseline).toBeGreaterThan(0.7)
    expect(baseline).toBeLessThan(0.95)
    expect(Math.abs(title({ [fixture(13, 12).id]: 'home' }) - baseline)).toBeLessThan(0.01)
  })

  describe('Conditional Chances', () => {
    const OUTCOMES = ['home', 'draw', 'away'] as const

    it('agree with running the Forecast with that Outcome Locked', () => {
      const { conditional } = forecastOf({ simulations: 20_000 })
      for (const f of [FIXTURES[0], FIXTURES[5]])
        for (const outcome of OUTCOMES) {
          const locked = run({ locks: { [f.id]: outcome }, simulations: 20_000 })
          // ±0.03 is about 4 standard errors for an Outcome sampled in a quarter of 20,000 simulations.
          for (const id of IDS)
            for (const zone of ['title', 'championsLeague', 'relegation'] as const) expect(Math.abs(conditional[f.id][outcome]![id][zone] - locked[id][zone])).toBeLessThan(0.03)
        }
    })

    it('leave out Outcomes a Lock rules out', () => {
      const { conditional } = forecastOf({ locks: { [FIXTURES[0].id]: 'draw' } })
      expect(Object.keys(conditional[FIXTURES[0].id])).toEqual(['draw'])
    })
  })

  describe('Key fixtures', () => {
    it('ranks Fixtures by Swing, including ones My team does not play in, and leaves out Locked ones', () => {
      const { conditional } = forecastOf({ locks: { [FIXTURES[0].id]: 'home' }, simulations: 20_000 })
      const key = keyFixtures(conditional, 1, 'title')
      expect(key.map((k) => k.id)).not.toContain(FIXTURES[0].id)
      expect(key.some((k) => FIXTURES.some((f) => f.id === k.id && f.homeTeamId !== 1 && f.awayTeamId !== 1))).toBe(true)
      expect(key.map((k) => k.swing)).toEqual(key.map((k) => k.swing).toSorted((a, b) => b - a))
      const title = Object.values(conditional[key[0].id]).map((chances) => chances![1].title)
      expect(Object.values(key[0].chances)).toEqual(title)
      expect(key[0].swing).toBe(Math.max(...title) - Math.min(...title))
    })
  })

  describe('Clinched and Eliminated', () => {
    it('settles every Zone when every Fixture is Locked', () => {
      expect(status({ locks: HOME_WINS })).toEqual({
        1: { title: 'clinched', championsLeague: 'clinched', relegation: 'eliminated' },
        2: { title: 'eliminated', championsLeague: 'clinched', relegation: 'eliminated' },
        3: { title: 'eliminated', championsLeague: 'eliminated', relegation: 'eliminated' },
        4: { title: 'eliminated', championsLeague: 'eliminated', relegation: 'clinched' },
      })
    })

    // One Fixture left and nobody has a point yet.
    const only = fixture(3, 4)

    it('leaves every Zone open while the last Fixture can still go either way', () => {
      for (const zones of Object.values(status({ fixtures: [only] }))) expect(zones).toEqual({ title: 'open', championsLeague: 'open', relegation: 'open' })
    })

    it('settles the Title when a Lock decides it', () => {
      const zones = status({ fixtures: [only], locks: { [only.id]: 'home' } })
      expect(zones[3].title).toBe('clinched')
      for (const id of [1, 2, 4]) expect(zones[id].title).toBe('eliminated')
      // 4 is level with 1 and 2 on 0 points, so the tie-break still decides Relegation.
      for (const id of [1, 2, 4]) expect(zones[id].relegation).toBe('open')
    })

    it('leaves a tie on points open', () => {
      const zones = status({ fixtures: [only], locks: { [only.id]: 'draw' } })
      expect(zones[3]).toEqual({ title: 'open', championsLeague: 'clinched', relegation: 'eliminated' })
      expect(zones[1]).toEqual({ title: 'eliminated', championsLeague: 'eliminated', relegation: 'open' })
    })

    it('takes Deductions off', () => {
      // 4 can reach 3 - 4 = -1 at most, below 1 and 2 on 0.
      expect(status({ fixtures: [only], deductions: [{ teamId: 4, points: 4 }] })[4].relegation).toBe('clinched')
      expect(status({ fixtures: [only], deductions: [{ teamId: 4, points: 3 }] })[4].relegation).toBe('open')
    })

    it('never contradicts a simulation', () => {
      // Random half-played seasons of 6 teams with random Locks and Deductions.
      let s = 1
      const random = () => ((s = (Math.imul(s, 48271) >>> 0) % 2147483647) / 2147483647)
      const pick = (k: number) => Math.floor(random() * k)
      const ids = [1, 2, 3, 4, 5, 6]
      const badges = { clinched: 0, eliminated: 0 }
      for (let league = 0; league < 200; league++) {
        const all = ids.flatMap((h) => ids.filter((a) => a !== h).map((a) => fixture(h, a)))
        const played = random()
        const results = all.filter(() => random() < played).map((f) => ({ ...f, scoreline: { home: pick(4), away: pick(4) } }))
        const fixtures = all.filter((f) => !results.some((r) => r.id === f.id))
        const locks = Object.fromEntries(fixtures.filter(() => random() < 0.5).map((f) => [f.id, (['home', 'draw', 'away'] as const)[pick(3)]]))
        const deductions = random() < 0.3 ? [{ teamId: 1 + pick(6), points: 1 + pick(10) }] : []
        const { chances, status: zones } = forecast({
          season: { teams: ids.map(team), results, fixtures, deductions },
          ratings: equal(ids),
          homeAdvantage: 0.25,
          locks,
          seed: league,
          settings: { simulations: 200, championsLeaguePlaces: 2, relegationPlaces: 2 },
        })
        for (const id of ids)
          for (const zone of ['title', 'championsLeague', 'relegation'] as const) {
            const badge = zones[id][zone]
            if (badge === 'clinched') expect(chances[id][zone]).toBe(1)
            if (badge === 'eliminated') expect(chances[id][zone]).toBe(0)
            if (badge !== 'open') badges[badge]++
          }
      }
      // The check isn't vacuous: plenty of badges were tested.
      expect(badges.clinched).toBeGreaterThan(100)
      expect(badges.eliminated).toBeGreaterThan(100)
    })
  })
})
