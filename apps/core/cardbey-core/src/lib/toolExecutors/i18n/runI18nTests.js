import { execSync } from 'child_process'
import path from 'path'

const DASHBOARD_ROOT = path.resolve(
  process.cwd(),
  '../../dashboard/cardbey-marketing-dashboard',
)

export async function runI18nTests({ filter } = {}) {
  try {
    const filterArg = filter ? ` ${filter}` : ''
    const result = execSync(`npx vitest run${filterArg} --reporter=json`, {
      encoding: 'utf8',
      cwd: DASHBOARD_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const parsed = JSON.parse(result)
    const passed = parsed.numPassedTests ?? 0
    const failed = parsed.numFailedTests ?? 0
    console.log('[I18N_TEST_RESULT]', { passed, failed, cwd: DASHBOARD_ROOT })
    return { ok: failed === 0, passed, failed, cwd: DASHBOARD_ROOT }
  } catch (err) {
    try {
      const stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString?.() ?? ''
      const parsed = JSON.parse(stdout)
      const failed = parsed.numFailedTests ?? 0
      const passed = parsed.numPassedTests ?? 0
      console.log('[I18N_TEST_RESULT]', { passed, failed, cwd: DASHBOARD_ROOT })
      return {
        ok: failed === 0,
        passed,
        failed,
        error: failed > 0 ? `${failed} test(s) failed` : undefined,
        cwd: DASHBOARD_ROOT,
      }
    } catch {
      console.error('[I18N_TEST_FAILED]', err.message)
      return { ok: false, error: err.message, cwd: DASHBOARD_ROOT }
    }
  }
}
