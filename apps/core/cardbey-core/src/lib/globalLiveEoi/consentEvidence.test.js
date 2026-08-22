/**
 * Consent evidence + legal registry unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  GLOBAL_LIVE_EOI_CONSENT_VERSION,
  buildServerConsentEvidence,
  getCanonicalConsentText,
  hashConsentText,
  resolveConsentLocale,
  toConsentEvidenceDto,
} from './consentEvidence.js';
import { getEoiLegalReadiness, listLegalDocuments } from './legalRegistry.js';
import { generateEoiPublicReference } from './publicReference.js';
import { buildEoiConfirmationEmail } from './confirmationEmailTemplates.js';

describe('consentEvidence', () => {
  it('resolves locale and hashes canonical text', () => {
    expect(resolveConsentLocale('vi-VN')).toBe('vi');
    expect(resolveConsentLocale('en')).toBe('en');
    const text = getCanonicalConsentText('en');
    expect(hashConsentText(text)).toHaveLength(64);
    expect(hashConsentText(text)).toBe(hashConsentText(text));
  });

  it('builds server evidence ignoring client fields', () => {
    const evidence = buildServerConsentEvidence({ language: 'vi' });
    expect(evidence.consentVersion).toBe(GLOBAL_LIVE_EOI_CONSENT_VERSION);
    expect(evidence.consentLocale).toBe('vi');
    expect(evidence.consentContext).toBe('GLOBAL_LIVE_EOI');
    expect(evidence.consentTextHash).toBe(hashConsentText(getCanonicalConsentText('vi')));
    expect(evidence.termsVersion).toContain('draft');
    expect(evidence.privacyVersion).toContain('draft');
  });

  it('labels legacy rows as unversioned', () => {
    const dto = toConsentEvidenceDto({
      consentGranted: true,
      consentAt: new Date('2026-01-01'),
    });
    expect(dto.versioned).toBe(false);
    expect(dto.label).toBe('legacy_unversioned');
  });
});

describe('legalRegistry', () => {
  it('reports DRAFT readiness while documents are draft', () => {
    const readiness = getEoiLegalReadiness();
    expect(readiness.legalReadiness).toBe('DRAFT');
    expect(readiness.unapproved).toContain('PLATFORM_TERMS');
    expect(readiness.unapproved).toContain('PRIVACY_POLICY');
    const docs = listLegalDocuments();
    expect(docs.every((d) => d.route && d.locales?.length)).toBe(true);
  });
});

describe('publicReference', () => {
  it('generates opaque unique-looking refs', () => {
    const a = generateEoiPublicReference();
    const b = generateEoiPublicReference();
    expect(a).toMatch(/^GL[0-9a-z]{10}$/);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/@/);
  });
});

describe('confirmationEmailTemplates', () => {
  it('renders EN receipt without Track CTA when tracking off', () => {
    const mail = buildEoiConfirmationEmail({
      name: 'Lan <script>',
      businessName: 'Cafe & Co',
      language: 'en',
      publicReference: 'GLtestdemo01',
      showcaseTypes: ['services'],
      hasLinkedBusiness: false,
    });
    expect(mail.subject.toLowerCase()).toContain('received');
    expect(mail.html).toMatch(/Received|Đã nhận|Status/i);
    expect(mail.html).toMatch(/does not guarantee selection|không đảm bảo/i);
    expect(mail.primaryCtaLabel).toMatch(/Create your Cardbey account to prepare your business/i);
    expect(mail.html).not.toMatch(/Track your application/i);
    expect(mail.html).toContain('&amp;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('GLtestdemo01');
  });

  it('renders VI linked-business CTA', () => {
    const mail = buildEoiConfirmationEmail({
      name: 'Creator',
      businessName: 'CAPITAL',
      language: 'vi',
      publicReference: 'GLvi00000001',
      hasLinkedBusiness: true,
    });
    expect(mail.subject).toMatch(/nhận/i);
    expect(mail.primaryCtaLabel).toMatch(/Cập nhật doanh nghiệp/i);
    expect(mail.html).toMatch(/Đã nhận|Trạng thái/i);
  });
});
