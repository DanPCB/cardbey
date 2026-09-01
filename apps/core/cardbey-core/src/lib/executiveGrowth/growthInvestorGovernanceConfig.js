/**
 * Growth Command Center — investor discovery / pipeline feature gates.
 */

function envTruthy(name, defaultValue) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return defaultValue;
}

function isNonProductionDeploy() {
  const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export function isInvestorEngagementV1Enabled() {
  return envTruthy('ENABLE_INVESTOR_ENGAGEMENT_V1', isNonProductionDeploy());
}

export function isInvestorGrowthUiV1Enabled() {
  return envTruthy('ENABLE_INVESTOR_GROWTH_UI_V1', isNonProductionDeploy());
}

export function isInvestorDiscoveryV1Enabled() {
  return envTruthy('ENABLE_INVESTOR_DISCOVERY_V1', isNonProductionDeploy());
}

export function isGrowthInvestorModeEnabled() {
  return (
    isInvestorEngagementV1Enabled() &&
    isInvestorGrowthUiV1Enabled() &&
    isInvestorDiscoveryV1Enabled()
  );
}

export const FUNDRAISING_OBJECTIVE = Object.freeze({
  objectiveId: 'cardbey-seed-2026',
  name: 'Cardbey Seed 2026',
  /** Proposed raise target — aligned with Capital Resource Network mission (not a closed round). */
  targetLabel: 'A$3M seed (proposed)',
  status: 'active_research',
  targetCount: 40,
});
