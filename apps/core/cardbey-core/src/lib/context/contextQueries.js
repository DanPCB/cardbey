/**
 * Common queries on UserContext.
 */

/**
 * @typedef {import('./contextTypes.ts').UserContext} UserContext
 * @typedef {import('./contextTypes.ts').InteractionType} InteractionType
 */

export const ContextQueries = {
  /**
   * @param {UserContext | null | undefined} context
   */
  hasActiveStore(context) {
    if (context?.activeStoreId) return true;
    const uid = String(context?.userId ?? '').trim();
    if (uid.startsWith('guest_') && context?.activeDraftId) return true;
    return false;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  getCurrentWorkflow(context) {
    return context?.currentWorkflow ?? null;
  },

  /**
   * @param {UserContext | null | undefined} context
   * @param {string} workflowType
   */
  isInWorkflow(context, workflowType) {
    return context?.currentWorkflow === workflowType;
  },

  /**
   * @param {UserContext | null | undefined} context
   * @param {number} [limit]
   */
  getRecentInteractions(context, limit = 5) {
    return context?.interactions?.slice(0, limit) ?? [];
  },

  /**
   * @param {UserContext | null | undefined} context
   * @param {InteractionType} type
   */
  getLastInteractionOfType(context, type) {
    return context?.interactions?.find((i) => i.type === type) ?? null;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  hasPendingCheckpoints(context) {
    return (context?.pendingCheckpoints?.length ?? 0) > 0;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  getActiveMissionId(context) {
    return context?.activeMissionId ?? null;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  getActiveMission(context) {
    if (!context?.activeMissionId) return null;
    return {
      id: context.activeMissionId,
      currentStepId: context.currentStepId,
      workflow: context.currentWorkflow,
    };
  },

  /**
   * @param {UserContext | null | undefined} context
   * @param {string} actionType
   * @param {number} [withinMinutes]
   */
  hasCompletedAction(context, actionType, withinMinutes = 5) {
    const recent = context?.completedActions?.filter((a) => {
      const age = Date.now() - new Date(a.timestamp).getTime();
      return a.type === actionType && age < withinMinutes * 60 * 1000;
    });
    return (recent?.length ?? 0) > 0;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  getDefaultAction(context) {
    return context?.preferences?.defaultAction ?? null;
  },

  /**
   * @param {UserContext | null | undefined} context
   * @param {number} [limit]
   */
  getFrequentlyUsedTools(context, limit = 3) {
    return context?.preferences?.frequentlyUsedTools?.slice(0, limit) ?? [];
  },

  /**
   * @param {UserContext | null | undefined} context
   * @param {string} pattern
   */
  getBehaviorPattern(context, pattern) {
    return context?.behaviorPatterns?.find((p) => p.pattern === pattern) ?? null;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  isFirstTimeUser(context) {
    return (context?.metadata?.totalInteractions ?? 0) === 0;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  getCurrentInputContext(context) {
    return context?.currentInputContext ?? null;
  },

  /**
   * @param {UserContext | null | undefined} context
   */
  isCurrentInputAttachmentOnly(context) {
    const input = context?.currentInputContext;
    return Boolean(input?.hasAttachment && !input?.rawText?.trim());
  },
};
