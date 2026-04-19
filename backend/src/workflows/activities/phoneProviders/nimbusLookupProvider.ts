import type { PhoneProvider, ProviderLeadInput } from './types'

const URL = 'https://api.enginy.ai/api/tmp/numbusLookup?api=000099998888'

export const nimbusLookupProvider: PhoneProvider = {
  async lookup(input: ProviderLeadInput) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        jobTitle: input.jobTitle,
      }),
    })
    if (!res.ok) throw new Error(`NimbusLookup ${res.status}`)
    const data = (await res.json()) as { number?: number; countryCode?: string }
    if (data.number == null || !data.countryCode) return { phone: null }
    return { phone: `+${data.countryCode}${data.number}` }
  },
}
