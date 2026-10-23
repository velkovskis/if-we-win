<script lang="ts">
  import config from '../config/leagues.json'
  import League from './League.svelte'
  import { leagueOf } from './scenario.ts'
  import type { Season } from './update.ts'

  // Each League's Season is its own chunk, fetched the first time that League is shown.
  const SEASONS = import.meta.glob<Season>('../data/*/season.json', { import: 'default' })
  // In config order, leaving out a League whose first update hasn't published its Season yet.
  const leagues = config.filter((l) => SEASONS[`../data/${l.league}/season.json`])
  const codes = leagues.map((l) => l.league)

  // A link opens its own League; no link, or one we can't use, opens the League last viewed here, else the first: the Premier League.
  let viewed: string | null = null
  try {
    viewed = localStorage.getItem('league')
  } catch {}
  let league = $state(leagueOf(location.hash.slice(1), codes) ?? codes.find((c) => c === viewed) ?? codes[0])
  // The League on screen, which stays until the next one has loaded.
  let season = $state.raw<Season>()
  $effect(() => {
    const code = league
    try {
      localStorage.setItem('league', code)
    } catch {}
    // On a failed load, e.g. a weak signal, the tab goes back to the League still shown, so tapping it again retries.
    SEASONS[`../data/${code}/season.json`]().then(
      (s) => code === league && (season = s),
      () => code === league && season && (league = season.league),
    )
  })
  addEventListener('hashchange', () => (league = leagueOf(location.hash.slice(1), codes) ?? league))

  // index.html sets the theme before first paint. A pick here is remembered in this browser; until then the system's setting is followed.
  let dark = $state(document.documentElement.dataset.theme === 'dark')
  const system = matchMedia('(prefers-color-scheme: dark)')
  system.onchange = (e) => {
    try {
      if (localStorage.getItem('theme')) return
    } catch {}
    dark = e.matches
  }
  $effect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f161d' : '#f3f5f4')
  })
  const toggleTheme = () => {
    dark = !dark
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    } catch {}
  }

  // Opened by a button, not a #how link: the hash holds the Scenario.
  let how = $state<HTMLDialogElement>()
  const HOUR = 3_600_000

  let now = $state(Date.now())
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(timer)
  })

  const age = $derived(season ? now - Date.parse(season.updatedAt) : 0)
  const ago = $derived.by(() => {
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    if (age < HOUR) return format.format(-Math.floor(age / 60_000), 'minute')
    if (age < 48 * HOUR) return format.format(-Math.floor(age / HOUR), 'hour')
    return format.format(-Math.floor(age / (24 * HOUR)), 'day')
  })
</script>

<main class="mx-auto max-w-2xl px-3 py-3 lg:max-w-5xl lg:px-6 lg:py-5">
  <header class="plate flex items-end justify-between gap-3 px-4 py-3">
    <div>
      <h1 class="font-sign text-[1.75rem] leading-none font-bold tracking-[0.04em] whitespace-nowrap uppercase">If We Win</h1>
      <p class="mt-1 text-xs font-medium">{season ? `${season.leagueName} ${season.season}–${String(season.season + 1).slice(2)}` : '\u00a0'}</p>
    </div>
    <div class="flex items-end gap-2">
      <div class="text-right text-xs leading-snug font-medium">
        <p>{season ? `Updated ${ago}` : '\u00a0'}</p>
        <!-- The ::before stretches the tap target to 48px tall without growing the header. -->
        <button class="relative min-h-6 underline underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-3" onclick={() => how!.showModal()}>How this works</button>
      </div>
      <button class="grid size-10 shrink-0 place-items-center rounded-md hover:bg-white/10" aria-label="Dark mode" aria-pressed={dark} onclick={toggleTheme}>
        <svg viewBox="0 0 20 20" class="size-5" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          {#if dark}
            <!-- Sun: tap for light. -->
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4" />
          {:else}
            <!-- Moon: tap for dark. -->
            <path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z" />
          {/if}
        </svg>
      </button>
    </div>
  </header>

  <!-- One tap per League. On a narrow phone the row scrolls sideways in its own strip, edge to edge, and the page never does;
       the vertical padding keeps the focus ring inside the strip, which clips it. -->
  <nav aria-label="Leagues" class="-mx-3 mt-1 overflow-x-auto overscroll-x-contain px-3 py-1 lg:-mx-6 lg:px-6">
    <ul class="flex gap-1.5">
      {#each leagues as l (l.league)}
        <li>
          <button
            class={[
              'min-h-11 rounded-md border px-3 font-sign text-base font-bold tracking-wide whitespace-nowrap uppercase transition-colors duration-150',
              l.league === league ? 'plate-sel border-sel' : 'border-rule bg-surface text-ink hover:border-ink-2',
            ]}
            aria-current={l.league === league || undefined}
            onclick={() => (league = l.league)}>{l.name}</button
          >
        </li>
      {/each}
    </ul>
  </nav>

  {#if age > 24 * HOUR}
    <p role="alert" class="mt-3 rounded-lg bg-down p-3 text-sm leading-snug font-semibold text-white">
      These numbers are over a day old. Our update hasn't run, so treat them with a pinch of salt.
    </p>
  {/if}

  {#key season}
    {#if season}<League {season} {codes} />{/if}
  {/key}

  <footer class="mt-4 flex flex-wrap gap-x-5 pb-2 text-xs text-ink-2">
    <a class="inline-flex min-h-11 items-center underline" href="https://www.football-data.org/">Football data provided by the Football-Data.org API</a>
    <button class="min-h-11 underline underline-offset-3" onclick={() => how!.showModal()}>How this works</button>
  </footer>

  <!-- Opens over the table, so a fan mid-Scenario reads it and closes back to where they were. Phone: a sheet from the foot of the screen; wide screens: centred. A tap on the backdrop closes it (the dialog itself has no padding, so only the backdrop hits it). -->
  <dialog
    bind:this={how}
    aria-labelledby="how"
    class="inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-lg border border-b-0 border-rule bg-surface text-ink backdrop:bg-black/50 lg:top-0 lg:m-auto lg:max-w-xl lg:rounded-lg lg:border-b"
    onclick={(e) => e.target === how && how.close()}
  >
    <div class="sticky top-0 bg-surface p-1.5">
      <div class="plate flex items-center justify-between py-1.5 pr-1 pl-4">
        <h2 id="how" class="font-sign text-lg font-bold tracking-wide uppercase">How this works</h2>
        <button class="grid size-11 place-items-center rounded-md hover:bg-white/10" aria-label="Close" onclick={() => how!.close()}>
          <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
        </button>
      </div>
    </div>
    <dl class="px-4 pt-3 pb-6 text-sm leading-relaxed [&>dd]:mt-1 [&>dt]:font-sign [&>dt]:text-base [&>dt]:font-bold [&>dt]:tracking-wide [&>dt]:uppercase [&>dt:not(:first-child)]:mt-5">
      <dt>Where the percentages come from</dt>
      <dd>We play out the rest of the season 20,000 times and count how often each team finishes top, in the Champions League places or in the bottom three. If a team finishes top in 6,000 of those seasons, that's a 30% chance of the title.</dd>
      <dt>How we decide how good a team is</dt>
      <dd>Every team gets a strength rating, worked out from the bookmakers' odds on their matches. So it's roughly what the bookies reckon they're worth. We never show the bookmakers' odds themselves.</dd>
      <dt>Why you'll rarely see 0% or 100%</dt>
      <dd>Nobody knows exactly how good a team is, us included. So in each of those 20,000 seasons, every team's rating gets a small random nudge up or down. We do that on purpose: it means you'll only see 0% or 100% once the maths has actually settled it.</dd>
      <dt>What happens when you pick a result</dt>
      <dd>Tap the home team, Draw or the away team on any match still to play, and we'll treat that result as having happened in all 20,000 seasons. We call that a Lock. The exact score is still left to chance. The arrows in the table then show how much each team's chances have moved.</dd>
      <dt>Are we any good?</dt>
      <dd>Every week we save a copy of everyone's chances. At the end of the season we'll check them against what actually happened, and against a simple guess that treats every team as equally good. Then we'll publish how we did, good or bad.</dd>
    </dl>
  </dialog>
</main>
