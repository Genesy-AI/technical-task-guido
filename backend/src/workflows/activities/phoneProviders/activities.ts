import { prisma } from '../../../prisma'
import { phoneProviders, type PhoneProviderName, type ProviderLeadInput } from './index'

export type EnrichmentStatus = 'in_progress' | 'found' | 'no_data'

export type EnrichActivityInput = ProviderLeadInput & { leadId: number }

export async function enrichWithOrionConnect(input: EnrichActivityInput) {
  return phoneProviders.orionConnect.lookup(input)
}

export async function enrichWithNimbusLookup(input: EnrichActivityInput) {
  return phoneProviders.nimbusLookup.lookup(input)
}

export async function enrichWithAstraDialer(input: EnrichActivityInput) {
  return phoneProviders.astraDialer.lookup(input)
}

export async function persistEnrichmentResult(
  leadId: number,
  status: 'found' | 'no_data',
  phone: string | null,
  provider: PhoneProviderName | null,
) {
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      phoneEnrichmentStatus: status,
      phoneEnrichmentProvider: provider,
      phoneEnrichmentUpdatedAt: new Date(),
      ...(phone ? { phoneNumber: phone } : {}),
    },
  })
}
