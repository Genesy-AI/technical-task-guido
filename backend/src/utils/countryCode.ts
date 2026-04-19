import countries from 'i18n-iso-countries'

const ALPHA2 = new Set(Object.keys(countries.getAlpha2Codes()))

export const normalizeCountryCode = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim().toUpperCase()
  return trimmed ? trimmed : null
}

export const isValidCountryCode = (value: string | null | undefined): boolean => {
  const normalized = normalizeCountryCode(value)
  return normalized !== null && normalized.length === 2 && ALPHA2.has(normalized)
}

export const sanitizeCountryCode = (value: string | null | undefined): string | null => {
  const normalized = normalizeCountryCode(value)
  return normalized && normalized.length === 2 && ALPHA2.has(normalized) ? normalized : null
}
