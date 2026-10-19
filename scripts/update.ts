// The scheduled job's shell: fetch, call Update, write the Season and any Snapshot due.
// If Update throws (e.g. the standings guard), nothing is written and the workflow stops before commit and deploy.
// Usage: FOOTBALL_DATA_API_KEY=... ODDS_API_KEY=... node scripts/update.ts
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import type { OddsResponse } from '../src/ratings.ts'
import { update, type Deduction, type Season, type SeasonConfig } from '../src/update.ts'

const key = process.env.FOOTBALL_DATA_API_KEY
if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set')
const oddsKey = process.env.ODDS_API_KEY
if (!oddsKey) throw new Error('ODDS_API_KEY is not set')

const config: SeasonConfig = JSON.parse(await readFile('config/season.json', 'utf8'))
const deductions: Deduction[] = JSON.parse(await readFile('config/deductions.json', 'utf8'))
const last: Partial<Season> = JSON.parse(await readFile('data/season.json', 'utf8').catch(() => '{}'))
const now = new Date()
// One file per Snapshot, named by its date, so the last file name is the last Snapshot.
const snapshots = (await readdir('data/snapshots').catch(() => [])).toSorted()
const lastSnapshot: string | undefined = snapshots.length ? JSON.parse(await readFile(`data/snapshots/${snapshots.at(-1)}`, 'utf8')).date : undefined

async function get(resource: string) {
  const url = `https://api.football-data.org/v4/competitions/${config.league}/${resource}?season=${config.season}`
  const res = await fetch(url, { headers: { 'X-Auth-Token': key! } })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

// One credit per fetch (one market, one region). The job runs every 2 hours, so fetching once the last fetch
// is over 23 hours old means once a day, about 30 credits a month.
async function getOdds(): Promise<OddsResponse | undefined> {
  const fetchedAt = last.ratings?.oddsFetchedAt
  if (fetchedAt && now.getTime() - Date.parse(fetchedAt) < 23 * 3_600_000) return undefined
  try {
    const url = `https://api.the-odds-api.com/v4/sports/soccer_epl/odds?regions=uk&markets=h2h&oddsFormat=decimal&apiKey=${oddsKey}`
    const res = await fetch(url)
    // The URL holds the key, so it stays out of the message.
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const odds = await res.json()
    if (!Array.isArray(odds)) throw new Error('response is not a list of events')
    console.log(`Bookmaker odds: ${odds.length} events, ${res.headers.get('x-requests-remaining')} credits left`)
    return odds
  } catch (e) {
    console.warn(`No Bookmaker odds this run, keeping the last good Ratings: ${(e as Error).message}`)
    return undefined
  }
}

const { season, snapshot } = update({
  matches: await get('matches'),
  standings: await get('standings'),
  config,
  deductions,
  now,
  odds: await getOdds(),
  ratings: last.ratings,
  lastSnapshot,
})
if (snapshot) {
  await mkdir('data/snapshots', { recursive: true })
  // 'wx' fails rather than rewrite an earlier Snapshot.
  await writeFile(`data/snapshots/${snapshot.date.slice(0, 10)}.json`, JSON.stringify(snapshot, null, 1) + '\n', { flag: 'wx' })
  console.log(`Snapshot ${snapshot.date}`)
}
await writeFile('data/season.json', JSON.stringify(season, null, 1) + '\n')
