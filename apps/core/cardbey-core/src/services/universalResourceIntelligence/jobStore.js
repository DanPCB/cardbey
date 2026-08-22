/**
 * Observable URI jobs (in-memory foundation; restart-safe persistence can follow).
 */

import { URI_JOB_STATUS } from './types.js';

/** @type {Map<string, object>} */
const jobs = new Map();

export function createJob(kind, payload = {}) {
  const id = `urijob_${Date.now().toString(36)}_${jobs.size}`;
  const job = {
    id,
    kind,
    status: URI_JOB_STATUS.QUEUED,
    payload,
    result: null,
    error: null,
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };
  jobs.set(id, job);
  return job;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  const next = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(id, next);
  return next;
}

export function appendJobStage(id, stage) {
  const job = jobs.get(id);
  if (!job) return null;
  job.stages.push({ ...stage, at: new Date().toISOString() });
  job.updatedAt = new Date().toISOString();
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs({ limit = 50, kind, status } = {}) {
  let rows = [...jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (kind) rows = rows.filter((j) => j.kind === kind);
  if (status) rows = rows.filter((j) => j.status === status);
  return rows.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
}

export function resetJobsForTests() {
  jobs.clear();
}
