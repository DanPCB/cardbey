/**
 * Stage 5A — owner language settings, readiness, review, preview; admin pilot enroll.
 */

import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import {
  isLanguageStorefrontOwnerControlsV1Enabled,
  isLanguageTranslationReadinessV1Enabled,
  isLanguageTranslationApprovalV1Enabled,
  isLanguageStorefrontPilotEnrollmentV1Enabled,
  isLanguageStorefrontPilotDiagnosticsV1Enabled,
  getStorefrontLanguagePolicyFromBusiness,
  setBusinessLocalePreference,
  getTranslationMetaMap,
  upsertTranslationMeta,
  fingerprintSourceText,
  translationMetaKey,
  evaluateTranslationReadiness,
  buildStorefrontLanguageSettingsView,
  validateStorefrontLanguagePilot,
  getStorefrontPilotState,
  setStorefrontPilotState,
  applyStorefrontConsumptionCutover,
  attachStorefrontLocalizationMeta,
  emitStorefrontCutoverTelemetry,
  listLanguages,
  normalizeLanguageCode,
} from '../../lib/languageIntelligence/index.js';

const router = express.Router();

async function assertStoreOwner(storeId, userId) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true },
  });
  if (!store) return { error: 'store_not_found', status: 404 };
  if (store.userId !== userId) return { error: 'access_denied', status: 403 };
  return { store };
}

async function assertPlatformAdmin(req) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, role: true, roles: true },
  });
  if (!user) return false;
  const roles = typeof user.roles === 'string' ? user.roles : JSON.stringify(user.roles || []);
  return (
    user.role === 'platform_admin' ||
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    roles.includes('platform_admin') ||
    roles.includes('super_admin')
  );
}

async function loadStoreBundle(storeId) {
  return prisma.business.findUnique({
    where: { id: storeId },
    include: {
      products: {
        where: { isPublished: true },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          translations: true,
          updatedAt: true,
        },
      },
    },
  });
}

router.get(
  '/language-intelligence/business/:storeId/language-settings',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontOwnerControlsV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'owner_controls_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });

      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });

      const policy = getStorefrontLanguagePolicyFromBusiness(business);
      const pilot = await getStorefrontPilotState(business.id);
      const metaMap = await getTranslationMetaMap(business.id);

      // Refresh stale markers (best-effort)
      if (isLanguageTranslationReadinessV1Enabled()) {
        const sources = [
          {
            key: translationMetaKey({
              entityType: 'store',
              lang: policy.canonicalLanguage,
              field: 'name',
            }),
            sourceText: business.name,
          },
        ];
        // rebuild sources for target langs below in readiness
        void sources;
      }

      const view = buildStorefrontLanguageSettingsView({
        policy,
        pilot,
        business,
        products: business.products,
        metaMap,
      });
      const registry = listLanguages().map((l) => ({ id: l.id, name: l.name }));

      res.json({
        ok: true,
        settings: view,
        supportedRegistry: registry,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/language-intelligence/business/:storeId/language-settings',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontOwnerControlsV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'owner_controls_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });

      const body = req.body || {};
      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });
      const current = getStorefrontLanguagePolicyFromBusiness(business);

      /** @type {Record<string, unknown>} */
      const policyPatch = {};
      if (typeof body.publicLocalizationEnabled === 'boolean') {
        if (
          body.publicLocalizationEnabled === true &&
          !(body.supportedDisplayLanguages || current.supportedDisplayLanguages).some(
            (l) => normalizeLanguageCode(l) && normalizeLanguageCode(l) !== current.canonicalLanguage,
          )
        ) {
          return res.status(400).json({
            ok: false,
            error: 'supported_language_required',
            message: 'Enable localization only when at least one non-canonical display language is selected',
          });
        }
        policyPatch.publicLocalizationEnabled = body.publicLocalizationEnabled;
        if (body.publicLocalizationEnabled) {
          policyPatch.translationPolicy = 'existing_translations_only';
        } else {
          policyPatch.translationPolicy = 'original_only';
        }
      }
      if (Array.isArray(body.supportedDisplayLanguages)) {
        const langs = body.supportedDisplayLanguages
          .map((x) => normalizeLanguageCode(x))
          .filter(Boolean);
        if (!langs.includes(current.canonicalLanguage)) langs.unshift(current.canonicalLanguage);
        const registry = new Set(listLanguages().map((l) => l.id));
        for (const l of langs) {
          if (!registry.has(l)) {
            return res.status(400).json({ ok: false, error: 'unsupported_language', language: l });
          }
        }
        policyPatch.supportedDisplayLanguages = langs;
      }
      if (
        body.defaultDisplayMode === 'original' ||
        body.defaultDisplayMode === 'translated' ||
        body.defaultDisplayMode === 'both'
      ) {
        policyPatch.defaultDisplayMode = body.defaultDisplayMode;
      }
      if (
        body.translationPolicy === 'original_only' ||
        body.translationPolicy === 'existing_translations_only'
      ) {
        policyPatch.translationPolicy = body.translationPolicy;
      }

      const preference = await setBusinessLocalePreference(req.params.storeId, {
        storefrontLanguagePolicy: { ...current, ...policyPatch },
      });

      emitStorefrontCutoverTelemetry('language.storefront.policy_updated', {
        storeId: req.params.storeId,
        featureEnabled: true,
        source: 'owner_settings',
      });

      res.json({ ok: true, preference });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/language-intelligence/business/:storeId/language-readiness',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageTranslationReadinessV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'readiness_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });
      const policy = getStorefrontLanguagePolicyFromBusiness(business);
      const metaMap = await getTranslationMetaMap(business.id);
      const lang = normalizeLanguageCode(req.query.lang) || policy.supportedDisplayLanguages.find(
        (l) => l !== policy.canonicalLanguage,
      );
      if (!lang) return res.json({ ok: true, readiness: null });
      const readiness = evaluateTranslationReadiness({
        storeId: business.id,
        canonicalLanguage: policy.canonicalLanguage,
        targetLanguage: lang,
        business,
        products: business.products,
        metaMap,
      });
      res.json({ ok: true, readiness });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/language-intelligence/business/:storeId/language-validation',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageTranslationReadinessV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'readiness_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });
      const policy = getStorefrontLanguagePolicyFromBusiness(business);
      const pilot = await getStorefrontPilotState(business.id);
      const metaMap = await getTranslationMetaMap(business.id);
      const lang = normalizeLanguageCode(req.query.lang);
      if (!lang) return res.status(400).json({ ok: false, error: 'lang_required' });
      const validation = validateStorefrontLanguagePilot({
        policy,
        pilot,
        business,
        products: business.products,
        metaMap,
        targetLanguage: lang,
        storeIsActive: Boolean(business.isActive),
      });
      emitStorefrontCutoverTelemetry('language.storefront.validation_completed', {
        storeId: business.id,
        requestedLanguage: lang,
        featureEnabled: true,
        source: 'owner_validation',
      });
      res.json({ ok: true, validation });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/language-intelligence/business/:storeId/translations',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontOwnerControlsV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'owner_controls_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });
      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });
      const lang = normalizeLanguageCode(req.query.lang);
      if (!lang) return res.status(400).json({ ok: false, error: 'lang_required' });
      const metaMap = await getTranslationMetaMap(business.id);
      const policy = getStorefrontLanguagePolicyFromBusiness(business);

      const rows = [];
      for (const field of ['name', 'description']) {
        const original = business[field];
        const translated = business.translations?.[lang]?.[field] ?? null;
        const key = translationMetaKey({ entityType: 'store', lang, field });
        rows.push({
          id: key,
          entityType: 'store',
          entityId: business.id,
          field,
          original,
          translated,
          meta: metaMap[key] || { status: translated ? 'generated' : null },
          sourceFingerprint: fingerprintSourceText(original),
        });
      }
      for (const p of business.products || []) {
        for (const field of ['name', 'description', 'category']) {
          const original = p[field];
          const translated = p.translations?.[lang]?.[field] ?? null;
          const key = translationMetaKey({
            entityType: 'product',
            entityId: p.id,
            lang,
            field,
          });
          rows.push({
            id: key,
            entityType: 'product',
            entityId: p.id,
            field,
            original,
            translated,
            meta: metaMap[key] || { status: translated ? 'generated' : null },
            sourceFingerprint: fingerprintSourceText(original),
          });
        }
      }

      res.json({
        ok: true,
        language: lang,
        canonicalLanguage: policy.canonicalLanguage,
        rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/language-intelligence/business/:storeId/translations/review',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageTranslationApprovalV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'approval_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });

      const { translationId, status, rejectionReason, translatedText } = req.body || {};
      if (!translationId || typeof translationId !== 'string') {
        return res.status(400).json({ ok: false, error: 'translation_id_required' });
      }
      const allowed = ['approved', 'rejected', 'suppressed', 'needs_review', 'generated'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ ok: false, error: 'invalid_status' });
      }

      const parts = translationId.split(':');
      // entityType:entityId:lang:field
      if (parts.length < 4) {
        return res.status(400).json({ ok: false, error: 'invalid_translation_id' });
      }
      const [entityType, entityId, lang, field] = parts;
      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });

      let sourceText = null;
      let currentTranslated = null;
      if (entityType === 'store') {
        sourceText = business[field];
        currentTranslated = business.translations?.[lang]?.[field] ?? null;
      } else {
        const product = (business.products || []).find((p) => String(p.id) === String(entityId));
        if (!product) return res.status(404).json({ ok: false, error: 'product_not_found' });
        sourceText = product[field];
        currentTranslated = product.translations?.[lang]?.[field] ?? null;
      }

      const text = translatedText != null ? String(translatedText) : currentTranslated;
      if (status === 'approved') {
        if (text == null || String(text).trim() === '') {
          return res.status(400).json({ ok: false, error: 'empty_translation' });
        }
      }

      // Optional: write edited translation text into translations JSON only (never canonical)
      if (translatedText != null && typeof translatedText === 'string') {
        if (entityType === 'store') {
          const translations = {
            ...(business.translations && typeof business.translations === 'object'
              ? business.translations
              : {}),
          };
          translations[lang] = { ...(translations[lang] || {}), [field]: translatedText };
          await prisma.business.update({
            where: { id: business.id },
            data: { translations },
          });
        } else {
          const product = (business.products || []).find((p) => String(p.id) === String(entityId));
          const translations = {
            ...(product.translations && typeof product.translations === 'object'
              ? product.translations
              : {}),
          };
          translations[lang] = { ...(translations[lang] || {}), [field]: translatedText };
          await prisma.product.update({
            where: { id: product.id },
            data: { translations },
          });
        }
      }

      const meta = await upsertTranslationMeta(
        req.params.storeId,
        translationId,
        {
          status,
          rejectionReason: status === 'rejected' ? rejectionReason || null : null,
          sourceFingerprint: fingerprintSourceText(sourceText),
        },
        { actorUserId: req.userId },
      );

      emitStorefrontCutoverTelemetry(
        status === 'approved'
          ? 'language.translation.approved'
          : status === 'rejected'
            ? 'language.translation.rejected'
            : status === 'suppressed'
              ? 'language.translation.suppressed'
              : 'language.translation.review_opened',
        {
          storeId: req.params.storeId,
          requestedLanguage: lang,
          featureEnabled: true,
          source: 'owner_review',
        },
      );

      // Prove canonical unchanged
      const after = await prisma.business.findUnique({
        where: { id: business.id },
        select: { name: true, description: true },
      });

      res.json({
        ok: true,
        meta,
        canonicalPreserved: after.name === business.name && after.description === business.description,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/language-intelligence/business/:storeId/language-preview',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontOwnerControlsV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'owner_controls_disabled' });
      }
      const gate = await assertStoreOwner(req.params.storeId, req.userId);
      if (gate.error) return res.status(gate.status).json({ ok: false, error: gate.error });

      const business = await loadStoreBundle(req.params.storeId);
      if (!business) return res.status(404).json({ ok: false, error: 'store_not_found' });
      const lang = normalizeLanguageCode(req.body?.lang || req.body?.language);
      const displayMode = req.body?.displayMode || 'translated';
      if (!lang) return res.status(400).json({ ok: false, error: 'lang_required' });

      const { toPublicStore } = await import('../../utils/publicStoreMapper.js');
      const publicStore = toPublicStore(business, {});
      const metaMap = await getTranslationMetaMap(business.id);
      const cutover = applyStorefrontConsumptionCutover({
        publicStore,
        business,
        products: business.products,
        requestedLanguage: lang,
        displayMode,
        previewMode: true,
        force: true,
        forceApproval: isLanguageTranslationApprovalV1Enabled(),
        metaMap,
      });
      const withMeta = attachStorefrontLocalizationMeta(
        cutover.applied ? cutover.localizedStore : publicStore,
        cutover,
      );

      emitStorefrontCutoverTelemetry('language.storefront.preview_opened', {
        storeId: business.id,
        requestedLanguage: lang,
        displayMode,
        featureEnabled: true,
        source: 'owner_preview',
      });

      res.json({
        ok: true,
        preview: true,
        guestCookieWritten: false,
        store: withMeta,
        localization: withMeta.languageIntelligence?.storefrontLocalization || null,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/language-intelligence/admin/language-pilot/:storeId/enroll',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontPilotEnrollmentV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'pilot_enrollment_disabled' });
      }
      if (!(await assertPlatformAdmin(req))) {
        return res.status(403).json({ ok: false, error: 'admin_required' });
      }
      const pilot = await setStorefrontPilotState(req.params.storeId, {
        enrolled: true,
        paused: false,
        killSwitch: false,
        cohort: req.body?.cohort || 'selected_store',
        validationStatus: 'configured',
        publicTranslationConsumptionPolicy: 'approved_translations_only',
        actorUserId: req.userId,
      });
      emitStorefrontCutoverTelemetry('language.storefront.pilot_enrolled', {
        storeId: req.params.storeId,
        featureEnabled: true,
        source: 'admin',
      });
      res.json({ ok: true, pilot });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/language-intelligence/admin/language-pilot/:storeId/pause',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontPilotEnrollmentV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'pilot_enrollment_disabled' });
      }
      if (!(await assertPlatformAdmin(req))) {
        return res.status(403).json({ ok: false, error: 'admin_required' });
      }
      const pilot = await setStorefrontPilotState(req.params.storeId, {
        paused: true,
        validationStatus: 'paused',
        killSwitch: req.body?.killSwitch === true,
      });
      emitStorefrontCutoverTelemetry('language.storefront.pilot_paused', {
        storeId: req.params.storeId,
        featureEnabled: true,
        source: 'admin',
      });
      res.json({ ok: true, pilot });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/language-intelligence/admin/language-pilot/diagnostics',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isLanguageStorefrontPilotDiagnosticsV1Enabled()) {
        return res.status(503).json({ ok: false, error: 'diagnostics_disabled' });
      }
      if (!(await assertPlatformAdmin(req))) {
        return res.status(403).json({ ok: false, error: 'admin_required' });
      }
      // Minimal: recent cutover telemetry + flag snapshot
      const { getLanguageIntelligenceDiagnostics, listStorefrontCutoverTelemetry } = await import(
        '../../lib/languageIntelligence/index.js'
      );
      res.json({
        ok: true,
        diagnostics: getLanguageIntelligenceDiagnostics(),
        recentEvents: listStorefrontCutoverTelemetry(50),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
