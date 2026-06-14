#!/usr/bin/env node
/**
 * HTTP smoke test after SQLite schema repair.
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/lib/prisma.js';

const BASE = process.env.CORE_API_BASE || 'http://localhost:3001';
const AUTH = { Authorization: 'Bearer dev-admin-token', 'Content-Type': 'application/json' };

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: AUTH,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text };
}

async function main() {
  const prisma = getPrismaClient();
  const business = await prisma.business.findFirst({ select: { id: true }, orderBy: { createdAt: 'desc' } });
  const storeId = business?.id ?? 'unknown';
  const checks = [];

  const pil = await request('POST', '/api/pil/events', { type: 'schema_repair_verify', metadata: { surface: 'verify' } });
  checks.push({
    name: 'POST /api/pil/events',
    ok: pil.status === 201 && pil.json?.persisted === true,
    status: pil.status,
    body: pil.json,
  });

  const loyalty = await request('GET', `/api/loyalty/programs/${storeId}`);
  checks.push({
    name: 'GET /api/loyalty/programs/:storeId',
    ok: loyalty.status === 200 && loyalty.json?.ok === true && Array.isArray(loyalty.json?.programs),
    status: loyalty.status,
    storeId,
  });

  const docs = await request('GET', '/api/docs');
  checks.push({
    name: 'GET /api/docs',
    ok: docs.status === 200 && docs.json?.ok === true && Array.isArray(docs.json?.documents),
    status: docs.status,
  });

  await prisma.$disconnect().catch(() => {});

  const failed = checks.filter((c) => !c.ok);
  console.log('[verify-sqlite-api-endpoints]', { checks, failed: failed.map((f) => f.name) });
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[verify-sqlite-api-endpoints] FAIL', err?.message ?? err);
  process.exitCode = 1;
});
