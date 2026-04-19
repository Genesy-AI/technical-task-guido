import { prisma } from '../../../prisma'
import { phoneProviders, type PhoneProviderName, type ProviderLeadInput } from './index'

export type EnrichmentStatus =
  | 'in_progress'
  | 'querying_orion'
  | 'querying_nimbus'
  | 'querying_astra'
  | 'found'
  | 'no_data'

export type EnrichActivityInput = ProviderLeadInput & { leadId: number }

async function setStatus(leadId: number, status: EnrichmentStatus) {
  await prisma.lead.update({
    where: { id: leadId },
    data: { phoneEnrichmentStatus: status, phoneEnrichmentUpdatedAt: new Date() },
  })
}

export async function enrichWithOrionConnect(input: EnrichActivityInput) {
  await setStatus(input.leadId, 'querying_orion')
  return phoneProviders.orionConnect.lookup(input)
}

export async function enrichWithNimbusLookup(input: EnrichActivityInput) {
  await setStatus(input.leadId, 'querying_nimbus')
  return phoneProviders.nimbusLookup.lookup(input)
}

export async function enrichWithAstraDialer(input: EnrichActivityInput) {
  await setStatus(input.leadId, 'querying_astra')
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
