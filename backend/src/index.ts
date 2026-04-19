import express, { Request, Response } from 'express'
import { Connection, Client, WorkflowExecutionAlreadyStartedError } from '@temporalio/client'
import { verifyEmailWorkflow, enrichPhoneWorkflow, type EnrichPhoneInput } from './workflows'
import { generateMessageFromTemplate } from './utils/messageGenerator'
import { sanitizeCountryCode } from './utils/countryCode'
import { runTemporalWorker } from './worker'
import { prisma } from './prisma'
const app = express()
app.use(express.json())

type LeadFields = {
  phoneNumber?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
}

const PHONE_REGEX = /^\+?[0-9 \-().]{7,20}$/

function parseLeadFields(body: Record<string, unknown>): { data: LeadFields } | { error: string } {
  const data: LeadFields = {}

  if ('phoneNumber' in body) {
    const v = body.phoneNumber
    if (v === null || v === '') {
      data.phoneNumber = null
    } else if (typeof v !== 'string') {
      return { error: 'phoneNumber must be a string' }
    } else {
      const trimmed = v.trim()
      if (!PHONE_REGEX.test(trimmed)) return { error: 'phoneNumber has an invalid format' }
      data.phoneNumber = trimmed
    }
  }

  if ('yearsAtCompany' in body) {
    const v = body.yearsAtCompany
    if (v === null || v === '') {
      data.yearsAtCompany = null
    } else {
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 80) {
        return { error: 'yearsAtCompany must be an integer between 0 and 80' }
      }
      data.yearsAtCompany = n
    }
  }

  if ('linkedinUrl' in body) {
    const v = body.linkedinUrl
    if (v === null || v === '') {
      data.linkedinUrl = null
    } else if (typeof v !== 'string') {
      return { error: 'linkedinUrl must be a string' }
    } else {
      const trimmed = v.trim()
      try {
        const url = new URL(trimmed)
        if (!url.hostname.includes('linkedin.com')) return { error: 'linkedinUrl must be a linkedin.com URL' }
      } catch {
        return { error: 'linkedinUrl must be a valid URL' }
      }
      data.linkedinUrl = trimmed
    }
  }

  return { data }
}

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
})

app.post('/leads', async (req: Request, res: Response) => {
  const { name, lastName, email } = req.body

  if (!name || !lastName || !email) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required' })
  }

  const parsed = parseLeadFields(req.body)
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error })
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: String(name),
      lastName: String(lastName),
      email: String(email),
      ...parsed.data,
    },
  })
  res.json(lead)
})

app.get('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const lead = await prisma.lead.findUnique({
    where: {
      id: Number(id),
    },
  })
  res.json(lead)
})

app.get('/leads', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany()

  res.json(leads)
})

app.patch('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, email } = req.body

  const parsed = parseLeadFields(req.body)
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error })
  }

  const data: Record<string, unknown> = { ...parsed.data }
  if (name !== undefined) data.firstName = String(name)
  if (email !== undefined) data.email = String(email)

  const lead = await prisma.lead.update({
    where: { id: Number(id) },
    data,
  })
  res.json(lead)
})

app.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.lead.delete({
    where: {
      id: Number(id),
    },
  })
  res.json()
})

app.delete('/leads', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const result = await prisma.lead.deleteMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    })

    res.json({ deletedCount: result.count })
  } catch (error) {
    console.error('Error deleting leads:', error)
    res.status(500).json({ error: 'Failed to delete leads' })
  }
})

app.post('/leads/generate-messages', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, template } = req.body

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template must be a non-empty string' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        id: {
          in: leadIds.map((id) => Number(id)),
        },
      },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    let generatedCount = 0
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const message = generateMessageFromTemplate(template, lead)

        await prisma.lead.update({
          where: { id: lead.id },
          data: { message },
        })

        generatedCount++
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      generatedCount,
      errors,
    })
  } catch (error) {
    console.error('Error generating messages:', error)
    res.status(500).json({ error: 'Failed to generate messages' })
  }
})

app.post('/leads/bulk', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leads } = req.body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }

  try {
    const validLeads = leads.filter((lead) => {
      return (
        lead.firstName &&
        lead.lastName &&
        lead.email &&
        typeof lead.firstName === 'string' &&
        lead.firstName.trim() &&
        typeof lead.lastName === 'string' &&
        lead.lastName.trim() &&
        typeof lead.email === 'string' &&
        lead.email.trim()
      )
    })

    if (validLeads.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid leads found. firstName, lastName, and email are required.' })
    }

    const existingLeads = await prisma.lead.findMany({
      where: {
        OR: validLeads.map((lead) => ({
          AND: [{ firstName: lead.firstName.trim() }, { lastName: lead.lastName.trim() }],
        })),
      },
    })

    const leadKeys = new Set(
      existingLeads.map((lead) => `${lead.firstName.toLowerCase()}_${(lead.lastName || '').toLowerCase()}`)
    )

    const uniqueLeads = validLeads.filter((lead) => {
      const key = `${lead.firstName.toLowerCase()}_${lead.lastName.toLowerCase()}`
      return !leadKeys.has(key)
    })

    let importedCount = 0
    let invalidCountryCodes = 0
    const errors: Array<{ lead: any; error: string }> = []

    for (const lead of uniqueLeads) {
      try {
        const parsed = parseLeadFields(lead)
        if ('error' in parsed) {
          errors.push({ lead, error: parsed.error })
          continue
        }

        const sanitizedCountry = sanitizeCountryCode(lead.countryCode)
        if (lead.countryCode && !sanitizedCountry) {
          invalidCountryCodes++
        }

        await prisma.lead.create({
          data: {
            firstName: lead.firstName.trim(),
            lastName: lead.lastName.trim(),
            email: lead.email.trim(),
            jobTitle: lead.jobTitle ? lead.jobTitle.trim() : null,
            countryCode: sanitizedCountry,
            companyName: lead.companyName ? lead.companyName.trim() : null,
            ...parsed.data,
          },
        })
        importedCount++
      } catch (error) {
        errors.push({
          lead: lead,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      importedCount,
      duplicatesSkipped: validLeads.length - uniqueLeads.length,
      invalidLeads: leads.length - validLeads.length,
      invalidCountryCodes,
      errors,
    })
  } catch (error) {
    console.error('Error importing leads:', error)
    res.status(500).json({ error: 'Failed to import leads' })
  }
})

app.post('/leads/verify-emails', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: 'localhost:7233' })
    const client = new Client({ connection, namespace: 'default' })

    const results: Array<{ leadId: number; emailVerified: boolean }> = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    const settlements = await Promise.allSettled(
      leads.map(async (lead) => {
        const isVerified = Boolean(
          await client.workflow.execute(verifyEmailWorkflow, {
            taskQueue: 'myQueue',
            workflowId: `verify-email-${lead.id}-${Date.now()}`,
            args: [lead.email],
          }),
        )

        await prisma.lead.update({
          where: { id: lead.id },
          data: { emailVerified: isVerified },
        })

        return { leadId: lead.id, emailVerified: isVerified }
      }),
    )

    settlements.forEach((settlement, index) => {
      if (settlement.status === 'fulfilled') {
        results.push(settlement.value)
        return
      }
      const lead = leads[index]
      errors.push({
        leadId: lead.id,
        leadName: `${lead.firstName} ${lead.lastName}`.trim(),
        error: settlement.reason instanceof Error ? settlement.reason.message : 'Unknown error',
      })
    })

    await connection.close()

    res.json({ success: true, verifiedCount: results.length, results, errors })
  } catch (error) {
    console.error('Error verifying emails:', error)
    res.status(500).json({ error: 'Failed to verify emails' })
  }
})

function buildEnrichInput(lead: {
  id: number
  firstName: string
  lastName: string
  email: string
  jobTitle: string | null
  companyName: string | null
}): EnrichPhoneInput {
  return {
    leadId: lead.id,
    fullName: `${lead.firstName} ${lead.lastName}`.trim(),
    email: lead.email,
    jobTitle: lead.jobTitle,
    companyName: lead.companyName,
    // TODO: lead has no website field; fall back to companyName for now
    companyWebsite: lead.companyName,
  }
}

app.post('/leads/:id/enrich-phone', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) return res.status(404).json({ error: 'Lead not found' })

  const connection = await Connection.connect({ address: 'localhost:7233' })
  const client = new Client({ connection, namespace: 'default' })
  const workflowId = `enrich-phone-${id}`

  try {
    const handle = await client.workflow.start(enrichPhoneWorkflow, {
      taskQueue: 'myQueue',
      workflowId,
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
      args: [buildEnrichInput(lead)],
    })
    await prisma.lead.update({
      where: { id },
      data: { phoneEnrichmentStatus: 'in_progress', phoneEnrichmentUpdatedAt: new Date() },
    })
    res.json({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId, status: 'in_progress' })
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return res.status(409).json({ error: 'Enrichment already running', workflowId })
    }
    console.error('Error starting enrich-phone workflow:', err)
    res.status(500).json({ error: 'Failed to start enrichment' })
  } finally {
    await connection.close()
  }
})

app.get('/leads/:id/enrich-phone/status', async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      phoneNumber: true,
      phoneEnrichmentStatus: true,
      phoneEnrichmentProvider: true,
      phoneEnrichmentUpdatedAt: true,
    },
  })
  if (!lead) return res.status(404).json({ error: 'Lead not found' })
  res.json(lead)
})

app.listen(4000, () => {
  console.log('Express server is running on port 4000')
})

runTemporalWorker().catch((err) => {
  console.error(err)
  process.exit(1)
})
