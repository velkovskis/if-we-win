<script lang="ts">
  import seasonData from '../data/season.json'
  import type { Chances, forecast } from './forecast.ts'
  import { table } from './table.ts'
  import type { Season } from './update.ts'

  const season: Season = seasonData
  const rows = table(season.teams, season.results, season.deductions)
  let chances = $state<Record<number, Chances>>()
  const worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Record<number, Chances>>) => (chances = e.data)
  const input: Parameters<typeof forecast>[0] = {
    season,
    ratings: season.ratings.teams,
    homeAdvantage: season.ratings.homeAdvantage,
    locks: {},
    seed: 1,
    settings: { championsLeaguePlaces: season.championsLeaguePlaces },
  }
  worker.postMessage(input)
  // Whole percentages; never 0% or 100%, because a simulation can't prove certainty.
  const percent = (chance?: number) => {
    if (chance === undefined) return '…'
    const p = Math.round(chance * 100)
    return p === 0 ? '<1%' : p === 100 ? '>99%' : `${p}%`
  }
  const updatedAt = Date.parse(season.updatedAt)
  const HOUR = 3_600_000

  let now = $state(Date.now())
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(timer)
  })

  const age = $derived(now - updatedAt)
  const ago = $derived.by(() => {
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    if (age < HOUR) return format.format(-Math.floor(age / 60_000), 'minute')
    if (age < 48 * HOUR) return format.format(-Math.floor(age / HOUR), 'hour')
    return format.format(-Math.floor(age / (24 * HOUR)), 'day')
  })
</script>

<main class="mx-auto max-w-2xl p-4">
  <h1 class="text-2xl font-bold">If We Win</h1>
  <p class="text-sm text-gray-600">{season.leagueName} {season.season}–{String(season.season + 1).slice(2)} · Updated {ago}</p>

  {#if age > 24 * HOUR}
    <p role="alert" class="mt-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
      This data is more than a day old, so recent Results may be missing.
    </p>
  {/if}

  <table class="mt-4 w-full text-sm tabular-nums">
    <thead class="border-b text-left text-gray-600">
      <tr>
        <th class="py-1 pr-2">#</th>
        <th class="py-1">Team</th>
        <th class="px-1 text-right">P</th>
        <th class="hidden px-1 text-right sm:table-cell">W</th>
        <th class="hidden px-1 text-right sm:table-cell">D</th>
        <th class="hidden px-1 text-right sm:table-cell">L</th>
        <th class="px-1 text-right">GD</th>
        <th class="px-1 text-right">Pts</th>
        <th class="px-1 text-right">Title</th>
        <th class="px-1 text-right"><abbr title="Champions League places">CL</abbr></th>
        <th class="pl-1 text-right"><abbr title="Relegation">Rel</abbr></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i (row.team.id)}
        <tr class="border-b border-gray-100">
          <td class="py-1 pr-2">{i + 1}</td>
          <td class="py-1">
            <span class="flex items-center gap-2">
              <img src={row.team.crest} alt="" class="size-5" />
              {row.team.name}
            </span>
          </td>
          <td class="px-1 text-right">{row.played}</td>
          <td class="hidden px-1 text-right sm:table-cell">{row.won}</td>
          <td class="hidden px-1 text-right sm:table-cell">{row.drawn}</td>
          <td class="hidden px-1 text-right sm:table-cell">{row.lost}</td>
          <td class="px-1 text-right">{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
          <td class="px-1 text-right font-semibold">{row.points}</td>
          <td class="px-1 text-right">{percent(chances?.[row.team.id].title)}</td>
          <td class="px-1 text-right">{percent(chances?.[row.team.id].championsLeague)}</td>
          <td class="pl-1 text-right">{percent(chances?.[row.team.id].relegation)}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <footer class="mt-6 text-xs text-gray-500">
    <a class="underline" href="https://www.football-data.org/">Football data provided by the Football-Data.org API</a>
  </footer>
</main>
