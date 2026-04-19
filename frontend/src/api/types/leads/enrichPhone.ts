export type LeadsEnrichPhoneInput = { id: number }

export type LeadsEnrichPhoneOutput = {
  workflowId: string
  runId: string
  status: 'in_progress'
}

export type LeadsEnrichPhoneStatusInput = { id: number }

export type EnrichmentStatus =
  | 'in_progress'
  | 'querying_orion'
  | 'querying_nimbus'
  | 'querying_astra'
  | 'found'
  | 'no_data'

export type LeadsEnrichPhoneStatusOutput = {
  phoneNumber: string | null
  phoneEnrichmentStatus: EnrichmentStatus | null
  phoneEnrichmentProvider: string | null
  phoneEnrichmentUpdatedAt: string | null
}
