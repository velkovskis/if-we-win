<script lang="ts">
  import seasonData from '../data/season.json'
  import { DEFAULT_SETTINGS, keyFixtures, SEED, type Forecast, type forecast, type Outcome, type Zone } from './forecast.ts'
  import { decode, encode } from './scenario.ts'
  import { table } from './table.ts'
  import type { Fixture, Season } from './update.ts'

  const season: Season = seasonData
  const rows = table(season.teams, season.results, season.deductions)
  const names = new Map(season.teams.map((t) => [t.id, t.name]))
  const fixtures = new Map(season.fixtures.map((f) => [f.id, f]))
  // Not Map.groupBy: it blanks the page on Safari before 17.4.
  const matchweeks = new Map<number, Fixture[]>()
  for (const f of season.fixtures.toSorted((a, b) => a.matchweek - b.matchweek)) matchweeks.set(f.matchweek, [...(matchweeks.get(f.matchweek) ?? []), f])
  const weeks = [...matchweeks.keys()]
  // Start at the next Matchweek: the first with at least half its matches still to play, so one postponed Fixture doesn't count.
  const played = (week: number) => season.results.filter((r) => r.matchweek === week).length
  let week = $state(weeks.find((w) => matchweeks.get(w)!.length >= played(w)) ?? weeks[0])

  // The link is the only place a Scenario is kept. My team is kept there too, and in this browser as a convenience; the link wins.
  const linked = decode(season, location.hash.slice(1))
  const fromLink = Object.keys(linked.locks).length > 0
  let locks = $state(linked.locks)
  let storedTeam: number | undefined
  try {
    storedTeam = Number(localStorage.getItem('myTeam'))
  } catch {}
  let myTeam = $state(linked.myTeam ?? season.teams.find((t) => t.id === storedTeam)?.id)
  window.onhashchange = () => {
    const link = decode(season, location.hash.slice(1))
    locks = link.locks
    myTeam = link.myTeam ?? myTeam
  }
  $effect(() => {
    const link = encode(season, locks, myTeam)
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
    seed: SEED,
    settings: { championsLeaguePlaces: season.championsLeaguePlaces },
  })
  if (fromLink) run(input({}))
  $effect(() => run(input($state.snapshot(locks))))
  // Whole percentages; 0% and 100% only when a badge proves them, because a simulation can't.
  const rounded = (chance: number) => {
    const p = Math.round(chance * 100)
    return p === 0 ? '<1%' : p === 100 ? '>99%' : `${p}%`
  }
  const percent = (id: number, zone: Zone) => {
    if (!scenario) return '…'
    const status = scenario.status[id][zone]
    if (status !== 'open') return status === 'clinched' ? '100%' : '0%'
    return rounded(scenario.chances[id][zone])
  }
  // Scenario minus Baseline in whole points; 0 when under 1 point, which hides the arrow.
  const shift = (id: number, zone: Zone) => {
    if (!scenario || !baseline) return 0
    const change = scenario.chances[id][zone] - baseline.chances[id][zone]
    return Math.abs(change) < 0.01 ? 0 : Math.round(change * 100)
  }
  const ZONES = { title: 'Title', championsLeague: 'Champions League places', relegation: 'Relegation' } as const satisfies Record<Zone, string>
  // Zone sign colours; gold takes dark ink, blue and red take white (dark ink on their lighter dark-theme shades).
  const ZONE_FILL = { title: 'bg-gold text-[#15202b]', championsLeague: 'bg-cl text-white dark:text-[#0f161d]', relegation: 'bg-rel text-white dark:text-[#0f161d]' } as const satisfies Record<Zone, string>
  const SHORT = { title: 'Title', championsLeague: 'CL', relegation: 'Rel' } as const satisfies Record<Zone, string>
  // Picking My team needs no re-run: the Forecast already has every team's Chances under each Outcome.
  // The tab starts on the Zone where My team's Chance is closest to 50%, until a tab is picked.
  let pickedZone = $state<Zone>()
  // Stored only when picked here, so opening someone else's link doesn't replace the team this browser remembers.
  const pickTeam = () => {
    pickedZone = undefined
    try {
      if (myTeam) localStorage.setItem('myTeam', String(myTeam))
      else localStorage.removeItem('myTeam')
    } catch {}
  }
  const zone = $derived.by(() => {
    if (pickedZone || !scenario || !myTeam) return pickedZone ?? 'title'
    const chances = scenario.chances[myTeam]
    return (Object.keys(ZONES) as Zone[]).toSorted((a, b) => Math.abs(chances[a] - 0.5) - Math.abs(chances[b] - 0.5))[0]
  })
  const keyList = $derived(scenario && myTeam ? keyFixtures(scenario.conditional, myTeam, zone).slice(0, 5) : [])
  const BADGES: Record<Zone, { clinched: string; eliminated: string }> = {
    title: { clinched: 'Title won', eliminated: 'Eliminated' },
    championsLeague: { clinched: 'Qualified', eliminated: 'Eliminated' },
    relegation: { clinched: 'Relegated', eliminated: 'Safe' },
  }
  // Opened by a button, not a #how link: the hash holds the Scenario.
  let how = $state<HTMLDetailsElement>()
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


{#snippet arrow(up: boolean)}
  <svg viewBox="0 0 8 8" class="size-2" aria-hidden="true"><path d={up ? 'M4 1 8 7H0z' : 'M4 7 0 1h8z'} fill="currentColor" /></svg>
{/snippet}

<!-- A Shift as an arrow plate: green when it's good news for the team, up for Title and CL, down for Relegation. -->
{#snippet shiftPlate(points: number, zone: Zone)}
  <span class={['drop-in ml-0.5 inline-flex items-center gap-px rounded-[3px] px-0.5 py-0.5 align-[1px] text-[10px] leading-none font-bold text-white sm:ml-1 sm:gap-0.5 sm:px-1 sm:text-[11px]', points > 0 === (zone !== 'relegation') ? 'bg-up' : 'bg-down']}>
    {@render arrow(points > 0)}<span class="sr-only">{points > 0 ? 'up' : 'down'}</span>{Math.abs(points)}
  </span>
{/snippet}

<!-- A Fixture's Lock buttons, mirrored about Draw; under a Key fixture each also shows My team's Chance if that Outcome happens. -->
{#snippet lockButtons(f: Fixture, chanceIf?: (outcome: Outcome) => string)}
  <li class="grid grid-cols-[1fr_4.5rem_1fr] gap-1.5">
    {#each [['home', names.get(f.homeTeamId)], ['draw', 'Draw'], ['away', names.get(f.awayTeamId)]] as const as [outcome, label] (outcome)}
      <button
        class={[
          'min-h-11 rounded-md border px-2.5 py-1.5 text-sm leading-tight font-semibold transition-colors duration-150',
          outcome === 'home' ? 'text-left' : outcome === 'away' ? 'text-right' : 'text-center',
          locks[f.id] === outcome ? 'plate-sel border-sel' : 'border-rule bg-surface text-ink hover:border-ink-2',
        ]}
        aria-pressed={locks[f.id] === outcome}
        onclick={() => toggle(f.id, outcome)}
        >{label}
        {#if chanceIf}<span class="block text-xs font-bold tabular-nums">{chanceIf(outcome)}</span>{/if}</button
      >
    {/each}
  </li>
{/snippet}

<main class="mx-auto max-w-2xl px-3 py-3 lg:max-w-5xl lg:px-6 lg:py-5">
  <header class="plate flex items-end justify-between gap-3 px-4 py-3">
    <div>
      <h1 class="font-sign text-[1.75rem] leading-none font-bold tracking-[0.04em] whitespace-nowrap uppercase">If We Win</h1>
      <p class="mt-1 text-xs font-medium">{season.leagueName} {season.season}–{String(season.season + 1).slice(2)}</p>
    </div>
    <div class="text-right text-xs leading-snug font-medium">
      <p>Updated {ago}</p>
      <button class="min-h-6 underline underline-offset-2" onclick={() => (how!.open = true, how!.scrollIntoView({ behavior: 'smooth' }))}>How this works</button>
    </div>
  </header>

  {#if Object.keys(locks).length}
    {@const count = Object.keys(locks).length}
    {@const points = myTeam ? shift(myTeam, zone) : 0}
    <!-- Stays in view while Locking further down, so a Lock's effect on My team is seen without scrolling back. -->
    <div class="sticky top-0 z-10 mt-2 flex items-center justify-between gap-3 rounded-md bg-gold px-3 py-2 text-[#15202b] shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
      <div class="min-w-0">
        <p class="font-sign text-base leading-tight font-bold tracking-wide uppercase">Scenario · {count} {count === 1 ? 'Lock' : 'Locks'}</p>
        {#if myTeam}
          <p class="truncate text-xs font-semibold tabular-nums">
            {names.get(myTeam)} · {SHORT[zone]}
            {percent(myTeam, zone)}{#if points}{@render shiftPlate(points, zone)}{/if}
          </p>
        {/if}
      </div>
      <button class="min-h-10 shrink-0 rounded-md bg-[#15202b] px-3 text-sm font-semibold text-white" onclick={() => (locks = {})}>Clear all Locks</button>
    </div>
  {/if}

  {#if age > 24 * HOUR}
    <p role="alert" class="mt-3 rounded-lg bg-down p-3 text-sm leading-snug font-semibold text-white">
      These numbers are over a day old. Our update hasn't run, so treat them with a pinch of salt.
    </p>
  {/if}

  <!-- Phone: table, then My team, then the Matchweek. Wide screens: the panel beside the table, staying in view, so a Lock and its Shifts are seen together. -->
  <div class="mt-3 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-8">
    <div>
      <table class="w-full text-[13px] tabular-nums sm:text-sm">
        <thead class="font-sign text-xs font-bold tracking-wide uppercase">
          <tr>
            <th class="w-2.5 pb-1.5"><span class="sr-only">Zone</span></th>
            <th class="w-6 pb-1.5 text-center">#</th>
            <th class="pb-1.5 text-left">Team</th>
            <th class="hidden w-px px-1.5 pb-1.5 text-right sm:table-cell">P</th>
            <th class="hidden w-px px-1.5 pb-1.5 text-right sm:table-cell">W</th>
            <th class="hidden w-px px-1.5 pb-1.5 text-right sm:table-cell">D</th>
            <th class="hidden w-px px-1.5 pb-1.5 text-right sm:table-cell">L</th>
            <th class="w-px px-1 pb-1.5 text-right">GD</th>
            <th class="w-px px-1 pb-1.5 text-right">Pts</th>
            {#each Object.entries(SHORT) as [z, label] (z)}
              <th class="w-px pb-1.5 pl-2 text-right sm:w-24">
                <abbr title={ZONES[z as Zone]} class="rounded-[3px] bg-plate px-1.5 py-0.5 text-on-plate no-underline">{label}</abbr>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (row.team.id)}
            {@const mine = row.team.id === myTeam}
            {@const moved = (['title', 'championsLeague', 'relegation'] as const).some((z) => shift(row.team.id, z))}
            <tr class={['border-t border-rule transition-colors duration-300', mine ? 'bg-sel font-semibold text-on-sel' : moved && 'bg-lit']}>
              <td class="pr-1">
                <span aria-hidden="true" class={['block h-6 w-1.5 rounded-sm', i === 0 ? 'bg-gold' : i < season.championsLeaguePlaces ? 'bg-cl' : i >= rows.length - DEFAULT_SETTINGS.relegationPlaces && 'bg-rel']}></span>
              </td>
              <td class="py-1 text-center">{i + 1}</td>
              <td class="max-w-0 py-1">
                <span class="flex items-center gap-1.5">
                  <img src={row.team.crest} alt="" class="size-4 shrink-0 sm:size-5" />
                  <span class="truncate font-semibold">{row.team.name}</span>
                </span>
              </td>
              <td class="hidden px-1 text-right sm:table-cell">{row.played}</td>
              <td class="hidden px-1 text-right sm:table-cell">{row.won}</td>
              <td class="hidden px-1 text-right sm:table-cell">{row.drawn}</td>
              <td class="hidden px-1 text-right sm:table-cell">{row.lost}</td>
              <td class="px-1 text-right">{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
              <td class="px-1 text-right font-bold">{row.points}</td>
              {#each ['title', 'championsLeague', 'relegation'] as const as zone (zone)}
                {@const status = scenario?.status[row.team.id][zone]}
                {@const points = shift(row.team.id, zone)}
                <td class="py-1 pl-2 text-right whitespace-nowrap">
                  {percent(row.team.id, zone)}{#if points}{@render shiftPlate(points, zone)}{/if}
                  {#if status && status !== 'open'}
                    <span class="mt-0.5 ml-auto block w-fit rounded-[3px] bg-plate px-1 font-sign text-[11px] leading-tight font-bold tracking-wide text-on-plate uppercase">{BADGES[zone][status]}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-hidden="true">
        <li class="flex items-center gap-1.5"><span class="h-3 w-1.5 rounded-sm bg-gold"></span>Title</li>
        <li class="flex items-center gap-1.5"><span class="h-3 w-1.5 rounded-sm bg-cl"></span>Champions League places</li>
        <li class="flex items-center gap-1.5"><span class="h-3 w-1.5 rounded-sm bg-rel"></span>Relegation</li>
      </ul>
    </div>

    <!-- Scrolls on its own when taller than the screen, so a sticky panel never hides its bottom. -->
    <div class="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <section>
        <div class="plate flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-4">
          <h2 id="my-team" class="font-sign text-lg font-bold tracking-wide uppercase">My team</h2>
          <select aria-labelledby="my-team" class="min-h-10 rounded-md border border-rule bg-surface px-2 text-sm font-semibold text-ink" bind:value={myTeam} onchange={pickTeam}>
            <option value={undefined}>None</option>
            {#each season.teams.toSorted((a, b) => a.name.localeCompare(b.name)) as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        </div>
        {#if myTeam}
          <h3 class="mt-3 font-sign text-base font-bold tracking-wide uppercase">Key fixtures</h3>
          <div role="tablist" class="mt-1.5 flex gap-1">
            {#each Object.entries(ZONES) as [z, label] (z)}
              <button
                role="tab"
                aria-selected={zone === z}
                class={[
                  'flex min-h-9 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold whitespace-nowrap',
                  zone === z ? [ZONE_FILL[z as Zone], 'border-transparent'] : 'border-rule bg-surface',
                ]}
                onclick={() => (pickedZone = z as Zone)}
                ><span aria-hidden="true" class={['h-3 w-1.5 rounded-sm', zone === z ? 'bg-current' : ZONE_FILL[z as Zone]]}></span>{label}</button
              >
            {/each}
          </div>
          {#if !scenario}
            <p class="mt-2 text-sm">…</p>
          {:else if keyList.length}
            <p class="mt-2 text-xs text-ink-2">{names.get(myTeam)}'s Chance if each Outcome happens</p>
            <ul class="mt-1.5 space-y-1.5">
              {#each keyList as k (k.id)}
                {@render lockButtons(fixtures.get(k.id)!, (outcome) => (k.chances[outcome] === undefined ? '–' : rounded(k.chances[outcome])))}
              {/each}
            </ul>
          {:else}
            <p class="mt-2 text-sm text-ink-2">No Fixture left swings this Chance by 1 point or more.</p>
          {/if}
        {:else}
          <p class="mt-1 text-sm text-ink-2">Pick your team to see which results to hope for.</p>
        {/if}
      </section>

      <section>
        {#if matchweeks.size}
          <div class="plate flex min-h-13 items-center justify-between px-1.5">
            <button class="grid size-10 place-items-center rounded disabled:invisible" aria-label="Previous Matchweek" disabled={week === weeks[0]} onclick={() => (week = weeks[weeks.indexOf(week) - 1])}>
              <svg viewBox="0 0 10 16" class="h-4" aria-hidden="true"><path d="M8 2 2 8l6 6" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
            </button>
            <h2 class="font-sign text-lg font-bold tracking-wide uppercase">Matchweek {week}</h2>
            <button class="grid size-10 place-items-center rounded disabled:invisible" aria-label="Next Matchweek" disabled={week === weeks.at(-1)} onclick={() => (week = weeks[weeks.indexOf(week) + 1])}>
              <svg viewBox="0 0 10 16" class="h-4" aria-hidden="true"><path d="m2 2 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
            </button>
          </div>
          <ul class="mt-2 space-y-1.5">
            {#each matchweeks.get(week) ?? [] as f (f.id)}
              {@render lockButtons(f)}
            {/each}
          </ul>
        {:else}
          <h2 class="font-sign text-lg font-bold tracking-wide uppercase">Fixtures</h2>
          <p class="mt-1 text-sm text-ink-2">No Fixtures left. That's the season done.</p>
        {/if}
      </section>
    </div>
  </div>

  <details bind:this={how} class="group mt-8 max-w-prose">
    <summary class="plate flex min-h-13 cursor-pointer list-none items-center justify-between px-4 font-sign text-lg font-bold tracking-wide uppercase [&::-webkit-details-marker]:hidden">
      How this works
      <svg viewBox="0 0 16 10" class="w-3.5 transition-transform group-open:rotate-180" aria-hidden="true"><path d="m2 2 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
    </summary>
    <div class="mt-1.5 space-y-3 rounded-lg border border-rule bg-surface p-4 text-sm leading-relaxed">
      <p>We play out the rest of the season 20,000 times and count how often each team finishes in each Zone. That count is the Chance.</p>
      <p>Each team's Rating is worked backwards from Bookmaker odds, so it's the market's view of how good they are. We never show the odds themselves.</p>
      <p>Nobody knows exactly how good a team is, so every run nudges each Rating a little at random. That's on purpose, and it's why nothing shows 0% or 100% unless the maths has already settled it.</p>
      <p>Lock a Fixture and its Outcome is fixed in every run. The Scoreline is still left to chance.</p>
      <p>Every week we keep a Snapshot of the Chances. At the end of the season we'll score them against a Benchmark that rates every team the same, and publish how we did, good or bad.</p>
    </div>
  </details>

  <footer class="mt-6 pb-4 text-xs text-ink-2">
    <a class="underline" href="https://www.football-data.org/">Football data provided by the Football-Data.org API</a>
  </footer>
</main>
