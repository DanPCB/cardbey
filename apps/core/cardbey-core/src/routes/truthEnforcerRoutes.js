// apps/core/cardbey-core/src/routes/truthEnforcerRoutes.js

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  appendTruthMetricsHistory,
  buildTruthMetricsSnapshot,
} from '../lib/truthEnforcerMetrics.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const TRUTH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'truth-enforcer', 'index.mjs');

async function runTruthAudit({ strict = false } = {}) {
  const args = [TRUTH_SCRIPT, '--audit', '--json', '--quiet'];
  if (strict) args.push('--strict');
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim() || '[]');
}

function resolveRepoFilePath(relPath) {
  const rel = String(relPath ?? '').replace(/\\/g, '/');
  return path.join(REPO_ROOT, rel);
}

export default function truthEnforcerRoutes(app) {
  app.get('/api/dev/truth-violations', async (req, res) => {
    try {
      const strict = req.query?.strict === '1' || req.query?.strict === 'true';
      const violations = await runTruthAudit({ strict });
      res.json(violations);
    } catch (error) {
      if (error.stdout) {
        try {
          res.json(JSON.parse(String(error.stdout).trim() || '[]'));
          return;
        } catch {
          // fall through
        }
      }
      res.status(500).json({ ok: false, error: 'truth_audit_failed', message: error?.message ?? 'audit failed' });
    }
  });

  app.post('/api/dev/truth-fix', async (req, res) => {
    const { file, line, pattern } = req.body ?? {};

    try {
      const fullPath = resolveRepoFilePath(file);
      let content = readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const lineIndex = line - 1;

      switch (pattern) {
        case 'FAKE_HERO_UPDATE':
          lines[lineIndex] = lines[lineIndex].replace(
            /heroUpdated:\s*true/,
            'status: "blocked", reason: "hero_generation_not_available"',
          );
          break;

        case 'EMPTY_CATCH':
          lines[lineIndex] = lines[lineIndex].replace(
            /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
            'catch (err) { console.error("Failed:", err); return { status: "failed", error: err.message }; }',
          );
          break;

        default:
          return res.status(400).json({ error: 'Cannot auto-fix this pattern yet' });
      }

      writeFileSync(fullPath, lines.join('\n'), 'utf-8');
      res.json({ success: true, message: `Fixed ${file}:${line}` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/dev/truth-metrics', async (req, res) => {
    try {
      const strict = req.query?.strict === '1' || req.query?.strict === 'true';
      const violations = await runTruthAudit({ strict });
      const snapshot = buildTruthMetricsSnapshot(violations);
      const metricsPath = path.join(REPO_ROOT, '.cardbey', 'truth-metrics.json');

      let payload;
      if (existsSync(metricsPath)) {
        try {
          const cached = JSON.parse(readFileSync(metricsPath, 'utf-8'));
          const cacheAge = Date.now() - new Date(cached?.updatedAt ?? 0).getTime();
          if (cacheAge < 5 * 60 * 1000 && cached?.current) {
            payload = { ...cached, violations: violations.slice(0, 50) };
            return res.json(payload);
          }
        } catch {
          // refresh below
        }
      }

      payload = appendTruthMetricsHistory(REPO_ROOT, snapshot);
      res.json({ ...payload, violations: violations.slice(0, 50) });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: 'truth_metrics_failed',
        message: error?.message ?? 'metrics failed',
        trend: 'unknown',
        current: buildTruthMetricsSnapshot([]),
        history: [],
        topFiles: [],
      });
    }
  });
}
