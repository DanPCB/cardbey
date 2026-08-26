/**
 * Seed / refresh UserIdentifier rows used by contact sync matching.
 * Never logs raw email/phone. Skips quietly when CONTACT_SYNC_HMAC_SECRET is unset
 * so profile updates do not fail in environments without contact sync.
 */

import {
  canonicalizeEmail,
  canonicalizePhoneE164,
  getContactSyncHashVersion,
  hmacIdentifier,
  isContactSyncHashConfigured,
} from './contactSyncHash.js';

/**
 * Upsert email match anchor for a user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, email?: string|null, emailVerified?: boolean }} user
 */
export async function syncUserEmailIdentifier(prisma, user) {
  if (!isContactSyncHashConfigured()) return { ok: true, skipped: true, reason: 'not_configured' };
  if (!user?.id || typeof user.email !== 'string') return { ok: true, seeded: false };
  const canon = canonicalizeEmail(user.email);
  if (!canon) return { ok: true, seeded: false };

  const hash = hmacIdentifier('email', canon);
  const hv = getContactSyncHashVersion();
  await prisma.userIdentifier.upsert({
    where: { kind_hash_hashVersion: { kind: 'email', hash, hashVersion: hv } },
    create: {
      userId: user.id,
      kind: 'email',
      hash,
      hashVersion: hv,
      source: 'email',
      verifiedAt: user.emailVerified ? new Date() : null,
    },
    update: {
      userId: user.id,
      verifiedAt: user.emailVerified ? new Date() : undefined,
    },
  });
  return { ok: true, seeded: true };
}

/**
 * Replace profile-sourced phone match anchors for a user.
 * Non-E.164 phones clear prior profile phone hashes and do not seed.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ userId: string, phone?: string|null }} args
 */
export async function syncUserPhoneIdentifier(prisma, { userId, phone }) {
  if (!isContactSyncHashConfigured()) return { ok: true, skipped: true, reason: 'not_configured' };
  if (!userId) return { ok: false, error: 'userId required' };

  await prisma.userIdentifier.deleteMany({
    where: { userId, kind: 'phone', source: 'profile' },
  });

  if (phone == null || phone === '') {
    return { ok: true, seeded: false, cleared: true };
  }

  const canon = canonicalizePhoneE164(typeof phone === 'string' ? phone : String(phone));
  if (!canon) {
    return { ok: true, seeded: false, reason: 'not_e164' };
  }

  const hash = hmacIdentifier('phone', canon);
  const hv = getContactSyncHashVersion();
  await prisma.userIdentifier.upsert({
    where: { kind_hash_hashVersion: { kind: 'phone', hash, hashVersion: hv } },
    create: {
      userId,
      kind: 'phone',
      hash,
      hashVersion: hv,
      source: 'profile',
      verifiedAt: null,
    },
    update: {
      userId,
      source: 'profile',
    },
  });
  return { ok: true, seeded: true };
}

/**
 * Seed both email and (when E.164) phone identifiers — used on contact-sync session create.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, email?: string|null, emailVerified?: boolean, phone?: string|null }} user
 */
export async function syncUserMatchIdentifiers(prisma, user) {
  const email = await syncUserEmailIdentifier(prisma, user);
  const phone = await syncUserPhoneIdentifier(prisma, {
    userId: user.id,
    phone: user.phone ?? null,
  });
  return { email, phone };
}
