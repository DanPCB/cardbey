/**
 * Preview-first capability planning, execution, and rollback.
 */

import { evaluateCapabilityApplicability } from './applicabilityEvaluator.js';
import { evaluateCapabilityRights } from './rightsEvaluator.js';
import { createCapabilityRepository } from './capabilityRepository.js';
import { describeAdapterPlan, runAdapter } from './adapters.js';
import { INSTALL_STATUS, isAllowedAdapter } from './capabilityTypes.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function planCapabilityApplication(prisma, input = {}) {
  const repo = createCapabilityRepository(prisma);
  const applicability = await evaluateCapabilityApplicability(prisma, input);
  if (
    applicability.result === 'BLOCKED' ||
    applicability.result === 'NOT_APPLICABLE'
  ) {
    return { ok: false, stage: 'applicability', applicability };
  }

  const version = applicability.version;
  const components = await repo.listComponents(version.id);
  const rights = await evaluateCapabilityRights(prisma, version, components);
  if (!rights.ok) {
    return {
      ok: false,
      stage: 'rights',
      applicability,
      rights,
      error: 'rights_conflict',
    };
  }

  const steps = Array.isArray(version.executionDefinition?.steps)
    ? version.executionDefinition.steps
    : [];
  for (const step of steps) {
    if (!isAllowedAdapter(step.adapterKey)) {
      return {
        ok: false,
        stage: 'execution_definition',
        error: 'unsupported_action_type',
        adapterKey: step.adapterKey,
      };
    }
  }

  const inputs = input.inputs || {};
  const planSteps = steps.map((step) => describeAdapterPlan(step.adapterKey, step, inputs));
  const plan = {
    capabilityId: version.capabilityId,
    capabilityVersionId: version.id,
    targetType: input.targetType,
    targetId: input.targetId,
    applicability: applicability.result,
    missingInputs: applicability.missingInputs,
    rights,
    steps: planSteps,
    permissionsRequired: ['draft_store:update_owned'],
    conflicts: applicability.reasons.filter((r) => r.code === 'CONFLICTING_INSTALLATION'),
    irreversibleSteps: planSteps.filter((s) => s.irreversible),
    rollbackAvailable: planSteps.every((s) => s.rollbackAvailable !== false),
    mutatesTarget: false,
    note: 'Plan only — no mutations until confirm+execute',
  };

  const installation = await repo.insertInstallation({
    capabilityId: version.capabilityId,
    capabilityVersionId: version.id,
    targetType: input.targetType,
    targetId: input.targetId,
    installedByUserId: input.actorUserId || null,
    status:
      applicability.result === 'APPLICABLE_WITH_INPUTS'
        ? INSTALL_STATUS.PLANNED
        : INSTALL_STATUS.AWAITING_CONFIRMATION,
    inputSnapshot: inputs,
    executionPlanSnapshot: plan,
  });

  await repo.insertEvent({
    installationId: installation.id,
    eventType: 'PLAN_CREATED',
    status: 'OK',
    afterReference: { planStepCount: planSteps.length },
  });

  return {
    ok: true,
    installationId: installation.id,
    plan,
    applicability,
    capability: applicability.capability,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function executeCapabilityApplication(prisma, input = {}) {
  const repo = createCapabilityRepository(prisma);
  if (!input.confirm) {
    return { ok: false, error: 'confirmation_required' };
  }
  const installation = await repo.getInstallation(input.installationId);
  if (!installation) return { ok: false, error: 'installation_not_found' };
  if (
    ![INSTALL_STATUS.AWAITING_CONFIRMATION, INSTALL_STATUS.PLANNED].includes(installation.status)
  ) {
    return { ok: false, error: 'installation_not_executable', status: installation.status };
  }

  // Idempotency: if already installed, return
  const existing = await repo.listInstallations({
    capabilityId: installation.capabilityId,
    targetType: installation.targetType,
    targetId: installation.targetId,
    status: INSTALL_STATUS.INSTALLED,
  });
  if (existing.length > 0 && existing[0].id !== installation.id) {
    return { ok: false, error: 'already_installed', installationId: existing[0].id };
  }

  const reeval = await evaluateCapabilityApplicability(prisma, {
    capabilityVersionId: installation.capabilityVersionId,
    targetType: installation.targetType,
    targetId: installation.targetId,
    actorUserId: input.actorUserId || installation.installedByUserId,
    inputs: input.inputs || installation.inputSnapshot || {},
    allowReinstall: false,
    force: input.force,
    isAdmin: input.isAdmin,
  });
  if (reeval.result !== 'APPLICABLE' && reeval.result !== 'APPLICABLE_WITH_INPUTS') {
    return { ok: false, error: 'no_longer_applicable', applicability: reeval };
  }
  if (reeval.result === 'APPLICABLE_WITH_INPUTS') {
    return { ok: false, error: 'missing_inputs', missingInputs: reeval.missingInputs };
  }

  const version = await repo.getVersion(installation.capabilityVersionId);
  const target = reeval.target;
  const beforeSnapshot = {
    draftStore: target
      ? {
          id: target.id,
          input: target.input,
          preview: target.preview,
          status: target.status,
        }
      : null,
  };

  await repo.updateInstallation(installation.id, {
    status: INSTALL_STATUS.RUNNING,
    beforeSnapshot,
    inputSnapshot: input.inputs || installation.inputSnapshot,
  });
  await repo.insertEvent({
    installationId: installation.id,
    eventType: 'EXECUTION_STARTED',
    status: 'OK',
  });

  const steps = Array.isArray(version.executionDefinition?.steps)
    ? version.executionDefinition.steps
    : [];
  const results = [];
  const created = [];
  let failed = null;

  for (const step of steps) {
    if (step.adapterKey === 'request_user_confirmation') {
      await repo.insertEvent({
        installationId: installation.id,
        stepId: step.id,
        eventType: 'STEP_SKIPPED',
        status: 'OK',
        afterReference: { reason: 'already_confirmed' },
      });
      continue;
    }
    const freshTarget = await prisma.draftStore.findUnique({ where: { id: installation.targetId } });
    const outcome = await runAdapter(step.adapterKey, {
      prisma,
      target: freshTarget,
      step,
      inputs: input.inputs || installation.inputSnapshot || {},
      installationId: installation.id,
    });
    results.push({ stepId: step.id, adapterKey: step.adapterKey, outcome });
    if (outcome.created) created.push(...outcome.created);
    await repo.insertEvent({
      installationId: installation.id,
      stepId: step.id,
      eventType: outcome.ok ? 'STEP_COMPLETED' : 'STEP_FAILED',
      status: outcome.ok ? 'OK' : 'FAILED',
      afterReference: outcome,
      errorCode: outcome.error || null,
    });
    if (!outcome.ok) {
      failed = { step, outcome };
      if ((step.failurePolicy || 'STOP') === 'STOP' || step.failurePolicy === 'ROLLBACK_ALL') {
        break;
      }
    }
  }

  if (failed) {
    if (failed.step.failurePolicy === 'ROLLBACK_ALL') {
      await rollbackCapabilityInstallation(prisma, {
        installationId: installation.id,
        actorUserId: input.actorUserId,
        reason: 'failure_policy_rollback_all',
      });
    } else {
      await repo.updateInstallation(installation.id, {
        status: INSTALL_STATUS.FAILED,
        failureCode: failed.outcome.error || 'step_failed',
        resultSnapshot: { results, created },
      });
    }
    return { ok: false, error: 'execution_failed', failed, results, installationId: installation.id };
  }

  const installed = await repo.updateInstallation(installation.id, {
    status: INSTALL_STATUS.INSTALLED,
    installedAt: new Date().toISOString(),
    resultSnapshot: { results, created },
  });
  await repo.insertEvent({
    installationId: installation.id,
    eventType: 'EXECUTION_COMPLETED',
    status: 'OK',
    afterReference: { created },
  });

  return { ok: true, installation: installed, results, created };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function rollbackCapabilityInstallation(prisma, input = {}) {
  const repo = createCapabilityRepository(prisma);
  const installation = await repo.getInstallation(input.installationId);
  if (!installation) return { ok: false, error: 'installation_not_found' };
  if (installation.status === INSTALL_STATUS.ROLLED_BACK) {
    return { ok: true, already: true, installation };
  }

  const before = installation.beforeSnapshot || {};
  const result = installation.resultSnapshot || {};
  const created = Array.isArray(result.created) ? result.created : [];
  const errors = [];

  // Remove created playlists
  for (const c of created) {
    if (c.type === 'Playlist' && c.id) {
      try {
        await prisma.playlist.delete({ where: { id: c.id } });
        await repo.insertEvent({
          installationId: installation.id,
          eventType: 'ROLLBACK_DELETE',
          status: 'OK',
          afterReference: c,
        });
      } catch (e) {
        errors.push({ ref: c, error: e?.message || String(e) });
      }
    }
  }

  // Restore draft store prior values
  if (before.draftStore?.id) {
    try {
      const current = await prisma.draftStore.findUnique({ where: { id: before.draftStore.id } });
      if (current && !['committed'].includes(String(current.status))) {
        await prisma.draftStore.update({
          where: { id: before.draftStore.id },
          data: {
            input: before.draftStore.input,
            preview: before.draftStore.preview,
            status: before.draftStore.status || 'draft',
          },
        });
        await repo.insertEvent({
          installationId: installation.id,
          eventType: 'ROLLBACK_RESTORE',
          status: 'OK',
          beforeReference: { id: current.id },
          afterReference: { restored: true },
        });
      } else if (current?.status === 'committed') {
        errors.push({
          error: 'cannot_rollback_committed_store',
          note: 'Unrelated/canonical committed state preserved',
        });
      }
    } catch (e) {
      errors.push({ error: e?.message || String(e) });
    }
  }

  const updated = await repo.updateInstallation(installation.id, {
    status: INSTALL_STATUS.ROLLED_BACK,
    rolledBackAt: new Date().toISOString(),
    failureCode: errors.length ? 'partial_rollback' : null,
    resultSnapshot: { ...(result || {}), rollbackErrors: errors, rollbackReason: input.reason },
  });
  await repo.insertEvent({
    installationId: installation.id,
    eventType: 'ROLLBACK_COMPLETED',
    status: errors.length ? 'PARTIAL' : 'OK',
    afterReference: { errors },
  });

  return {
    ok: errors.length === 0,
    partial: errors.length > 0,
    installation: updated,
    errors,
  };
}
