/**
 * Global Live EOI operational health (admin). No secrets / connection strings.
 */

import { Features } from '../../config/features.js';
import { getPrismaClient } from '../prisma.js';
import { isMailConfigured } from '../../services/email/mailer.js';
import {
  GLOBAL_LIVE_EOI_CONSENT_VERSION,
} from './consentEvidence.js';
import { getEoiLegalReadiness, listLegalDocuments } from './legalRegistry.js';

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getEoiOperationalHealth() {
  const legal = getEoiLegalReadiness();
  const mailConfigured = isMailConfigured();
  const confirmationsEnabled = parseBool(process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATIONS, true);
  const smsEnabled = parseBool(process.env.ENABLE_GLOBAL_LIVE_EOI_CONFIRMATION_SMS, false);

  let databaseReady = false;
  let migrationProbe = 'unknown';
  try {
    const prisma = getPrismaClient();
    // Lightweight probe — table must exist after migrations.
    await prisma.globalLiveEoiRegistration.findFirst({ select: { id: true } });
    databaseReady = true;
    migrationProbe = 'ok';
  } catch (err) {
    databaseReady = false;
    migrationProbe = err?.code === 'P2021' ? 'missing_table' : 'error';
  }

  const masterEnabled = Features.globalLiveEoi.v1 === true;
  const eoiOpen = Features.globalLiveEoi.open === true;
  const applicationOperational = masterEnabled && databaseReady;
  const emailOperational = mailConfigured && confirmationsEnabled;

  return {
    ok: true,
    masterFlag: masterEnabled,
    eoiOpen,
    databaseReady,
    migrationProbe,
    emailProviderReady: mailConfigured,
    confirmationEmailEnabled: confirmationsEnabled,
    confirmationSmsEnabled: smsEnabled,
    legalReadiness: legal.legalReadiness,
    legalUnapproved: legal.unapproved,
    presentedLegalVersions: legal.presentedVersions,
    consentRegistryVersion: GLOBAL_LIVE_EOI_CONSENT_VERSION,
    adminUiAvailable: true,
    applicationOperational,
    emailOperational,
    broadcastingOperational: false,
    documents: listLegalDocuments().map((d) => ({
      key: d.key,
      version: d.version,
      status: d.status,
      route: d.route,
      locales: d.locales,
      effectiveAt: d.effectiveAt,
    })),
    // Explicit non-claims
    translationOperational: false,
    streamingOperational: false,
  };
}
