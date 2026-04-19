import type { PhoneProvider } from './types'
import { orionConnectProvider } from './orionConnectProvider'
import { nimbusLookupProvider } from './nimbusLookupProvider'
import { astraDialerProvider } from './astraDialerProvider'

export const phoneProviders = {
  orionConnect: orionConnectProvider,
  nimbusLookup: nimbusLookupProvider,
  astraDialer: astraDialerProvider,
} satisfies Record<string, PhoneProvider>

export type PhoneProviderName = keyof typeof phoneProviders
export type { PhoneProvider, ProviderLeadInput } from './types'
