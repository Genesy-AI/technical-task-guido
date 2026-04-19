import { afterEach, describe, expect, it, vi } from 'vitest'
import { orionConnectProvider } from '../orionConnectProvider'
import { nimbusLookupProvider } from '../nimbusLookupProvider'
import { astraDialerProvider } from '../astraDialerProvider'
import type { ProviderLeadInput } from '../types'

const baseInput: ProviderLeadInput = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  jobTitle: 'CTO',
  companyName: 'Example',
  companyWebsite: 'example.com',
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('orionConnectProvider', () => {
  it('sends fullName + companyWebsite with the auth header', async () => {
    const fetchMock = mockFetchOnce({ phone: '+15551234' })
    const result = await orionConnectProvider.lookup(baseInput)
    expect(result).toEqual({ phone: '+15551234' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/orionConnect')
    expect(opts.headers['x-auth-me']).toBe('mySecretKey123')
    expect(JSON.parse(opts.body)).toEqual({ fullName: 'Ada Lovelace', companyWebsite: 'example.com' })
  })

  it('returns null phone when provider returns null', async () => {
    mockFetchOnce({ phone: null })
    expect(await orionConnectProvider.lookup(baseInput)).toEqual({ phone: null })
  })

  it('throws on non-2xx', async () => {
    mockFetchOnce({}, { ok: false, status: 500 })
    await expect(orionConnectProvider.lookup(baseInput)).rejects.toThrow(/OrionConnect 500/)
  })
})

describe('nimbusLookupProvider', () => {
  it('joins countryCode + number into E.164-ish phone', async () => {
    mockFetchOnce({ number: 5551234, countryCode: '1' })
    expect(await nimbusLookupProvider.lookup(baseInput)).toEqual({ phone: '+15551234' })
  })

  it('returns null when countryCode missing', async () => {
    mockFetchOnce({ number: 5551234 })
    expect(await nimbusLookupProvider.lookup(baseInput)).toEqual({ phone: null })
  })

  it('returns null when number missing', async () => {
    mockFetchOnce({ countryCode: '1' })
    expect(await nimbusLookupProvider.lookup(baseInput)).toEqual({ phone: null })
  })
})

describe('astraDialerProvider', () => {
  it('reads phoneNmbr field', async () => {
    const fetchMock = mockFetchOnce({ phoneNmbr: '+15559999' })
    expect(await astraDialerProvider.lookup(baseInput)).toEqual({ phone: '+15559999' })
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.headers.apiKey).toBe('1234jhgf')
    expect(JSON.parse(opts.body)).toEqual({ email: 'ada@example.com' })
  })

  it('returns null when phoneNmbr undefined', async () => {
    mockFetchOnce({})
    expect(await astraDialerProvider.lookup(baseInput)).toEqual({ phone: null })
  })
})
