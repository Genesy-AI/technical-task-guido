import { describe, it, expect } from 'vitest'
import { isValidCountryCode, normalizeCountryCode, sanitizeCountryCode } from './countryCode'

describe('normalizeCountryCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCountryCode('  ar ')).toBe('AR')
    expect(normalizeCountryCode('us')).toBe('US')
  })

  it('returns null for empty or nullish', () => {
    expect(normalizeCountryCode('')).toBeNull()
    expect(normalizeCountryCode('   ')).toBeNull()
    expect(normalizeCountryCode(null)).toBeNull()
    expect(normalizeCountryCode(undefined)).toBeNull()
  })
})

describe('isValidCountryCode', () => {
  it('accepts valid ISO 3166-1 alpha-2 codes (case-insensitive)', () => {
    expect(isValidCountryCode('US')).toBe(true)
    expect(isValidCountryCode('us')).toBe(true)
    expect(isValidCountryCode('AR')).toBe(true)
    expect(isValidCountryCode('  de  ')).toBe(true)
  })

  it('rejects alpha-3, numeric, or garbage', () => {
    expect(isValidCountryCode('USA')).toBe(false)
    expect(isValidCountryCode('840')).toBe(false)
    expect(isValidCountryCode('XX')).toBe(false)
    expect(isValidCountryCode('ZZ')).toBe(false)
    expect(isValidCountryCode('garbled!')).toBe(false)
  })

  it('rejects empty and nullish values', () => {
    expect(isValidCountryCode('')).toBe(false)
    expect(isValidCountryCode(null)).toBe(false)
    expect(isValidCountryCode(undefined)).toBe(false)
  })
})

describe('sanitizeCountryCode', () => {
  it('returns the normalized code when valid', () => {
    expect(sanitizeCountryCode('us')).toBe('US')
    expect(sanitizeCountryCode('  ar  ')).toBe('AR')
  })

  it('returns null for invalid or empty values', () => {
    expect(sanitizeCountryCode('USA')).toBeNull()
    expect(sanitizeCountryCode('XX')).toBeNull()
    expect(sanitizeCountryCode('')).toBeNull()
    expect(sanitizeCountryCode(null)).toBeNull()
    expect(sanitizeCountryCode(undefined)).toBeNull()
  })
})
