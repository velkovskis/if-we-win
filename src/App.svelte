<script lang="ts">
  import seasonData from '../data/season.json'
  import type { Forecast, forecast, Outcome, Zone } from './forecast.ts'
  import { decode, encode } from './scenario.ts'
  import { table } from './table.ts'
  import type { Fixture, Season } from './update.ts'

  const season: Season = seasonData
  const rows = table(season.teams, season.results, season.deductions)
  const names = new Map(season.teams.map((t) => [t.id, t.name]))
  // Not Map.groupBy: it blanks the page on Safari before 17.4.
  const matchweeks = new Map<number, Fixture[]>()
  for (const f of season.fixtures.toSorted((a, b) => a.matchweek - b.matchweek)) matchweeks.set(f.matchweek, [...(matchweeks.get(f.matchweek) ?? []), f])
  const weeks = [...matchweeks.keys()]
  // Start at the next Matchweek: the first with at least half its matches still to play, so one postponed Fixture doesn't count.
  const played = (week: number) => season.results.filter((r) => r.matchweek === week).length
  let week = $state(weeks.find((w) => matchweeks.get(w)!.length >= played(w)) ?? weeks[0])

  // The link is the only place a Scenario is kept.
  const linked = decode(season, location.hash.slice(1))
  const fromLink = Object.keys(linked).length > 0
  let locks = $state(linked)
  window.onhashchange = () => (locks = decode(season, location.hash.slice(1)))
  $effect(() => {
    const link = encode(season, locks)
    history.replaceState(null, '', link ? `#${link}` : location.pathname + location.search)
  })
  const toggle = (id: number, outcome: Outcome) => {
    if (locks[id] === outcome) delete locks[id]
    else locks[id] = outcome
  }

  // The worker's first answer is always the Baseline; a Scenario from a link queues its own run behind it.
  let baseline = $state<Forecast>()
  let scenario = $state<Forecast>()
  // One run at a time; clicks made meanwhile collapse into one run with the latest Locks.
  let running = false
  let next: Parameters<typeof forecast>[0] | undefined
  const worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' })
  const run = (input: Parameters<typeof forecast>[0]) => {
    if (running) return void (next = input)
    running = true
    worker.postMessage(input)
  }
  worker.onmessage = (e: MessageEvent<Forecast>) => {
    if (baseline || !fromLink) scenario = e.data
    baseline ??= e.data
    running = false
    if (next) run(next)
    next = undefined
  }
  // Same seed every run and in every browser, so teams a Lock doesn't affect show no Shift and a shared link shows the same Chances.
  // ponytail: Math.exp/log/cos may differ in the last bit between browser engines, so a rare draw can differ; port them in-house if Chances ever disagree across browsers.
  const input = (locks: Record<number, Outcome>): Parameters<typeof forecast>[0] => ({
    season,
    ratings: season.ratings.teams,
    homeAdvantage: season.ratings.homeAdvantage,
    locks,
    seed: 1,
    settings: { championsLeaguePlaces: season.championsLeaguePlaces },
  })
  if (fromLink) run(input({}))
  $effect(() => run(input($state.snapshot(locks))))
  // Whole percentages; 0% and 100% only when a badge proves them, because a simulation can't.
  const percent = (id: number, zone: Zone) => {
    if (!scenario) return '…'
    const status = scenario.status[id][zone]
    if (status !== 'open') return status === 'clinched' ? '100%' : '0%'
    const p = Math.round(scenario.chances[id][zone] * 100)
    return p === 0 ? '<1%' : p === 100 ? '>99%' : `${p}%`
  }
  // Scenario minus Baseline in whole points; 0 when under 1 point, which hides the arrow.
  const shift = (id: number, zone: Zone) => {
    if (!scenario || !baseline) return 0
    const change = scenario.chances[id][zone] - baseline.chances[id][zone]
    return Math.abs(change) < 0.01 ? 0 : Math.round(change * 100)
  }
  const BADGES: Record<Zone, { clinched: string; eliminated: string }> = {
    title: { clinched: 'Title won', eliminated: 'Eliminated' },
    championsLeague: { clinched: 'Qualified', eliminated: 'Eliminated' },
    relegation: { clinched: 'Relegated', eliminated: 'Safe' },
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

<main class="mx-auto max-w-2xl p-4 lg:max-w-5xl">
  <h1 class="text-2xl font-bold">If We Win</h1>
  <p class="text-sm text-gray-600">{season.leagueName} {season.season}–{String(season.season + 1).slice(2)} · Updated {ago}</p>

  {#if age > 24 * HOUR}
    <p role="alert" class="mt-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
      This data is more than a day old, so recent Results may be missing.
    </p>
  {/if}

  <!-- Phone: Fixtures above the table. Wide screens: beside it, staying in view, so a Lock and its Shifts are seen together. -->
  <div class="mt-4 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
    <section class="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
      <div class="flex items-center justify-between">
        <button class="rounded px-2 text-lg disabled:invisible" aria-label="Previous Matchweek" disabled={week === weeks[0]} onclick={() => (week = weeks[weeks.indexOf(week) - 1])}>‹</button>
        <h2 class="font-bold">Matchweek {week}</h2>
        <button class="rounded px-2 text-lg disabled:invisible" aria-label="Next Matchweek" disabled={week === weeks.at(-1)} onclick={() => (week = weeks[weeks.indexOf(week) + 1])}>›</button>
      </div>
      <ul class="mt-2">
        {#each matchweeks.get(week) ?? [] as f (f.id)}
          <li class="grid grid-cols-[1fr_auto_1fr] gap-1 py-0.5 text-sm">
            {#each [['home', names.get(f.homeTeamId)], ['draw', 'Draw'], ['away', names.get(f.awayTeamId)]] as const as [outcome, label] (outcome)}
              <button
                class={['rounded border px-2 py-1', outcome === 'home' ? 'text-left' : outcome === 'away' ? 'text-right' : '', locks[f.id] === outcome ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200']}
                aria-pressed={locks[f.id] === outcome}
                onclick={() => toggle(f.id, outcome)}>{label}</button
              >
            {/each}
          </li>
        {/each}
      </ul>
      {#if Object.keys(locks).length}
        {@const count = Object.keys(locks).length}
        <p class="mt-2 flex justify-between text-sm text-gray-600">
          {count} {count === 1 ? 'Lock' : 'Locks'}
          <button class="underline" onclick={() => (locks = {})}>Clear all Locks</button>
        </p>
      {/if}
    </section>

    <table class="w-full text-sm tabular-nums lg:col-start-1 lg:row-start-1">
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
            {#each ['title', 'championsLeague', 'relegation'] as const as zone (zone)}
              {@const status = scenario?.status[row.team.id][zone]}
              {@const points = shift(row.team.id, zone)}
              <td class="px-1 text-right last:pr-0">
                {percent(row.team.id, zone)}
                {#if points}
                  <!-- Green when the Shift is good news for the team: up for Title and CL, down for Relegation. -->
                  <span class={['block text-xs', points > 0 === (zone !== 'relegation') ? 'text-green-700' : 'text-red-700']}>
                    {points > 0 ? '▲' : '▼'}{Math.abs(points)}
                  </span>
                {/if}
                {#if status && status !== 'open'}
                  <span class="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{BADGES[zone][status]}</span>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>


  <footer class="mt-6 text-xs text-gray-500">
    <a class="underline" href="https://www.football-data.org/">Football data provided by the Football-Data.org API</a>
  </footer>
</main>
