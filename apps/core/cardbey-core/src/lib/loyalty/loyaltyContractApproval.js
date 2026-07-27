/**

 * Apply topology approval to canonical LoyaltyCreationContract before execution.

 */



import {

  buildLoyaltyCreationContract,

  loyaltyCreationContractToDraft,

} from './loyaltyCreationContract.js';

import { writeMetadata } from '../persistence/metadataWriter.js';

import {

  ensureLoyaltyAttachmentAnalysisWithTopology,

  resolveLoyaltyMissionImageRef,

} from '../intake/intakeAttachmentBinding.js';

import {

  loadGraphByMission,

  seedMissionGraphFromLoyaltyMetadata,

} from '../evidence/missionEvidenceGraphService.js';

import { readMissionContract, advanceFrozenMissionContractTopology } from '../kernel/missionContract.js';

import {

  hasAuthoritativeLoyaltyTopology,

  logLoyaltyContractDiagnostic,

} from './loyaltyContractDiagnostics.js';



function pickString(...values) {

  for (const value of values) {

    if (typeof value === 'string' && value.trim()) return value.trim();

  }

  return '';

}



function isCompleteSourceDrivenContract(contract) {

  if (!contract || contract.sourceMode !== 'SOURCE_DRIVEN') return true;

  const rule = contract.rule;

  const topo = contract.cardTopology;

  return Boolean(

    rule?.purchasesRequired &&

      pickString(rule.rewardItem, rule.purchaseItem) &&

      topo?.rows &&

      topo?.columns,

  );

}



/**

 * Build and persist creation contract at topology approval boundary.

 *

 * @param {string} missionId

 * @param {Record<string, unknown>} metadata

 * @param {{ storeId?: string; userMessage?: string }} [ctx]

 */

export async function persistLoyaltyContractFromTopologyApproval(missionId, metadata, ctx = {}) {

  let meta = metadata && typeof metadata === 'object' ? { ...metadata } : {};

  const preseeded =

    meta.preseededDraft && typeof meta.preseededDraft === 'object'

      ? { ...meta.preseededDraft }

      : meta.executionDraft && typeof meta.executionDraft === 'object'

        ? { ...meta.executionDraft }

        : {};



  let attachment =

    meta.attachmentAnalysis && typeof meta.attachmentAnalysis === 'object'

      ? meta.attachmentAnalysis

      : null;

  const storeId =

    pickString(ctx.storeId, meta.storeId, preseeded.storeId, attachment?.preseededDraft?.storeId) ||

    pickString(meta.targetId);



  let frozenEvidenceId = null;

  try {

    const frozen = await readMissionContract(missionId);

    frozenEvidenceId = pickString(frozen?.evidenceId);

  } catch {

    // non-fatal

  }



  const resolvedRefs = resolveLoyaltyMissionImageRef(meta, {

    evidenceId: frozenEvidenceId,

    sessionId: pickString(meta.sessionId, meta.conversationSessionId),

    streamId: meta.intakeEvidence?.streamId,

  });



  attachment = await ensureLoyaltyAttachmentAnalysisWithTopology(attachment, {

    evidenceId: resolvedRefs.evidenceId,

    missionId,

    storeId,

    imageRef: resolvedRefs.imageRef,

    sessionId: resolvedRefs.sessionId,

    streamId: resolvedRefs.streamId,

    missionMetadata: meta,

    attachmentId: pickString(meta.attachmentId, attachment?.attachmentId),

  });



  if (attachment?.preseededDraft && typeof attachment.preseededDraft === 'object') {

    meta = {

      ...meta,

      attachmentAnalysis: attachment,

      evidenceId: pickString(resolvedRefs.evidenceId, attachment.evidenceId, meta.evidenceId),

      preseededDraft: {

        ...preseeded,

        ...attachment.preseededDraft,

      },

    };

  } else if (attachment) {

    meta = {

      ...meta,

      attachmentAnalysis: attachment,

      evidenceId: pickString(resolvedRefs.evidenceId, attachment.evidenceId, meta.evidenceId),

    };

  }



  try {

    await seedMissionGraphFromLoyaltyMetadata(missionId, {

      ...meta,

      storeId,

      evidenceId: resolvedRefs.evidenceId ?? meta.evidenceId ?? null,

      imageRef: resolvedRefs.imageRef ?? null,

      attachmentAnalysis: attachment,

    });

  } catch (seedErr) {

    console.warn(

      '[loyaltyContractApproval] seedMissionGraphFromLoyaltyMetadata failed (non-fatal):',

      seedErr instanceof Error ? seedErr.message : seedErr,

    );

  }



  const missionEvidenceGraph = await loadGraphByMission(missionId);



  const attachmentPreseeded =

    attachment?.preseededDraft && typeof attachment.preseededDraft === 'object'

      ? attachment.preseededDraft

      : {};



  const mergedPreseeded = {

    ...attachmentPreseeded,

    ...(meta.preseededDraft && typeof meta.preseededDraft === 'object' ? meta.preseededDraft : preseeded),

  };



  const hasExtractedEvidence =

    mergedPreseeded.extractedFromImage === true ||

    hasAuthoritativeLoyaltyTopology(mergedPreseeded.cardTopology) ||

    Number(mergedPreseeded.rule?.purchasesRequired) > 0 ||

    Number(mergedPreseeded.requiredStamps) > 0;



  const contract = buildLoyaltyCreationContract({

    storeId,

    preseededDraft: mergedPreseeded,

    userMessage: pickString(ctx.userMessage, meta.goal),

    requirements: pickString(ctx.userMessage, meta.goal),

    hasAttachmentEvidence: hasExtractedEvidence,

    missionEvidenceGraph,

    storeContext: meta.storeContext ?? meta.executionContext ?? {},

  });



  logLoyaltyContractDiagnostic('persistLoyaltyContractFromTopologyApproval', mergedPreseeded, {

    missionId,

    storeId,

    evidenceId: resolvedRefs.evidenceId,

    hasImageRef: Boolean(resolvedRefs.imageRef),

    hasGraph: Boolean(missionEvidenceGraph),

    sourceMode: contract.sourceMode,

    hasCardTopology: hasAuthoritativeLoyaltyTopology(contract.cardTopology),

    hasRule: Boolean(contract.rule?.purchasesRequired),

  });



  if (!isCompleteSourceDrivenContract(contract)) {

    return {

      ok: false,

      code: 'LOYALTY_CREATION_CONTRACT_INCOMPLETE',

      message:

        'Source-driven loyalty approval is missing extracted rule or card topology. Re-run card analysis or recover the contract.',

      missionId,

      contract,

      missingFields: contract.missingFields ?? ['rule', 'cardTopology'],

      diagnostics: {

        evidenceId: resolvedRefs.evidenceId ?? null,

        hasImageRef: Boolean(resolvedRefs.imageRef),

        hasGraphTopology: hasAuthoritativeLoyaltyTopology(missionEvidenceGraph?.topology),

      },

    };

  }



  const draft = loyaltyCreationContractToDraft(contract);

  const topologyForContract =
    contract.cardTopology && typeof contract.cardTopology === 'object'
      ? contract.cardTopology
      : missionEvidenceGraph?.topology ?? null;
  if (topologyForContract) {
    await advanceFrozenMissionContractTopology(missionId, topologyForContract, {
      evidenceGraphId: missionEvidenceGraph?.graphId ?? null,
      evidenceGraphVersion: missionEvidenceGraph?.version ?? null,
    });
  }

  const nextMeta = await writeMetadata(missionId, {

    creationContract: contract,

    preseededDraft: draft,

    executionDraft: draft,

    ...(attachment ? { attachmentAnalysis: attachment } : {}),

    ...(resolvedRefs.evidenceId ? { evidenceId: resolvedRefs.evidenceId } : {}),

    sourceMode: contract.sourceMode,

    provenance: contract.provenance,

    topologyApprovalContractAppliedAt: new Date().toISOString(),

  });



  return {

    ok: true,

    contract,

    draft,

    metadata: nextMeta,

  };

}



export default { persistLoyaltyContractFromTopologyApproval };

