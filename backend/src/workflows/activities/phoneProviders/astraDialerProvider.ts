import type { PhoneProvider, ProviderLeadInput } from './types'

const URL = 'https://api.enginy.ai/api/tmp/astraDialer'

export const astraDialerProvider: PhoneProvider = {
  async lookup(input: ProviderLeadInput) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiKey: '1234jhgf' },
      body: JSON.stringify({ email: input.email }),
    })
    if (!res.ok) throw new Error(`AstraDialer ${res.status}`)
    const data = (await res.json()) as { phoneNmbr?: string | null }
    return { phone: data.phoneNmbr ?? null }
  },
}
