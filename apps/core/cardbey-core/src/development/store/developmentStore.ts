/**
 * File-backed development runtime store.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';
import type { DevelopmentImpactReport } from '../types/DevelopmentImpactReport.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';
import type { DevelopmentWorkspace } from '../types/DevelopmentWorkspace.js';
import type { DevelopmentPatch } from '../types/DevelopmentPatch.js';
import type { DevelopmentFileChange } from '../types/DevelopmentFileChange.js';
import type { DevelopmentCheckRun } from '../types/DevelopmentCheckRun.js';
import type { DevelopmentReview } from '../types/DevelopmentReview.js';
import type { DevelopmentPullRequest } from '../types/DevelopmentPullRequest.js';
import type { DevelopmentEventType } from '../types/DevelopmentEvent.js';

export interface DevelopmentEventRecord {
  id: string;
  type: DevelopmentEventType | string;
  missionId: string;
  workspaceId?: string;
  designId?: string;
  patchId?: string;
  actorType: 'user' | 'system' | 'agent';
  actorId: string;
  repositoryId: string;
  branchName?: string;
  requestId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface DevelopmentStoreSnapshot {
  missions: DevelopmentMission[];
  evidence: Record<string, DevelopmentEvidence>;
  impactReports: Record<string, DevelopmentImpactReport>;
  designs: DevelopmentDesign[];
  workspaces: DevelopmentWorkspace[];
  patches: DevelopmentPatch[];
  fileChanges: DevelopmentFileChange[];
  checkRuns: DevelopmentCheckRun[];
  reviews: DevelopmentReview[];
  pullRequests: DevelopmentPullRequest[];
  events: DevelopmentEventRecord[];
}

const STORE_DIR = path.resolve(process.cwd(), '.development-runtime');
const STORE_FILE = path.join(STORE_DIR, 'store.json');

function emptySnapshot(): DevelopmentStoreSnapshot {
  return {
    missions: [],
    evidence: {},
    impactReports: {},
    designs: [],
    workspaces: [],
    patches: [],
    fileChanges: [],
    checkRuns: [],
    reviews: [],
    pullRequests: [],
    events: [],
  };
}

export class DevelopmentStore {
  private snapshot: DevelopmentStoreSnapshot = emptySnapshot();

  constructor() {
    this.load();
  }

  load(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        this.snapshot = { ...emptySnapshot(), ...JSON.parse(raw) };
      }
    } catch {
      this.snapshot = emptySnapshot();
    }
  }

  persist(): void {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(this.snapshot, null, 2));
  }

  getMissions(): DevelopmentMission[] {
    return [...this.snapshot.missions];
  }

  getMission(id: string): DevelopmentMission | undefined {
    return this.snapshot.missions.find((m) => m.id === id);
  }

  saveMission(mission: DevelopmentMission): void {
    const idx = this.snapshot.missions.findIndex((m) => m.id === mission.id);
    if (idx >= 0) this.snapshot.missions[idx] = mission;
    else this.snapshot.missions.push(mission);
    this.persist();
  }

  saveEvidence(missionId: string, evidence: DevelopmentEvidence): void {
    this.snapshot.evidence[missionId] = evidence;
    this.persist();
  }

  getEvidence(missionId: string): DevelopmentEvidence | undefined {
    return this.snapshot.evidence[missionId];
  }

  saveImpactReport(report: DevelopmentImpactReport): void {
    this.snapshot.impactReports[report.missionId] = report;
    this.persist();
  }

  getImpactReport(missionId: string): DevelopmentImpactReport | undefined {
    return this.snapshot.impactReports[missionId];
  }

  saveDesign(design: DevelopmentDesign): void {
    const idx = this.snapshot.designs.findIndex((d) => d.id === design.id);
    if (idx >= 0) this.snapshot.designs[idx] = design;
    else this.snapshot.designs.push(design);
    this.persist();
  }

  getDesignsForMission(missionId: string): DevelopmentDesign[] {
    return this.snapshot.designs.filter((d) => d.missionId === missionId);
  }

  getLatestDesign(missionId: string): DevelopmentDesign | undefined {
    return this.getDesignsForMission(missionId).sort((a, b) => b.version - a.version)[0];
  }

  getDesignById(id: string): DevelopmentDesign | undefined {
    return this.snapshot.designs.find((d) => d.id === id);
  }

  saveWorkspace(workspace: DevelopmentWorkspace): void {
    const idx = this.snapshot.workspaces.findIndex((w) => w.id === workspace.id);
    if (idx >= 0) this.snapshot.workspaces[idx] = workspace;
    else this.snapshot.workspaces.push(workspace);
    this.persist();
  }

  getWorkspaceForMission(missionId: string): DevelopmentWorkspace | undefined {
    return this.snapshot.workspaces.find((w) => w.missionId === missionId);
  }

  savePatch(patch: DevelopmentPatch): void {
    const idx = this.snapshot.patches.findIndex((p) => p.id === patch.id);
    if (idx >= 0) this.snapshot.patches[idx] = patch;
    else this.snapshot.patches.push(patch);
    this.persist();
  }

  getLatestPatch(missionId: string): DevelopmentPatch | undefined {
    return this.snapshot.patches.filter((p) => p.missionId === missionId).pop();
  }

  saveFileChanges(changes: DevelopmentFileChange[]): void {
    for (const c of changes) {
      const idx = this.snapshot.fileChanges.findIndex((x) => x.id === c.id);
      if (idx >= 0) this.snapshot.fileChanges[idx] = c;
      else this.snapshot.fileChanges.push(c);
    }
    this.persist();
  }

  getFileChangesForPatch(patchId: string): DevelopmentFileChange[] {
    return this.snapshot.fileChanges.filter((f) => f.patchId === patchId);
  }

  saveCheckRun(run: DevelopmentCheckRun): void {
    const idx = this.snapshot.checkRuns.findIndex((r) => r.id === run.id);
    if (idx >= 0) this.snapshot.checkRuns[idx] = run;
    else this.snapshot.checkRuns.push(run);
    this.persist();
  }

  getCheckRunsForMission(missionId: string): DevelopmentCheckRun[] {
    return this.snapshot.checkRuns.filter((r) => r.missionId === missionId);
  }

  saveReview(review: DevelopmentReview): void {
    this.snapshot.reviews.push(review);
    this.persist();
  }

  getReviewsForMission(missionId: string): DevelopmentReview[] {
    return this.snapshot.reviews.filter((r) => r.missionId === missionId);
  }

  savePullRequest(pr: DevelopmentPullRequest): void {
    const idx = this.snapshot.pullRequests.findIndex((p) => p.id === pr.id);
    if (idx >= 0) this.snapshot.pullRequests[idx] = pr;
    else this.snapshot.pullRequests.push(pr);
    this.persist();
  }

  getPullRequestForMission(missionId: string): DevelopmentPullRequest | undefined {
    return this.snapshot.pullRequests.find((p) => p.missionId === missionId);
  }

  appendEvent(event: DevelopmentEventRecord): void {
    this.snapshot.events.push(event);
    if (this.snapshot.events.length > 5000) {
      this.snapshot.events = this.snapshot.events.slice(-5000);
    }
    this.persist();
  }

  getEventsForMission(missionId: string): DevelopmentEventRecord[] {
    return this.snapshot.events.filter((e) => e.missionId === missionId);
  }
}

let singleton: DevelopmentStore | null = null;

export function getDevelopmentStore(): DevelopmentStore {
  if (!singleton) singleton = new DevelopmentStore();
  return singleton;
}

export function resetDevelopmentStoreForTests(): void {
  singleton = null;
  if (fs.existsSync(STORE_FILE)) {
    try {
      fs.unlinkSync(STORE_FILE);
    } catch {
      /* ignore */
    }
  }
}
