import { describe, expect, it } from 'vitest'
import { decode, encode } from './scenario.ts'

const season = { league: 'PL', season: 2026, fixtures: [{ id: 11 }, { id: 12 }, { id: 13 }] }

describe('scenario link', () => {
  it('round-trips the Locks', () => {
    const locks = { 11: 'home', 13: 'draw', 12: 'away' } as const
    expect(encode(season, locks)).toBe('PL2026:11h,12a,13d')
    expect(decode(season, encode(season, locks))).toEqual(locks)
  })

  it('is empty for the Baseline', () => {
    expect(encode(season, {})).toBe('')
    expect(decode(season, '')).toEqual({})
  })

  it('reads a link whose punctuation was percent-encoded on the way', () => {
    expect(decode(season, 'PL2026%3A11h%2C12a')).toEqual({ 11: 'home', 12: 'away' })
  })

  it('drops Locks on Fixtures that are unknown or already played', () => {
    expect(decode(season, 'PL2026:11h,99a,12d')).toEqual({ 11: 'home', 12: 'draw' })
  })

  it('opens a link from another season with no Locks', () => {
    expect(decode(season, 'PL2025:11h')).toEqual({})
    expect(decode(season, 'BL2026:11h')).toEqual({})
  })

  it('falls back to the Baseline on a malformed link', () => {
    for (const hash of ['garbage', 'PL2026', 'PL2026:', 'PL2026:11x', 'PL2026:h', ':::', '%E0%A4%A']) expect(decode(season, hash)).toEqual({})
    expect(decode(season, 'PL2026:11h,,constructor,12z')).toEqual({ 11: 'home' })
  })
})
