import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { EnrichActivityInput } from './activities/phoneProviders/activities'
import type { PhoneProviderName } from './activities/phoneProviders'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  scheduleToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '30s',
    maximumAttempts: 3,
  },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

const { enrichWithOrionConnect } = proxyActivities<typeof activities>({
  startToCloseTimeout: '8 seconds',
  retry: { initialInterval: '500ms', backoffCoefficient: 2, maximumAttempts: 3 },
})

const { enrichWithNimbusLookup } = proxyActivities<typeof activities>({
  startToCloseTimeout: '4 seconds',
  retry: { initialInterval: '500ms', backoffCoefficient: 2, maximumAttempts: 3 },
})

const { enrichWithAstraDialer } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 seconds',
  retry: { initialInterval: '300ms', backoffCoefficient: 2, maximumAttempts: 3 },
})

const { persistEnrichmentResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
})

export type EnrichPhoneInput = EnrichActivityInput

export interface EnrichPhoneResult {
  status: 'found' | 'no_data'
  phone: string | null
  provider: PhoneProviderName | null
}

export async function enrichPhoneWorkflow(input: EnrichPhoneInput): Promise<EnrichPhoneResult> {
  const tries = [
    ['orionConnect', enrichWithOrionConnect],
    ['nimbusLookup', enrichWithNimbusLookup],
    ['astraDialer', enrichWithAstraDialer],
  ] as const

  for (const [name, fn] of tries) {
    try {
      const { phone } = await fn(input)
      if (phone) {
        await persistEnrichmentResult(input.leadId, 'found', phone, name)
        return { status: 'found', phone, provider: name }
      }
    } catch {
      // activity exhausted retries → fall through to the next provider
    }
  }

  await persistEnrichmentResult(input.leadId, 'no_data', null, null)
  return { status: 'no_data', phone: null, provider: null }
}
