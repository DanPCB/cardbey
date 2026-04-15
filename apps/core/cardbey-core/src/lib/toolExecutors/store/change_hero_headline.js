/**
 * change_hero_headline — spawn local tool runner per call (Node process).
 * This is a bridge tool to validate external toolset integration.
 *
 * Input: { storeId, headline?, subheadline? }
 * Output: runner result passthrough.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function normalizeResult(raw) {
  if (!isPlainObject(raw)) {
    return {
      status: 'failed',
      error: { code: 'LOCAL_RUNNER_INVALID', message: 'Local runner returned non-object' },
    };
  }
  const status = raw.status === 'blocked' ? 'blocked' : raw.status === 'failed' ? 'failed' : 'ok';
  return {
    status,
    ...(isPlainObject(raw.output) ? { output: raw.output } : raw.output != null ? { output: raw.output } : {}),
    ...(isPlainObject(raw.blocker) ? { blocker: raw.blocker } : {}),
    ...(isPlainObject(raw.error) ? { error: raw.error } : {}),
  };
}

function extractJsonFromStdout(stdout) {
  const text = typeof stdout === 'string' ? stdout.trim() : '';
  if (!text) return null;
  // Common case: clean single JSON object
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }
  // Try last non-empty line (some runtimes print banners/newlines)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    try {
      return JSON.parse(last);
    } catch {
      // continue
    }
  }
  // Try JSON substring (ignore leading/trailing noise)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

async function runLocalRunner(payload) {
  // Resolve runner path relative to this module (do not depend on process.cwd()).
  const runnerPath = fileURLToPath(new URL('../../../toolRunners/localToolRunner.mjs', import.meta.url));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));

    child.on('close', (code) => {
      if (!out || typeof out !== 'string') {
        resolve({
          status: 'failed',
          error: { code: 'LOCAL_RUNNER_NO_OUTPUT', message: err || `Local runner exited with code ${code}` },
        });
        return;
      }
      const parsed = extractJsonFromStdout(out);
      if (parsed) {
        resolve(normalizeResult(parsed));
        return;
      }
      {
        resolve({
          status: 'failed',
          error: {
            code: 'LOCAL_RUNNER_BAD_JSON',
            message: `Local runner returned non-JSON output. stderr=${err || ''}`.slice(0, 4000),
          },
          output: { stdout: out.slice(0, 4000) },
        });
      }
    });

    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (e) {
      resolve({
        status: 'failed',
        error: { code: 'LOCAL_RUNNER_SPAWN', message: e?.message || String(e) },
      });
    }
  });
}

export async function execute(input = {}, context = {}) {
  const payload = {
    toolName: 'change_hero_headline',
    input: isPlainObject(input) ? input : {},
    context: isPlainObject(context) ? context : {},
  };
  return runLocalRunner(payload);
}

