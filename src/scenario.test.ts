import { describe, expect, it } from 'vitest'
import { decode, encode } from './scenario.ts'

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
