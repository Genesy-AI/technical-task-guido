export interface ProviderLeadInput {
  fullName: string
  email: string
  jobTitle: string | null
  companyName: string | null
  companyWebsite: string | null
}

export interface PhoneProvider {
  lookup(input: ProviderLeadInput): Promise<{ phone: string | null }>
}
