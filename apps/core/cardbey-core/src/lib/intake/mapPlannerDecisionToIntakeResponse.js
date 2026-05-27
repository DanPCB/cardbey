/**
 * Maps an executionGateway result to a normalized intake response
 * for the Performer frontend.
 */
export function mapPlannerDecisionToIntakeResponse(gatewayResult, context) {
  if (!gatewayResult) {
    return { action: 'chat', message: 'No response from gateway.' };
  }
  return {
    ...gatewayResult,
    missionId: context?.missionId ?? null,
    storeId: context?.storeId ?? null,
    missionType: context?.missionType ?? null,
  };
}
