import { describe, expect, it } from 'vitest'
import { decode, encode, leagueOf } from './scenario.ts'

const season = { league: 'PL', season: 2026, fixtures: [{ id: 11 }, { id: 12 }, { id: 13 }], teams: [{ id: 57 }, { id: 61 }] }
const locksOf = (link: string) => decode(season, link).locks

describe('scenario link', () => {
  it('round-trips the Locks', () => {
    const locks = { 11: 'home', 13: 'draw', 12: 'away' } as const
    expect(encode(season, locks)).toBe('PL2026:11h,12a,13d')
    expect(decode(season, encode(season, locks))).toEqual({ locks })
  })

  it('is empty for the Baseline', () => {
    expect(encode(season, {})).toBe('')
    expect(decode(season, '')).toEqual({ locks: {} })
  })

  it('round-trips My team, with or without Locks', () => {
    expect(encode(season, { 11: 'home' }, 57)).toBe('PL2026:11h:57')
    expect(decode(season, 'PL2026:11h:57')).toEqual({ locks: { 11: 'home' }, myTeam: 57 })
    expect(encode(season, {}, 61)).toBe('PL2026::61')
    expect(decode(season, 'PL2026::61')).toEqual({ locks: {}, myTeam: 61 })
  })

  it('drops an unknown My team but keeps the Locks', () => {
    expect(decode(season, 'PL2026:11h:99')).toEqual({ locks: { 11: 'home' } })
    expect(decode(season, 'PL2026:11h:x')).toEqual({ locks: { 11: 'home' } })
  })

  it('reads a link whose punctuation was percent-encoded on the way', () => {
    expect(locksOf('PL2026%3A11h%2C12a')).toEqual({ 11: 'home', 12: 'away' })
  })

  it('drops Locks on Fixtures that are unknown or already played', () => {
    expect(locksOf('PL2026:11h,99a,12d')).toEqual({ 11: 'home', 12: 'draw' })
  })

  it('opens a link from another season with no Locks and no My team', () => {
    expect(decode(season, 'PL2025:11h:57')).toEqual({ locks: {} })
    expect(decode(season, 'BL2026:11h')).toEqual({ locks: {} })
  })

  it('falls back to the Baseline on a malformed link', () => {
    for (const hash of ['garbage', 'PL2026', 'PL2026:', 'PL2026:11x', 'PL2026:h', ':::', '%E0%A4%A']) expect(decode(season, hash)).toEqual({ locks: {} })
    expect(locksOf('PL2026:11h,,constructor,12z')).toEqual({ 11: 'home' })
  })
})

describe('which League a link opens', () => {
  const leagues = ['PL', 'LL', 'BL1']
  const laLiga = { league: 'LL', season: 2026, fixtures: [{ id: 21 }], teams: [{ id: 86 }] }

  it('opens a LaLiga link on LaLiga, with its Locks and My team', () => {
    expect(leagueOf('LL2026:21a:86', leagues)).toBe('LL')
    expect(decode(laLiga, 'LL2026:21a:86')).toEqual({ locks: { 21: 'away' }, myTeam: 86 })
    expect(decode(season, 'LL2026:21a:86')).toEqual({ locks: {} })
  })

  it('opens a pre-v2 Premier League link on the Premier League', () => {
    expect(leagueOf('PL2026:11h,12a:57', leagues)).toBe('PL')
    expect(decode(season, 'PL2026:11h,12a:57')).toEqual({ locks: { 11: 'home', 12: 'away' }, myTeam: 57 })
  })

  it('reads a League code with a digit in it, and a percent-encoded link', () => {
    expect(leagueOf('BL12026:11h', leagues)).toBe('BL1')
    expect(leagueOf('LL2026%3A21a', leagues)).toBe('LL')
  })

  it('opens a link from an old season on its League', () => {
    expect(leagueOf('LL2025:21a', leagues)).toBe('LL')
  })

  it('names no League for an unknown League, a malformed link or no link', () => {
    for (const hash of ['SA2026:11h', 'LL:21a', 'LL26:21a', 'garbage', ':::', '%E0%A4%A', '']) expect(leagueOf(hash, leagues)).toBeUndefined()
  })
})
