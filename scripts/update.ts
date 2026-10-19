// The scheduled job's shell: fetch, call Update, write the Season.
// If Update throws (e.g. the standings guard), nothing is written and the workflow stops before commit and deploy.
// Usage: FOOTBALL_DATA_API_KEY=... node scripts/update.ts
import { readFile, writeFile } from 'node:fs/promises'
import { update, type Deduction, type SeasonConfig } from '../src/update.ts'

const key = process.env.FOOTBALL_DATA_API_KEY
if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set')

const config: SeasonConfig = JSON.parse(await readFile('config/season.json', 'utf8'))
const deductions: Deduction[] = JSON.parse(await readFile('config/deductions.json', 'utf8'))

async function get(resource: string) {
  const url = `https://api.football-data.org/v4/competitions/${config.league}/${resource}?season=${config.season}`
  const res = await fetch(url, { headers: { 'X-Auth-Token': key! } })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

const season = update({ matches: await get('matches'), standings: await get('standings'), config, deductions, now: new Date() })
await writeFile('data/season.json', JSON.stringify(season, null, 1) + '\n')
