/**
 * Lazy-loaded tool executors for mission-plan / pipeline wiring.
 */
export const missionPlanToolExecutors = {
  propose_website_patch: () => import('../../toolExecutors/store/propose_website_patch.js'),
};
