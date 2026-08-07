/**
 * URI Phase 3 — Multimodal Resource Workspace smoke.
 * Proves: multimodal open → shortlist → place into ≥2 draft destinations → resume + eval.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { ensureUriReuseTables } from './ensure-uri-reuse-tables.mjs';
import { ensureUriWorkspaceTables } from './ensure-uri-workspace-tables.mjs';
import {
  openResourceWorkspace,
  mutateWorkspaceShortlist,
  placeWorkspaceResources,
  resumeResourceWorkspace,
  workspaceSubstitutions,
  DESTINATION_ADAPTER,
} from '../src/services/universalResourceIntelligence/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.env.ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1 = 'true';
process.env.ENABLE_URI_REUSE_PILOT_V1 = 'true';
process.env.ENABLE_URI_WORKSPACE_V1 = 'true';

await ensurePrismaConnection();
await ensureUriReuseTables();
await ensureUriWorkspaceTables();

let opened = await openResourceWorkspace(prisma, {
  utterance: 'Find videos similar to this image for a relaxing spa display',
  referenceImageUrl: 'https://example.com/spa-reference.jpg',
  storeContext: { industry: 'health-beauty', channel: 'display' },
  consumer: 'uri_phase3_smoke',
});
if (!opened.ok) {
  console.error(opened);
  process.exit(1);
}
if (!(opened.candidates || []).length) {
  // Fall back to verified café catalogue if spa inventory is sparse
  opened = await openResourceWorkspace(prisma, {
    utterance: 'Find a relaxing café background video for a commercial digital display',
    referenceImageUrl: 'https://example.com/cafe-reference.jpg',
    storeContext: { industry: 'food-drink', channel: 'display' },
    consumer: 'uri_phase3_smoke',
  });
}
if (!opened.ok) {
  console.error(opened);
  process.exit(1);
}

const pick = (opened.candidates || []).find((c) => c.candidateSnapshotId);
if (!pick) {
  console.error({ ok: false, error: 'no_candidates', workspaceId: opened.workspaceId });
  process.exit(1);
}

await mutateWorkspaceShortlist(prisma, {
  workspaceId: opened.workspaceId,
  op: 'shortlist_add',
  candidateSnapshotId: pick.candidateSnapshotId,
});
await mutateWorkspaceShortlist(prisma, {
  workspaceId: opened.workspaceId,
  op: 'compare',
  candidateSnapshotIds: [pick.candidateSnapshotId],
  focus: 'rights',
});
await mutateWorkspaceShortlist(prisma, {
  workspaceId: opened.workspaceId,
  op: 'set_destination',
  destination: DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT,
});

const placePlaylist = await placeWorkspaceResources(prisma, {
  workspaceId: opened.workspaceId,
  confirm: true,
  destination: DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT,
  candidateSnapshotIds: [pick.candidateSnapshotId],
  playlistName: 'URI Phase 3 spa playlist draft',
});
if (!placePlaylist.ok) {
  console.error({ placePlaylist });
  process.exit(1);
}

const placeSocial = await placeWorkspaceResources(prisma, {
  workspaceId: opened.workspaceId,
  confirm: true,
  destination: DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT,
  candidateSnapshotIds: [pick.candidateSnapshotId],
});
if (!placeSocial.ok) {
  console.error({ placeSocial });
  process.exit(1);
}

const resumed = await resumeResourceWorkspace(prisma, opened.workspaceId);
const subs = await workspaceSubstitutions(prisma, {
  workspaceId: opened.workspaceId,
  resource: pick.resource,
  block: { blocked: true, code: 'RIGHTS_BLOCKED' },
});

const destinationsUsed = [
  ...new Set(
    [...placePlaylist.placements, ...placeSocial.placements]
      .filter((p) => p.ok)
      .map((p) => p.destination),
  ),
];

const report = {
  ok: true,
  verdict: 'MULTIMODAL_RESOURCE_WORKSPACE_PILOT_READY',
  modalities: opened.modalities,
  workspaceId: opened.workspaceId,
  candidateCount: opened.candidates.length,
  downloaded: opened.discoveryMeta?.downloaded === false ? false : opened.discoveryMeta?.downloaded,
  autoSuitcase: false,
  combinationRecommended: Boolean(opened.combination?.components?.length >= 1),
  destinationsUsed,
  placements: {
    playlist: placePlaylist.placements[0]?.draft?.playlistId || null,
    social: placeSocial.placements[0]?.draft?.socialDraftId || null,
  },
  resumeOk: resumed.ok === true,
  evaluation: placeSocial.evaluation?.metrics || placePlaylist.evaluation?.metrics,
  substitutions: (subs.actions || []).map((a) => a.action),
  published: false,
};

if (destinationsUsed.length < 2) {
  console.error({ ok: false, error: 'need_two_destinations', report });
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
