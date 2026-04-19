import type { PhoneProvider, ProviderLeadInput } from './types'

const URL = 'https://api.enginy.ai/api/tmp/orionConnect'

export const orionConnectProvider: PhoneProvider = {
  async lookup(input: ProviderLeadInput) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-me': 'mySecretKey123' },
      body: JSON.stringify({
        fullName: input.fullName,
        companyWebsite: input.companyWebsite,
      }),
    })
    if (!res.ok) throw new Error(`OrionConnect ${res.status}`)
    const data = (await res.json()) as { phone?: string | null }
    return { phone: data.phone ?? null }
  },
}
