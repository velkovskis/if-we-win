// The scheduled job's shell: for each League, fetch, call Update, write the Season and any Snapshot due.
// Each League is on its own: if Update throws (e.g. the standings guard), that League writes nothing and keeps its last
// good data, the rest carry on, and the script exits non-zero naming every League that failed. The provider's feeds
// being out of sync only warns, until the League's data is over a day old and the site shows its stale-data banner.
// Usage: FOOTBALL_DATA_API_KEY=... ODDS_API_KEY=... node scripts/update.ts
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import type { OddsResponse } from '../src/ratings.ts'
import { FeedsOutOfSync, update, type LeagueConfig, type Season } from '../src/update.ts'

const key = process.env.FOOTBALL_DATA_API_KEY
if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set')
const oddsKey = process.env.ODDS_API_KEY
if (!oddsKey) throw new Error('ODDS_API_KEY is not set')

const leagues: LeagueConfig[] = JSON.parse(await readFile('config/leagues.json', 'utf8'))
const now = new Date()

// football-data.org's free tier allows 10 requests a minute, so they go out at least 6.5 seconds apart.
// ponytail: Leagues run one after another, about 13 seconds each; fine for six, run them in parallel under one shared limit if it grows.
let lastRequest = 0
async function get(config: LeagueConfig, resource: string) {
  await sleep(Math.max(0, lastRequest + 6_500 - Date.now()))
  lastRequest = Date.now()
  const url = `https://api.football-data.org/v4/competitions/${config.competition ?? config.league}/${resource}?season=${config.season}`
  const res = await fetch(url, { headers: { 'X-Auth-Token': key! } })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

// One credit per fetch (one market, one region). The job runs every 2 hours, so fetching once the League's last fetch
// is over 23 hours old means once a day, about 30 credits a month per League.
async function getOdds(config: LeagueConfig, last: Partial<Season>): Promise<OddsResponse | undefined> {
  const fetchedAt = last.ratings?.oddsFetchedAt
  if (fetchedAt && now.getTime() - Date.parse(fetchedAt) < 23 * 3_600_000) return undefined
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${config.oddsSportKey}/odds?regions=uk&markets=h2h&oddsFormat=decimal&apiKey=${oddsKey}`
    const res = await fetch(url)
    // The URL holds the key, so it stays out of the message.
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const odds = await res.json()
    if (!Array.isArray(odds)) throw new Error('response is not a list of events')
    console.log(`${config.league} Bookmaker odds: ${odds.length} events, ${res.headers.get('x-requests-remaining')} credits left`)
    return odds
  } catch (e) {
    console.warn(`${config.league}: no Bookmaker odds this run, keeping the last good Ratings: ${(e as Error).message}`)
    return undefined
  }
}

async function updateLeague(config: LeagueConfig) {
  const dir = `data/${config.league}`
  const last: Partial<Season> = JSON.parse(await readFile(`${dir}/season.json`, 'utf8').catch(() => '{}'))
  // One file per Snapshot, named by its date, so the last file name is the last Snapshot.
  const snapshots = (await readdir(`${dir}/snapshots`).catch(() => [])).toSorted()
  const lastSnapshot: string | undefined = snapshots.length ? JSON.parse(await readFile(`${dir}/snapshots/${snapshots.at(-1)}`, 'utf8')).date : undefined

  const { season, snapshot } = update({
    matches: await get(config, 'matches'),
    standings: await get(config, 'standings'),
    config,
    now,
    odds: await getOdds(config, last),
    ratings: last.ratings,
    lastSnapshot,
  })
  // The Season first: if the Snapshot then fails to write, the next run finds it still due and tries again.
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}/season.json`, JSON.stringify(season, null, 1) + '\n')
  console.log(`${config.league} updated`)
  if (snapshot) {
    await mkdir(`${dir}/snapshots`, { recursive: true })
    // 'wx' fails rather than rewrite an earlier Snapshot.
    await writeFile(`${dir}/snapshots/${snapshot.date.slice(0, 10)}.json`, JSON.stringify(snapshot, null, 1) + '\n', { flag: 'wx' })
    console.log(`${config.league} Snapshot ${snapshot.date}`)
  }
}

// Over a day old: the same line the site's stale-data banner draws.
async function stale(config: LeagueConfig) {
  const { updatedAt }: Partial<Season> = JSON.parse(await readFile(`data/${config.league}/season.json`, 'utf8').catch(() => '{}'))
  return !updatedAt || now.getTime() - Date.parse(updatedAt) > 24 * 3_600_000
}

const failed: string[] = []
for (const config of leagues) {
  try {
    await updateLeague(config)
  } catch (e) {
    if (e instanceof FeedsOutOfSync && !(await stale(config))) {
      console.warn(`::warning::${config.league} skipped, keeping its last good data: ${e.message}`)
      continue
    }
    // An ::error:: line also shows on the Actions run's summary.
    console.error(`::error::${config.league} failed, keeping its last good data: ${(e as Error).message}`)
    failed.push(config.league)
  }
}
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`)
  process.exitCode = 1
}
