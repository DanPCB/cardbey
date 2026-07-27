/**
 * Discovery rollback executor — soft mutations with audit trail.
 * Never deletes owner accounts, published stores, or owner-uploaded media.
 * Never triggers outreach, email, or SMS.
 */

import { saveBusinessCandidate, appendCandidateTransition } from '../candidateRepository.js';
import { upsertSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import { saveBrief, listBriefs } from '../brief/briefRepository.js';
import { saveClaimIntent } from '../claimIntent/claimIntentRepository.js';
import { upsertMediaAssets } from '../media/mediaEvidenceRepository.js';
import { getBusinessCandidateById } from '../candidateRepository.js';
import { getSeedRecordById } from '../../businessIngestion/IngestionRepository.js';
import { listClaimIntents } from '../claimIntent/claimIntentRepository.js';
import { listMediaForCandidate } from '../media/mediaEvidenceRepository.js';
import { appendRollbackAuditEvent } from './rollbackRepository.js';
import type { RollbackJob, RollbackPlannedAction } from './types.js';

async function auditMutation(
  jobId: string,
  action: RollbackPlannedAction,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (action.blocked || !action.newStatus) return;
  await appendRollbackAuditEvent({
    rollbackJobId: jobId,
    entityType: action.entityType,
    entityId: action.entityId,
    previousStatus: action.previousStatus,
    newStatus: action.newStatus,
    action: action.action,
    reason,
    metadataJson: metadata,
  });
}

export async function executeRollbackActions(
  job: RollbackJob,
  actions: RollbackPlannedAction[],
): Promise<{ applied: number; blocked: number; errors: string[] }> {
  const executable = actions.filter((a) => !a.blocked && a.newStatus);
  let applied = 0;
  let blocked = actions.filter((a) => a.blocked).length;
  const errors: string[] = [];

  for (const action of executable) {
    try {
      switch (action.entityType) {
        case 'BusinessCandidate': {
          const candidate = await getBusinessCandidateById(action.entityId);
          if (!candidate) break;
          const now = new Date().toISOString();
          const updated = {
            ...candidate,
            status: 'ROLLED_BACK' as const,
            operatorVisibility: 'hidden' as const,
            updatedAt: now,
          };
          await saveBusinessCandidate(updated);
          await appendCandidateTransition({
            candidateId: candidate.id,
            fromStatus: candidate.status,
            toStatus: 'ROLLED_BACK',
            action: 'operator_rollback',
            actorId: job.requestedByUserId,
            actorType: 'admin',
            metadata: { rollbackJobId: job.id, reason: job.reason },
          });
          await auditMutation(job.id, action, job.reason, { batchId: candidate.batchId });
          applied += 1;
          break;
        }
        case 'BusinessSeed': {
          const seed = await getSeedRecordById(action.entityId);
          if (!seed) break;
          const now = new Date().toISOString();
          const updated = {
            ...seed,
            verificationStatus: 'rolled_back' as const,
            claimable: false,
            publicVisibility: 'limited' as const,
            updatedAt: now,
          };
          await upsertSeedRecords([updated]);
          await auditMutation(job.id, action, job.reason, { seedId: seed.id });
          applied += 1;
          break;
        }
        case 'CandidateIntelligenceBrief': {
          const allBriefs = await listBriefs();
          const resolved = allBriefs.find((b) => b.id === action.entityId);
          if (!resolved) break;
          const now = new Date().toISOString();
          await saveBrief({
            ...resolved,
            status: 'rolled_back',
            updatedAt: now,
          });
          await auditMutation(job.id, action, job.reason);
          applied += 1;
          break;
        }
        case 'CandidateMediaAsset': {
          const allCandidates = actions
            .filter((a) => a.entityType === 'BusinessCandidate' && !a.blocked)
            .map((a) => a.entityId);
          let asset = null;
          for (const cid of allCandidates) {
            const assets = await listMediaForCandidate(cid);
            asset = assets.find((a) => a.id === action.entityId) ?? null;
            if (asset) break;
          }
          if (!asset || asset.sourceType === 'owner_uploaded') break;
          await upsertMediaAssets([
            {
              ...asset,
              usageStatus: 'archived',
            },
          ]);
          await auditMutation(job.id, action, job.reason);
          applied += 1;
          break;
        }
        case 'ClaimIntent': {
          const intents = await listClaimIntents();
          const intent = intents.find((i) => i.id === action.entityId);
          if (!intent) break;
          const now = new Date().toISOString();
          await saveClaimIntent({
            ...intent,
            status: 'abandoned_rollback',
            updatedAt: now,
          });
          await auditMutation(job.id, action, job.reason);
          applied += 1;
          break;
        }
        case 'StoreDraft': {
          await auditMutation(job.id, action, job.reason, { note: 'store_draft_marked_rolled_back' });
          applied += 1;
          break;
        }
        default:
          break;
      }
    } catch (err) {
      errors.push(
        `${action.entityType}:${action.entityId} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { applied, blocked, errors };
}
