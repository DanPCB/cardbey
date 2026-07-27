/**
 * Re-run entity resolution against live Business records before activation (V1.2).
 */

import { getPrismaClient } from '../prisma.js';
import { matchEntities } from './EntityResolver.js';
import type { IngestedSeedRecord } from './types.js';

export interface LiveDuplicateResult {
  blocked: boolean;
  matchedBusinessId: string | null;
  evidence: Array<{ field: string; signal: string; score: number }>;
}

export async function findLiveBusinessDuplicate(
  seed: IngestedSeedRecord,
  excludeStoreId?: string | null,
): Promise<LiveDuplicateResult> {
  const prisma = getPrismaClient();
  const n = seed.normalized;
  const or: Array<Record<string, string>> = [];
  if (n.phone) or.push({ phone: n.phone });
  if (n.website) or.push({ websiteUrl: n.website });
  if (n.email) or.push({ email: n.email });

  let candidates: Array<{
    id: string;
    name: string;
    phone: string | null;
    websiteUrl: string | null;
    address: string | null;
  }> = [];

  if (or.length) {
    candidates = await prisma.business.findMany({
      where: { OR: or },
      select: { id: true, name: true, phone: true, websiteUrl: true, address: true },
      take: 50,
    });
  }

  if (n.businessName) {
    const byName = await prisma.business.findMany({
      where: { name: { contains: n.businessName.slice(0, 20) } },
      select: { id: true, name: true, phone: true, websiteUrl: true, address: true },
      take: 30,
    });
    const seen = new Set(candidates.map((c) => c.id));
    for (const row of byName) {
      if (!seen.has(row.id)) candidates.push(row);
    }
  }

  const incoming = {
    id: seed.id,
    businessName: n.businessName,
    phone: n.phone,
    website: n.website,
    registrationNumber: n.registrationNumber,
    address: n.address,
  };

  for (const biz of candidates) {
    if (excludeStoreId && biz.id === excludeStoreId) continue;
    const match = matchEntities(incoming, {
      id: biz.id,
      businessName: biz.name,
      phone: biz.phone,
      website: biz.websiteUrl,
      registrationNumber: null,
      address: biz.address,
    });
    if (match.matched && (match.status === 'duplicate' || match.score >= 0.6)) {
      return {
        blocked: true,
        matchedBusinessId: biz.id,
        evidence: match.evidence,
      };
    }
  }

  return { blocked: false, matchedBusinessId: null, evidence: [] };
}
