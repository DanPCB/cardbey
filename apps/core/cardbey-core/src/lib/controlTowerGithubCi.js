/**
 * Read-only GitHub Actions summaries for Control Tower (admin API).
 * No secrets in responses; token stays server-side.
 *
 * Env:
 * - CONTROL_TOWER_GITHUB_REPO or GITHUB_REPOSITORY — "owner/repo"
 * - CONTROL_TOWER_GITHUB_TOKEN or GITHUB_TOKEN — PAT or Actions token with actions:read
 * - CONTROL_TOWER_GITHUB_BRANCH — default "main"
 * - CONTROL_TOWER_GITHUB_WORKFLOWS — comma list of workflow files under .github/workflows (default: tests.yml,contract-tests.yml)
 */

const GH_API = 'https://api.github.com';
const GH_HEADERS = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Cardbey-Control-Tower/1',
});

function conclusionToGate(conclusion, status) {
  if (status === 'queued' || status === 'in_progress' || status === 'waiting') return 'unknown';
  if (!conclusion) return 'unknown';
  const c = String(conclusion).toLowerCase();
  if (c === 'success') return 'pass';
  if (c === 'failure' || c === 'timed_out') return 'fail';
  if (c === 'cancelled') return 'fail';
  if (c === 'skipped' || c === 'neutral') return 'unknown';
  if (c === 'action_required') return 'unknown';
  return 'unknown';
}

function aggregateGates(gates) {
  if (!gates.length) return 'unknown';
  if (gates.some((g) => g === 'fail')) return 'fail';
  if (gates.every((g) => g === 'pass')) return 'pass';
  return 'unknown';
}

/**
 * @returns {Promise<{
 *   availability: 'live'|'unavailable',
 *   note?: string,
 *   branch: string,
 *   repo: string|null,
 *   fetchedAt: string,
 *   runs: Array<{
 *     workflowFile: string,
 *     workflowName: string|null,
 *     conclusion: string|null,
 *     status: string|null,
 *     gate: string,
 *     htmlUrl: string|null,
 *     runStartedAt: string|null,
 *     updatedAt: string|null,
 *   }>,
 *   aggregateGate: string,
 *   coreTestsGate: string,
 *   dashboardTestsGate: string,
 * }>}
 */
export async function loadGithubCiSummary() {
  const branch = (process.env.CONTROL_TOWER_GITHUB_BRANCH || 'main').trim();
  const repo =
    (process.env.CONTROL_TOWER_GITHUB_REPO || process.env.GITHUB_REPOSITORY || '').trim() ||
    '';
  const token = (process.env.CONTROL_TOWER_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  const workflowFiles = (process.env.CONTROL_TOWER_GITHUB_WORKFLOWS || 'tests.yml,contract-tests.yml')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const baseUnavailable = {
    availability: 'unavailable',
    branch,
    repo: repo || null,
    fetchedAt: new Date().toISOString(),
    runs: [],
    aggregateGate: 'unknown',
    coreTestsGate: 'unknown',
    dashboardTestsGate: 'unknown',
  };

  if (!repo) {
    return {
      ...baseUnavailable,
      note:
        'Set CONTROL_TOWER_GITHUB_REPO (owner/repo) or GITHUB_REPOSITORY for CI status. Token optional until repo is set.',
    };
  }

  if (!token) {
    return {
      ...baseUnavailable,
      note:
        'Set CONTROL_TOWER_GITHUB_TOKEN or GITHUB_TOKEN (actions:read) to fetch workflow runs.',
    };
  }

  const parts = repo.split('/').filter(Boolean);
  if (parts.length < 2) {
    return {
      ...baseUnavailable,
      note: `Invalid repo slug "${repo}" (expected owner/repo).`,
    };
  }
  const owner = parts[0];
  const repoName = parts.slice(1).join('/');

  const runs = [];
  for (let i = 0; i < workflowFiles.length; i++) {
    const workflowFile = workflowFiles[i];
    const path = `/repos/${owner}/${repoName}/actions/workflows/${encodeURIComponent(
      workflowFile
    )}/runs?branch=${encodeURIComponent(branch)}&per_page=1`;

    try {
      const res = await fetch(`${GH_API}${path}`, { headers: GH_HEADERS(token) });
      if (!res.ok) {
        runs.push({
          workflowFile,
          workflowName: null,
          conclusion: null,
          status: null,
          gate: 'unknown',
          htmlUrl: null,
          runStartedAt: null,
          updatedAt: null,
          error: `http_${res.status}`,
        });
        continue;
      }
      const data = await res.json();
      const row = (data.workflow_runs && data.workflow_runs[0]) || null;
      const conclusion = row?.conclusion ?? null;
      const status = row?.status ?? null;
      const gate = conclusionToGate(conclusion, status);
      runs.push({
        workflowFile,
        workflowName: row?.name ?? null,
        conclusion,
        status,
        gate,
        htmlUrl: row?.html_url ?? null,
        runStartedAt: row?.run_started_at ?? null,
        updatedAt: row?.updated_at ?? null,
      });
    } catch (e) {
      runs.push({
        workflowFile,
        workflowName: null,
        conclusion: null,
        status: null,
        gate: 'unknown',
        htmlUrl: null,
        runStartedAt: null,
        updatedAt: null,
        error: e?.message || 'fetch_failed',
      });
    }
  }

  const gates = runs.map((r) => r.gate);
  const aggregateGate = aggregateGates(gates);
  const coreTestsGate = runs[0]?.gate ?? 'unknown';
  const dashboardTestsGate = runs[1]?.gate ?? 'unknown';

  const anyHttpError = runs.some((r) => r.error);
  const allEmpty = runs.length > 0 && runs.every((r) => !r.status && !r.conclusion && r.gate === 'unknown');

  return {
    availability: anyHttpError || allEmpty ? 'partial' : 'live',
    branch,
    repo,
    fetchedAt: new Date().toISOString(),
    runs,
    aggregateGate,
    coreTestsGate,
    dashboardTestsGate,
    note: anyHttpError
      ? 'Some workflow requests failed (check workflow file names and token scopes).'
      : allEmpty
        ? 'No runs returned for this branch — workflows may not exist or never ran on this branch.'
        : undefined,
  };
}
