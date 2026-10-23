<script lang="ts">
  import { DEFAULT_SETTINGS, finish, keyFixtures, SEED, type Forecast, type Input, type Outcome, type Tally, type Zone } from './forecast.ts'
  import { decode, encode, leagueOf } from './scenario.ts'
  import { table } from './table.ts'
  import type { Fixture, Season } from './update.ts'

  // One League's table, Fixtures and Scenario. App mounts a fresh one for each League shown, so Locks, the Matchweek and
  // the Forecast's workers never carry over from another League, and its props never change. codes: every League's code, to tell its links from another League's.
  const props: { season: Season; codes: string[] } = $props()
  // svelte-ignore state_referenced_locally
  const { season, codes } = props
  const rows = table(season.teams, season.results, season.deductions, season.tieBreaks)
  const names = new Map(season.teams.map((t) => [t.id, t.name]))
  const fixtures = new Map(season.fixtures.map((f) => [f.id, f]))
  // The viewer's own locale and time zone, e.g. "Sat 25 Oct, 15:00" in the UK and "Sat, Oct 25, 3:00 PM" in the US.
  const kickoffFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const kickoffLabel = (f: Fixture) =>
    f.status === 'postponed' ? 'Postponed' : f.status === 'tbc' ? `${dateFormat.format(new Date(f.kickoff))} · TBC` : kickoffFormat.format(new Date(f.kickoff))
  const postponedLast = (f: Fixture) => Number(f.status === 'postponed')
  // Not Map.groupBy: it blanks the page on Safari before 17.4.
  const matchweeks = new Map<number, Fixture[]>()
  for (const f of season.fixtures.toSorted((a, b) => a.matchweek - b.matchweek || postponedLast(a) - postponedLast(b) || a.kickoff.localeCompare(b.kickoff))) matchweeks.set(f.matchweek, [...(matchweeks.get(f.matchweek) ?? []), f])
  const weeks = [...matchweeks.keys()]
  // Start at the next Matchweek: the first with at least half its matches still to play, so one postponed Fixture doesn't count.
  const played = (week: number) => season.results.filter((r) => r.matchweek === week).length
  let week = $state(weeks.find((w) => matchweeks.get(w)!.length >= played(w)) ?? weeks[0])

  // The link is the only place a Scenario is kept. My team is kept there too, and in this browser as a convenience; the link wins.
  const linked = decode(season, location.hash.slice(1))
  const fromLink = Object.keys(linked.locks).length > 0
  let locks = $state(linked.locks)
  let storedTeam: number | undefined
  // My team is remembered per League; the Premier League's keeps its pre-v2 key, so returning fans keep their team.
  const teamKey = season.league === 'PL' ? 'myTeam' : `myTeam:${season.league}`
  try {
    storedTeam = Number(localStorage.getItem(teamKey))
  } catch {}
  let myTeam = $state(linked.myTeam ?? season.teams.find((t) => t.id === storedTeam)?.id)
  // Set afresh by each League mounted, replacing the last one's. A link to another League is App's to open.
  window.onhashchange = () => {
    const other = leagueOf(location.hash.slice(1), codes)
    if (other && other !== season.league) return
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
  let next: Input | undefined
  // One worker per core. The simulations go out in small chunks, each worker taking the next as it finishes one,
  // so a slow efficiency core holds up only its last chunk. The chunks add up to exactly one run,
  // so the Chances are the same on every device; a phone that reports fewer cores just gets fewer workers.
  const CHUNK = 500
  const chunks = Math.ceil(DEFAULT_SETTINGS.simulations / CHUNK)
  const workers = Array.from({ length: Math.min(navigator.hardwareConcurrency || 4, 8, chunks) }, () => new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' }))
  $effect(() => () => workers.forEach((w) => w.terminate()))
  const run = (input: Input) => {
    if (running) return void (next = input)
    running = true
    const tallies: Tally[] = []
    let sent = 0
    const send = (worker: Worker) => {
      const from = sent++ * CHUNK
      worker.postMessage({ input, from, to: Math.min(from + CHUNK, DEFAULT_SETTINGS.simulations) })
    }
    for (const worker of workers) {
      worker.onmessage = (e: MessageEvent<Tally>) => {
        tallies.push(e.data)
        if (sent < chunks) return send(worker)
        if (tallies.length < chunks) return
        const result = finish(input, tallies)
        if (baseline || !fromLink) scenario = result
        baseline ??= result
        running = false
        if (next) run(next)
        next = undefined
      }
      send(worker)
    }
  }
  // Same seed every run and in every browser, so teams a Lock doesn't affect show no Shift and a shared link shows the same Chances.
  // ponytail: Math.exp/log/cos may differ in the last bit between browser engines, so a rare draw can differ; port them in-house if Chances ever disagree across browsers.
  const input = (locks: Record<number, Outcome>): Input => ({
    season,
    ratings: season.ratings.teams,
    locks,
    seed: SEED,
    settings: { championsLeaguePlaces: season.championsLeaguePlaces, relegationPlaces: season.relegationPlaces, homeAdvantage: season.homeAdvantage, strengthNoise: season.strengthNoise },
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
  const ZONE_FILL = { title: 'bg-gold text-[#15202b]', championsLeague: 'bg-cl text-on-zone', relegation: 'bg-rel text-on-zone' } as const satisfies Record<Zone, string>
  const SHORT = { title: 'Title', championsLeague: 'CL', relegation: 'Rel' } as const satisfies Record<Zone, string>
  // Picking My team needs no re-run: the Forecast already has every team's Chances under each Outcome.
  // The tab starts on the Zone where My team's Chance is closest to 50%, until a tab is picked.
  let pickedZone = $state<Zone>()
  // Stored only when picked here, so opening someone else's link doesn't replace the team this browser remembers.
  const pickTeam = () => {
    pickedZone = undefined
    try {
      if (myTeam) localStorage.setItem(teamKey, String(myTeam))
      else localStorage.removeItem(teamKey)
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

<!-- A Fixture's Kick-off and Lock buttons, mirrored about Draw; under a Key fixture each also shows My team's Chance if that Outcome happens. -->
{#snippet lockButtons(f: Fixture, chanceIf?: (outcome: Outcome) => string)}
  <li>
    <p class="mb-0.5 text-xs tabular-nums">{kickoffLabel(f)}</p>
    <div class="grid grid-cols-[1fr_4.5rem_1fr] gap-1.5">
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
    </div>
  </li>
{/snippet}

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

<!-- Phone: table, then My team, then the Matchweek. Wide screens: the panel beside the table, staying in view, so a Lock and its Shifts are seen together. -->
<div class="mt-3 grid gap-6 lg:grid-cols-[1fr_22rem] lg:gap-8">
  <div class="relative">
    <!-- Wide screens: the column headings sit on a plate matching the panel's, so both columns open on the same sign. -->
    <div aria-hidden="true" class="plate absolute inset-x-0 top-0 hidden h-13 lg:block"></div>
    <table class="relative w-full text-[13px] tabular-nums sm:text-sm">
      <thead class="font-sign text-xs font-bold tracking-wide uppercase lg:text-sm lg:text-on-plate">
        <tr class="[&>th]:pb-1.5 lg:h-15 lg:[&>th]:pb-2">
          <th class="w-2.5"><span class="sr-only">Zone</span></th>
          <th class="w-6 text-center">#</th>
          <th class="text-left">Team</th>
          <th class="hidden w-px px-1 text-right sm:table-cell lg:w-7">P</th>
          <th class="hidden w-px px-1 text-right sm:table-cell lg:w-7">W</th>
          <th class="hidden w-px px-1 text-right sm:table-cell lg:w-7">D</th>
          <th class="hidden w-px px-1 text-right sm:table-cell lg:w-7">L</th>
          <th class="w-px px-1 text-right lg:w-8">GD</th>
          <th class="w-px px-1 text-right lg:w-8">Pts</th>
          {#each Object.entries(SHORT) as [z, label] (z)}
            <th class="w-px pl-2 text-right sm:w-24 lg:w-20 lg:last:pr-3">
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
              <!-- The Relegation play-off place is a hollow red bar: next to Relegation, not part of it. -->
              <span
                aria-hidden="true"
                class={[
                  'block h-6 w-1.5 rounded-sm',
                  i === 0 ? 'bg-gold' : i < season.championsLeaguePlaces ? 'bg-cl' : i >= rows.length - season.relegationPlaces ? 'bg-rel' : i + 1 === season.relegationPlayOffPlace && 'border-[1.5px] border-rel',
                ]}
              ></span>
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
              <td class="py-1 pl-2 text-right whitespace-nowrap lg:last:pr-3">
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
      {#if season.relegationPlayOffPlace}
        <li class="flex items-center gap-1.5"><span class="h-3 w-1.5 rounded-sm border-[1.5px] border-rel"></span>Relegation play-off</li>
      {/if}
    </ul>
  </div>

  <!-- Wide screens: exactly as tall as the table and scrolls on its own, fading at the foot while there's more below. h-0 keeps it out of the row's sizing, so the table sets the height and both columns end together. -->
  <div class="space-y-6 lg:-mx-1 lg:h-0 lg:min-h-full lg:scroll-fade lg:overflow-y-auto lg:px-1 lg:pb-1">
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

