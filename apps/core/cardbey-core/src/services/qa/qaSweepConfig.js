/**
 * QA Sweep config - env-driven. Disabled by default; enable via QA_SWEEP_ENABLED=true.
 */

export function getQaSweepEnabled() {
  return process.env.QA_SWEEP_ENABLED === 'true';
}

export function getQaSweepEveryMinutes() {
  const raw = process.env.QA_SWEEP_EVERY_MINUTES;
  if (raw != null) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 60;
}
