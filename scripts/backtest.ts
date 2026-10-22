// Backtest: scores the Forecast on past Premier League seasons against the Benchmark, for each strength noise and
// home advantage tried, to choose the ones in the Forecast's DEFAULT_SETTINGS. Run before a season, not by the site.
// football-data.co.uk's Results and closing Bookmaker odds are downloaded on each run, and neither they nor the
// scores are written anywhere: the repo is public.
// Usage: node scripts/backtest.ts
import { availableParallelism } from 'node:os'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { forecast, SEED, type Chances } from '../src/forecast.ts'
import { rate, type OddsResponse, type Ratings } from '../src/ratings.ts'

// 2020-21 is left out: played without crowds, it had almost no home advantage.
const SEASONS = ['2122', '2223', '2324', '2425', '2526']
const STRENGTH_NOISES = [0, 0.1, 0.2, 0.3, 0.4]
const HOME_ADVANTAGES = [0.1, 0.15, 0.2, 0.25, 0.3]
// ponytail: a tenth of the site's simulations keeps a sweep to minutes; raise it to check a close call between two settings.
const SIMULATIONS = 2_000
// Every season is scored on four Champions League places, though 2024-25 had five; the model and the Benchmark share the Zone.
const CHAMPIONS_LEAGUE_PLACES = 4
// Each season's Deductions in total, by football-data.co.uk team name. Applied from the first weekly point, a small head start for both.
const DEDUCTIONS: Record<string, Record<string, number>> = { '2324': { Everton: 8, "Nott'm Forest": 4 } }
const WEEK = 7 * 86_400_000

type Match = { home: string; away: string; kickoff: number; scoreline: { home: number; away: number }; odds: number[] } // closing Bookmaker odds: home, draw, away
type Job = { season: string; matches: Match[]; strengthNoise: number; homeAdvantage: number }

// Brier scores, the model's and the Benchmark's, averaged over the season's weekly points.
function score({ season, matches, strengthNoise, homeAdvantage }: Job) {
  const names = [...new Set(matches.map((m) => m.home))].toSorted()
  const teams = names.map((name, id) => ({ id, name, crest: '' }))
  const deductions = Object.entries(DEDUCTIONS[season] ?? {}).map(([name, points]) => {
    if (!names.includes(name)) throw new Error(`Deduction for ${name}, not a team in ${season}`)
    return { teamId: names.indexOf(name), points }
  })
  // Every match as a Result; at each weekly point, the ones yet to kick off become Fixtures.
  const all = matches.map((m, id) => ({ id, matchweek: 0, homeTeamId: names.indexOf(m.home), awayTeamId: names.indexOf(m.away), kickoff: new Date(m.kickoff).toISOString(), scoreline: m.scoreline }))
  const equal = Object.fromEntries(teams.map((t) => [t.id, 0]))
  const chances = (before: number, ratings: Record<number, number>, simulations = SIMULATIONS) =>
    forecast({
      season: { teams, results: all.filter((_, i) => matches[i].kickoff < before), fixtures: all.filter((_, i) => matches[i].kickoff >= before), deductions },
      ratings,
      locks: {},
      seed: SEED,
      settings: { championsLeaguePlaces: CHAMPIONS_LEAGUE_PLACES, simulations, strengthNoise, homeAdvantage },
    }).chances
  const final = chances(Infinity, equal, 1)
  const brier = (c: Record<number, Chances>) =>
    teams.reduce((sum, t) => sum + (['title', 'championsLeague', 'relegation'] as const).reduce((s, z) => s + (c[t.id][z] - final[t.id][z]) ** 2, 0), 0) / (teams.length * 3)

  // Weekly points at Tuesday 06:00 UTC, when Snapshots are taken, from the one before the first kick-off.
  const first = new Date(Math.min(...matches.map((m) => m.kickoff)))
  first.setUTCHours(6, 0, 0, 0)
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 5) % 7))
  const last = Math.max(...matches.map((m) => m.kickoff))
  // Each week's Ratings start from the last week's, fitted to the coming week's closing Bookmaker odds, with the live
  // site's fit. Close to, not exactly, the live site, which fits daily to whatever Fixtures The Odds API lists and
  // carries Ratings over between seasons; here each season starts from equal Ratings.
  // ponytail: averaged closing odds normalised once, where the live fit normalises each bookmaker; the margin removed barely differs.
  let ratings: Ratings | undefined
  const model: number[] = []
  const benchmark: number[] = []
  for (let point = first.getTime(); point <= last; point += WEEK) {
    const odds: OddsResponse = matches
      .filter((m) => m.kickoff >= point && m.kickoff < point + WEEK)
      .map((m) => ({
        commence_time: new Date(m.kickoff).toISOString(),
        home_team: m.home,
        away_team: m.away,
        bookmakers: [{ markets: [{ key: 'h2h', outcomes: [m.home, 'Draw', m.away].map((name, i) => ({ name, price: m.odds[i] })) }] }],
      }))
    ratings = rate({ odds, last: ratings, teams, now: new Date(point), homeAdvantage })
    model.push(brier(chances(point, ratings.teams)))
    benchmark.push(brier(chances(point, equal)))
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return { model: mean(model), benchmark: mean(benchmark) }
}

async function download(season: string): Promise<Match[]> {
  const url = `https://football-data.co.uk/mmz4281/${season}/E0.csv`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const [header, ...rows] = (await res.text()).replace(/^﻿/, '').trim().split(/\r?\n/).map((line) => line.split(','))
  const column = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`${url} has no ${name} column`)
    return i
  }
  const [date, time, home, away, homeGoals, awayGoals, ...odds] = ['Date', 'Time', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'AvgCH', 'AvgCD', 'AvgCA'].map(column)
  const matches = rows
    .filter((r) => r[home])
    .map((r) => {
      const [d, m, y] = r[date].split('/')
      // ponytail: UK kick-off times read as UTC, an hour out in summer; no weekly point falls that close to a kick-off.
      return { home: r[home], away: r[away], kickoff: Date.parse(`${y}-${m}-${d}T${r[time]}:00Z`), scoreline: { home: Number(r[homeGoals]), away: Number(r[awayGoals]) }, odds: odds.map((i) => Number(r[i])) }
    })
  if (matches.length !== 380 || matches.some((m) => Number.isNaN(m.kickoff) || m.odds.some((p) => !(p > 1)))) throw new Error(`${url}: expected 380 complete matches`)
  return matches
}

if (isMainThread) {
  const seasons = Object.fromEntries(await Promise.all(SEASONS.map(async (s) => [s, await download(s)] as const)))
  const settings = STRENGTH_NOISES.flatMap((strengthNoise) => HOME_ADVANTAGES.map((homeAdvantage) => ({ strengthNoise, homeAdvantage })))
  const jobs: Job[] = settings.flatMap((s) => SEASONS.map((season) => ({ season, matches: seasons[season], ...s })))

  // One worker per core, each scoring one season for one setting at a time.
  const scores: ReturnType<typeof score>[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: availableParallelism() }, async () => {
      while (next < jobs.length) {
        const i = next++
        scores[i] = await new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: jobs[i] })
          worker.once('message', resolve)
          worker.once('error', reject)
        })
        process.stderr.write(`\r${scores.filter(Boolean).length}/${jobs.length}`)
      }
    }),
  )
  process.stderr.write('\n')

  const four = (x: number) => x.toFixed(4)
  const rows = settings.map((s, i) => {
    const perSeason = scores.slice(i * SEASONS.length, (i + 1) * SEASONS.length)
    const overall = (key: 'model' | 'benchmark') => perSeason.reduce((sum, p) => sum + p[key], 0) / perSeason.length
    return {
      'strength noise': s.strengthNoise,
      'home advantage': s.homeAdvantage,
      model: overall('model'),
      overall: `${four(overall('model'))} / ${four(overall('benchmark'))}`,
      ...Object.fromEntries(SEASONS.map((season, j) => [`${season.slice(0, 2)}-${season.slice(2)}`, `${four(perSeason[j].model)} / ${four(perSeason[j].benchmark)}`])),
    }
  })
  console.log(`Brier scores, model / Benchmark (lower is better), averaged over weekly points, ${SIMULATIONS} simulations each:`)
  console.table(rows.toSorted((a, b) => a.model - b.model).map(({ model, ...row }) => row))
} else {
  parentPort!.postMessage(score(workerData))
}
