/**
 * CapabilityApplicabilityEvaluator — explicit reasons, never silent hide.
 */

import { Features } from '../../config/features.js';
import { APPLICABILITY, CAPABILITY_STATUS, INSTALL_STATUS } from './capabilityTypes.js';
import { createCapabilityRepository } from './capabilityRepository.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function evaluateCapabilityApplicability(prisma, input = {}) {
  const repo = createCapabilityRepository(prisma);
  const reasons = [];
  const missingInputs = [];

  if (!Features.capabilityEngine?.v1 && !input.force) {
    return {
      result: APPLICABILITY.BLOCKED,
      reasons: [{ code: 'FEATURE_DISABLED', message: 'ENABLE_CAPABILITY_ENGINE_V1 is off' }],
      missingInputs: [],
    };
  }
  if (!Features.capabilityEngine?.applicationV1 && !input.force) {
    return {
      result: APPLICABILITY.BLOCKED,
      reasons: [{ code: 'APPLICATION_DISABLED', message: 'ENABLE_CAPABILITY_APPLICATION_V1 is off' }],
      missingInputs: [],
    };
  }

  const version = await repo.getVersion(input.capabilityVersionId);
  if (!version) {
    return {
      result: APPLICABILITY.NOT_APPLICABLE,
      reasons: [{ code: 'VERSION_NOT_FOUND' }],
      missingInputs: [],
    };
  }
  const capability = await repo.getById(version.capabilityId);
  if (!capability || capability.status !== CAPABILITY_STATUS.PUBLISHED) {
    reasons.push({ code: 'CAPABILITY_NOT_PUBLISHED' });
  }
  if (version.status !== 'PUBLISHED') {
    reasons.push({ code: 'VERSION_NOT_PUBLISHED' });
  }

  const compat = version.compatibilityDefinition || {};
  const targetType = String(input.targetType || '');
  const allowedTargets = Array.isArray(compat.targetTypes) ? compat.targetTypes : ['DRAFT_STORE'];
  if (!allowedTargets.includes(targetType)) {
    reasons.push({
      code: 'INCOMPATIBLE_TARGET_TYPE',
      message: `Expected one of ${allowedTargets.join(', ')}`,
      targetType,
    });
  }

  const targetId = String(input.targetId || '').trim();
  if (!targetId) {
    reasons.push({ code: 'TARGET_REQUIRED' });
  }

  let target = null;
  if (targetType === 'DRAFT_STORE' && targetId) {
    target = await prisma.draftStore.findUnique({ where: { id: targetId } });
    if (!target) {
      reasons.push({ code: 'TARGET_NOT_FOUND' });
    } else {
      if (['committed', 'abandoned'].includes(String(target.status))) {
        reasons.push({ code: 'TARGET_LIFECYCLE_BLOCKED', status: target.status });
      }
      const actor = input.actorUserId ? String(input.actorUserId) : null;
      if (actor && target.ownerUserId && target.ownerUserId !== actor && !input.isAdmin) {
        reasons.push({ code: 'TARGET_OWNERSHIP_DENIED' });
      }
    }
  }

  const active = await repo.listInstallations({
    capabilityId: version.capabilityId,
    targetType,
    targetId,
    status: INSTALL_STATUS.INSTALLED,
  });
  if (active.length > 0 && !input.allowReinstall) {
    reasons.push({
      code: 'CONFLICTING_INSTALLATION',
      installationId: active[0].id,
    });
  }

  const schema = Array.isArray(version.inputSchema) ? version.inputSchema : [];
  const provided = input.inputs && typeof input.inputs === 'object' ? input.inputs : {};
  for (const field of schema) {
    if (!field.required) continue;
    const val = provided[field.key];
    if (val == null || val === '') {
      missingInputs.push({
        key: field.key,
        label: field.label || field.key,
        type: field.type,
      });
    }
  }

  if (reasons.some((r) => ['TARGET_OWNERSHIP_DENIED', 'FEATURE_DISABLED'].includes(r.code))) {
    return { result: APPLICABILITY.BLOCKED, reasons, missingInputs, capability, version, target };
  }
  if (reasons.length > 0) {
    return {
      result: APPLICABILITY.NOT_APPLICABLE,
      reasons,
      missingInputs,
      capability,
      version,
      target,
    };
  }
  if (missingInputs.length > 0) {
    return {
      result: APPLICABILITY.APPLICABLE_WITH_INPUTS,
      reasons: [],
      missingInputs,
      capability,
      version,
      target,
    };
  }
  return {
    result: APPLICABILITY.APPLICABLE,
    reasons: [],
    missingInputs: [],
    capability,
    version,
    target,
  };
}
