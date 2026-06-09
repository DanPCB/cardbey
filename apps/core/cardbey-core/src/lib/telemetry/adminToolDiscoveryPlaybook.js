/**
 * Playbook for admin_tool_discovery self-healing proposals (aligned with dashboard playbooks).
 */

export const ADMIN_TOOL_DISCOVERY_PLAYBOOK = Object.freeze({
  id: 'admin_console_discovery_v1',
  category: 'admin_tool_discovery',
  likelyFiles: [
    'apps/dashboard/cardbey-marketing-dashboard/src/navigation/canonicalNavBuilders.ts',
    'apps/dashboard/cardbey-marketing-dashboard/src/components/shell/CanonicalSidebar.tsx',
    'apps/dashboard/cardbey-marketing-dashboard/src/components/layout/PublicHeader.tsx',
  ],
  constraints: [
    'Only add conditional nav item for admin users (role admin or super_admin).',
    'Use existing NavItem / canonicalNavBuilders patterns.',
    'Do not modify existing routes or auth boundaries.',
    'Proposal only — no auto-apply from API.',
  ],
  validationSteps: [
    'Verify Control Tower link appears for admin users on marketing surfaces.',
    'Verify href points to /app/console/control-tower.',
    'Verify non-admin users do not see the admin-only link.',
    'Run dashboard lint/tests for navigation components.',
  ],
});
