/**
 * Mission 001 — store generation fidelity convergence flags.
 * Master OFF by default; subflags require master.
 */

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return defaultValue;
}

function masterEnabled() {
  return parseBoolEnv(process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1, false);
}

function subFlag(envName) {
  if (!masterEnabled()) return false;
  return parseBoolEnv(process.env[envName], true);
}

export const Mission001Flags = {
  get enabled() {
    return masterEnabled();
  },
  /** Gate 1 — wire PerformerGroundingEngine into catalog step */
  get groundingConnected() {
    return subFlag('ENABLE_MISSION_001_GROUNDING_V1');
  },
  /** Gate 2 — bounded name-only entity resolution before research */
  get nameResolution() {
    return subFlag('ENABLE_MISSION_001_NAME_RESOLUTION_V1');
  },
  /** Gate 3 — sparse honest catalog when evidence weak */
  get sparseMode() {
    return subFlag('ENABLE_MISSION_001_SPARSE_MODE_V1');
  },
  /** Gate 4 — preserve normalized provenance on catalog items */
  get provenancePreserve() {
    return subFlag('ENABLE_MISSION_001_PROVENANCE_V1');
  },
  /** Gate 5 — pre-reveal fidelity assessment */
  get fidelityPreReveal() {
    return subFlag('ENABLE_MISSION_001_FIDELITY_GATE_V1');
  },
  /** Gate 6 — targeted repair loop (bounded) */
  get targetedRepair() {
    return subFlag('ENABLE_MISSION_001_TARGETED_REPAIR_V1');
  },
  /** Gate 7 — improved image query context */
  get imageFidelity() {
    return subFlag('ENABLE_MISSION_001_IMAGE_FIDELITY_V1');
  },
  /** Gate 8 — pipeline timing instrumentation */
  get pipelineTiming() {
    return subFlag('ENABLE_MISSION_001_PIPELINE_TIMING_V1');
  },
  /** Gate 9 — auto-skip optional checkpoints when confident */
  get reduceFriction() {
    return subFlag('ENABLE_MISSION_001_REDUCE_FRICTION_V1');
  },
  /** Website → Business Offering Reconstruction (Mission 001 freeze objective) */
  get offeringReconstruction() {
    return subFlag('ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1');
  },
};

export default Mission001Flags;
