/**
 * Business Growth Center service — store-scoped CRM for business owners.
 * Strictly separated from executive/platform acquisition data.
 */

import { getPrismaClient } from '../prisma.js';
import { sendMail } from '../../services/email/mailer.js';
import {
  isValidEmail,
  normalizeEmail,
  parseStoreCustomerCsv,
  renderEmailTemplate,
  STORE_OUTREACH_TEMPLATES,
  trim,
} from '../crm/crmEngine.js';

export type StoreCustomerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  consentStatus?: string | null;
  status?: string | null;
};

export function validateStoreCustomerInput(input: StoreCustomerInput): {
  ok: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!trim(input.name)) errors.push('Customer name is required');
  const email = normalizeEmail(input.email);
  if (email && !isValidEmail(email)) errors.push('Invalid email format');
  if (email && input.consentStatus !== 'granted') {
    warnings.push('Consent not confirmed — outreach may be restricted');
  }
  return { ok: errors.length === 0, warnings, errors };
}

async function logActivity(
  leadId: string,
  storeId: string,
  ownerId: string,
  type: string,
  message: string,
  createdBy: string | null,
  metadata?: Record<string, unknown>,
) {
  const prisma = getPrismaClient();
  await prisma.storeLeadActivity.create({
    data: {
      leadId,
      storeId,
      ownerId,
      type,
      message,
      createdBy,
      metadata: metadata ?? undefined,
    },
  });
}

export async function buildStoreGrowthSummary(storeId: string, ownerId: string) {
  const prisma = getPrismaClient();
  const baseWhere = { storeId, ownerId };

  const [
    totalLeads,
    contacted,
    interested,
    repeatCustomers,
    offersSentAgg,
    followUpsDue,
    campaigns,
  ] = await Promise.all([
    prisma.businessLead.count({ where: baseWhere }),
    prisma.businessLead.count({ where: { ...baseWhere, status: 'contacted' } }),
    prisma.businessLead.count({ where: { ...baseWhere, status: 'interested' } }),
    prisma.businessLead.count({ where: { ...baseWhere, status: 'repeat' } }),
    prisma.storeOutreachCampaign.aggregate({
      where: { storeId, ownerId },
      _sum: { sentCount: true },
    }),
    prisma.businessLead.count({
      where: {
        ...baseWhere,
        followUpDueAt: { lte: new Date() },
        status: { notIn: ['unsubscribed'] },
      },
    }),
    prisma.storeOutreachCampaign.findMany({
      where: { storeId, ownerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const visitSum = await prisma.businessLead.aggregate({
    where: baseWhere,
    _sum: { visitCount: true },
  });

  return {
    totalLeads,
    customersContacted: contacted,
    interestedCustomers: interested,
    storeVisitsFromCampaigns: visitSum._sum.visitCount ?? 0,
    offersSent: offersSentAgg._sum.sentCount ?? 0,
    repeatCustomers,
    followUpsDue,
    recentCampaigns: campaigns,
  };
}

export async function listStoreLeads(
  storeId: string,
  ownerId: string,
  filters: Record<string, string | undefined> = {},
) {
  const prisma = getPrismaClient();
  const where: Record<string, unknown> = { storeId, ownerId };
  if (filters.status) where.status = filters.status;
  if (filters.missingEmail === 'true') where.email = null;
  if (filters.followUpDue === 'true') {
    where.followUpDueAt = { lte: new Date() };
  }

  return prisma.businessLead.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Number(filters.limit) || 100, 500),
  });
}

export async function listStoreLeadActivities(storeId: string, ownerId: string, limit = 50) {
  const prisma = getPrismaClient();
  return prisma.storeLeadActivity.findMany({
    where: { storeId, ownerId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { lead: { select: { id: true, name: true, email: true } } },
  });
}

export async function importStoreCustomers(
  storeId: string,
  ownerId: string,
  customers: StoreCustomerInput[],
  opts: { source?: string; createdBy?: string | null; skipDuplicates?: boolean },
) {
  const prisma = getPrismaClient();
  const results: Array<{
    index: number;
    ok: boolean;
    leadId?: string;
    warnings: string[];
    errors: string[];
    duplicate?: boolean;
  }> = [];

  for (let i = 0; i < customers.length; i++) {
    const raw = customers[i]!;
    const validation = validateStoreCustomerInput(raw);
    if (!validation.ok) {
      results.push({ index: i, ok: false, warnings: validation.warnings, errors: validation.errors });
      continue;
    }

    const email = normalizeEmail(raw.email);
    if (email && opts.skipDuplicates !== false) {
      const existing = await prisma.businessLead.findFirst({
        where: { storeId, email },
      });
      if (existing) {
        results.push({
          index: i,
          ok: false,
          duplicate: true,
          warnings: validation.warnings,
          errors: ['Duplicate email for this store'],
        });
        continue;
      }
    }

    const created = await prisma.businessLead.create({
      data: {
        ownerId,
        storeId,
        spaceId: storeId,
        name: raw.name.trim(),
        email,
        phone: trim(raw.phone),
        source: trim(raw.source) ?? trim(opts.source) ?? 'import',
        tags: raw.tags?.length ? raw.tags : undefined,
        notes: trim(raw.notes),
        consentStatus: trim(raw.consentStatus) ?? 'unknown',
        status: trim(raw.status) ?? 'new',
      },
    });

    await logActivity(created.id, storeId, ownerId, 'import', 'Customer imported', opts.createdBy ?? ownerId);

    results.push({ index: i, ok: true, leadId: created.id, warnings: validation.warnings, errors: [] });
  }

  return { imported: results.filter((r) => r.ok).length, total: customers.length, results };
}

export async function updateStoreLead(
  storeId: string,
  ownerId: string,
  leadId: string,
  patch: Partial<StoreCustomerInput> & { status?: string; followUpDueAt?: string | null },
  actorId: string,
) {
  const prisma = getPrismaClient();
  const existing = await prisma.businessLead.findFirst({ where: { id: leadId, storeId, ownerId } });
  if (!existing) throw new Error('Lead not found');

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.email !== undefined) data.email = normalizeEmail(patch.email);
  if (patch.phone !== undefined) data.phone = patch.phone;
  if (patch.source !== undefined) data.source = patch.source;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.consentStatus !== undefined) data.consentStatus = patch.consentStatus;
  if (patch.status !== undefined) {
    data.status = patch.status;
    if (patch.status === 'interested') data.interestedAt = new Date();
  }
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.followUpDueAt !== undefined) {
    data.followUpDueAt = patch.followUpDueAt ? new Date(patch.followUpDueAt) : null;
  }

  const updated = await prisma.businessLead.update({ where: { id: leadId }, data });
  await logActivity(leadId, storeId, ownerId, 'status_change', 'Lead updated', actorId, patch as Record<string, unknown>);
  return updated;
}

export async function sendStoreOutreach(input: {
  storeId: string;
  ownerId: string;
  storeName: string;
  storeSlug: string | null;
  name: string;
  templateId: string;
  targetLeadIds: string[];
  offerSummary?: string | null;
  testEmail?: string | null;
  confirmed?: boolean;
  customBody?: string | null;
}) {
  if (input.targetLeadIds.length > 10 && !input.confirmed && !input.testEmail) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: 'Bulk email send over 10 requires explicit confirmation',
    };
  }

  const prisma = getPrismaClient();
  const template = STORE_OUTREACH_TEMPLATES[input.templateId] ?? STORE_OUTREACH_TEMPLATES.store_invite;
  const bodyTemplate = input.customBody?.trim() || template.body;
  const storePageUrl = input.storeSlug
    ? `https://cardbey.com/s/${encodeURIComponent(input.storeSlug)}`
    : `https://cardbey.com/space/${encodeURIComponent(input.storeId)}`;

  const campaign = await prisma.storeOutreachCampaign.create({
    data: {
      ownerId: input.ownerId,
      storeId: input.storeId,
      name: input.name.trim(),
      templateId: input.templateId,
      templateBody: bodyTemplate,
      targetLeadIds: input.targetLeadIds,
      status: 'sending',
    },
  });

  let sentCount = 0;
  let failedCount = 0;

  const leads = input.testEmail
    ? [{ id: 'test', name: 'Test Customer', email: input.testEmail, status: 'new', consentStatus: 'granted' }]
    : await prisma.businessLead.findMany({
        where: { id: { in: input.targetLeadIds }, storeId: input.storeId, ownerId: input.ownerId },
      });

  for (const lead of leads) {
    if (!input.testEmail) {
      if (lead.status === 'unsubscribed' || lead.consentStatus === 'denied') {
        failedCount++;
        continue;
      }
      const email = normalizeEmail(lead.email);
      if (!email || !isValidEmail(email)) {
        failedCount++;
        continue;
      }
    }

    const email = input.testEmail ?? normalizeEmail(lead.email)!;
    const vars = {
      customerName: lead.name ?? 'there',
      storeName: input.storeName,
      storePageUrl,
      offerSummary: input.offerSummary ?? 'Check out our latest offer',
      unsubscribeUrl: `https://cardbey.com/unsubscribe?lead=${lead.id}&store=${input.storeId}`,
    };

    const html = renderEmailTemplate(bodyTemplate, vars);
    const subject = renderEmailTemplate(template.subject, vars);
    const mailResult = await sendMail({ to: email, subject, html });

    if (mailResult.ok) {
      sentCount++;
      if (!input.testEmail && lead.id !== 'test') {
        await prisma.businessLead.update({
          where: { id: lead.id },
          data: { status: 'contacted', lastContactedAt: new Date() },
        });
        await logActivity(
          lead.id,
          input.storeId,
          input.ownerId,
          'email_sent',
          `Outreach sent: ${input.templateId}`,
          input.ownerId,
          { campaignId: campaign.id },
        );
      }
    } else {
      failedCount++;
    }
  }

  const updated = await prisma.storeOutreachCampaign.update({
    where: { id: campaign.id },
    data: {
      status: sentCount > 0 ? 'sent' : 'failed',
      sentCount,
      failedCount,
      completedAt: new Date(),
    },
  });

  return { ok: true, campaign: updated, sentCount, failedCount };
}

export { parseStoreCustomerCsv };
