/**
 * Fatal mission pipeline transition errors — must stop execution.
 */

export class MissionTransitionError extends Error {
  /**
   * @param {{
   *   code: string;
   *   message: string;
   *   missionId: string;
   *   currentState?: string | null;
   *   requiredState?: string | null;
   *   failedTransition?: string | null;
   *   persistenceKind?: string | null;
   *   failedModel?: string | null;
   *   requestId?: string | null;
   *   traceId?: string | null;
   *   cause?: unknown;
   * }} input
   */
  constructor(input) {
    super(input.message);
    this.name = 'MissionTransitionError';
    this.code = input.code;
    this.missionId = input.missionId;
    this.currentState = input.currentState ?? null;
    this.requiredState = input.requiredState ?? null;
    this.failedTransition = input.failedTransition ?? null;
    this.persistenceKind = input.persistenceKind ?? 'mission_pipeline';
    this.failedModel = input.failedModel ?? 'MissionPipeline';
    this.requestId = input.requestId ?? null;
    this.traceId = input.traceId ?? null;
    if (input.cause) this.cause = input.cause;
    this.statusCode = input.code === 'INVALID_MISSION_STATE' ? 409 : 404;
  }

  toJSON() {
    return {
      ok: false,
      success: false,
      error: {
        code: this.code,
        message: this.message,
        missionId: this.missionId,
        currentState: this.currentState,
        requiredState: this.requiredState,
        failedTransition: this.failedTransition,
        persistenceKind: this.persistenceKind,
        failedModel: this.failedModel,
        requestId: this.requestId,
        traceId: this.traceId,
      },
    };
  }
}

export default { MissionTransitionError };
