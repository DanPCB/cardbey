/**
 * Capability persistence via SQL (tables created by ensure-capability-tables.mjs).
 * Avoids requiring a Prisma client regenerate mid-pilot.
 */

import { randomBytes } from 'node:crypto';

function cuid() {
  return `c${Date.now().toString(36)}${randomBytes(8).toString('hex')}`;
}

function jparse(v, fallback = null) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function jstr(v) {
  if (v == null) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function mapCapability(row) {
  if (!row) return null;
  return {
    ...row,
    previewAssetIds: jparse(row.previewAssetIds, []),
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    ...row,
    inputSchema: jparse(row.inputSchema, []),
    outputSchema: jparse(row.outputSchema, null),
    executionDefinition: jparse(row.executionDefinition, { steps: [] }),
    dependencyDefinition: jparse(row.dependencyDefinition, {}),
    compatibilityDefinition: jparse(row.compatibilityDefinition, {}),
  };
}

function mapInstall(row) {
  if (!row) return null;
  return {
    ...row,
    inputSnapshot: jparse(row.inputSnapshot, null),
    executionPlanSnapshot: jparse(row.executionPlanSnapshot, null),
    resultSnapshot: jparse(row.resultSnapshot, null),
    beforeSnapshot: jparse(row.beforeSnapshot, null),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createCapabilityRepository(prisma) {
  return {
    async listCapabilities({ status } = {}) {
      const rows = status
        ? await prisma.$queryRawUnsafe(
            `SELECT * FROM "Capability" WHERE "status" = ? ORDER BY "updatedAt" DESC`,
            status,
          )
        : await prisma.$queryRawUnsafe(`SELECT * FROM "Capability" ORDER BY "updatedAt" DESC`);
      return (rows || []).map(mapCapability);
    },

    async getBySlug(slug) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "Capability" WHERE "slug" = ? LIMIT 1`,
        slug,
      );
      return mapCapability(rows?.[0]);
    },

    async getById(id) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "Capability" WHERE "id" = ? LIMIT 1`,
        id,
      );
      return mapCapability(rows?.[0]);
    },

    async insertCapability(data) {
      const id = data.id || cuid();
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Capability" (
          "id","ownerType","ownerId","creatorId","slug","name","summary","description",
          "capabilityType","industry","status","visibility","currentVersionId","defaultLicenceCode",
          "iconAssetId","coverAssetId","previewAssetIds","createdAt","updatedAt","publishedAt","archivedAt"
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        data.ownerType || 'platform',
        data.ownerId,
        data.creatorId || null,
        data.slug,
        data.name,
        data.summary || null,
        data.description || null,
        data.capabilityType,
        data.industry || null,
        data.status || 'DRAFT',
        data.visibility || 'private',
        data.currentVersionId || null,
        data.defaultLicenceCode || null,
        data.iconAssetId || null,
        data.coverAssetId || null,
        jstr(data.previewAssetIds || []),
        now,
        now,
        data.publishedAt || null,
        data.archivedAt || null,
      );
      return this.getById(id);
    },

    async updateCapability(id, patch) {
      const cur = await this.getById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      await prisma.$executeRawUnsafe(
        `UPDATE "Capability" SET
          "name"=?, "summary"=?, "description"=?, "status"=?, "visibility"=?,
          "currentVersionId"=?, "previewAssetIds"=?, "publishedAt"=?, "updatedAt"=?
         WHERE "id"=?`,
        next.name,
        next.summary,
        next.description,
        next.status,
        next.visibility,
        next.currentVersionId,
        jstr(next.previewAssetIds || []),
        next.publishedAt,
        next.updatedAt,
        id,
      );
      return this.getById(id);
    },

    async listVersions(capabilityId) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "CapabilityVersion" WHERE "capabilityId" = ? ORDER BY "versionNumber" ASC`,
        capabilityId,
      );
      return (rows || []).map(mapVersion);
    },

    async getVersion(id) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "CapabilityVersion" WHERE "id" = ? LIMIT 1`,
        id,
      );
      return mapVersion(rows?.[0]);
    },

    async insertVersion(data) {
      const id = data.id || cuid();
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CapabilityVersion" (
          "id","capabilityId","versionNumber","versionLabel","inputSchema","outputSchema",
          "executionDefinition","dependencyDefinition","compatibilityDefinition","changelog",
          "status","createdByUserId","createdAt","approvedAt","publishedAt"
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        data.capabilityId,
        data.versionNumber,
        data.versionLabel || null,
        jstr(data.inputSchema || []),
        jstr(data.outputSchema || null),
        jstr(data.executionDefinition || { steps: [] }),
        jstr(data.dependencyDefinition || {}),
        jstr(data.compatibilityDefinition || {}),
        data.changelog || null,
        data.status || 'DRAFT',
        data.createdByUserId || null,
        now,
        data.approvedAt || null,
        data.publishedAt || null,
      );
      return this.getVersion(id);
    },

    async updateVersion(id, patch) {
      const cur = await this.getVersion(id);
      if (!cur) return null;
      if (cur.status === 'PUBLISHED' && patch.mutatePublished) {
        throw new Error('published_version_immutable');
      }
      if (cur.status === 'PUBLISHED') {
        // Only allow status transitions that do not mutate definition
        if (
          patch.executionDefinition ||
          patch.inputSchema ||
          patch.dependencyDefinition ||
          patch.compatibilityDefinition
        ) {
          throw new Error('published_version_immutable');
        }
      }
      const next = { ...cur, ...patch };
      await prisma.$executeRawUnsafe(
        `UPDATE "CapabilityVersion" SET
          "versionLabel"=?, "inputSchema"=?, "outputSchema"=?, "executionDefinition"=?,
          "dependencyDefinition"=?, "compatibilityDefinition"=?, "changelog"=?,
          "status"=?, "approvedAt"=?, "publishedAt"=?
         WHERE "id"=?`,
        next.versionLabel,
        jstr(next.inputSchema),
        jstr(next.outputSchema),
        jstr(next.executionDefinition),
        jstr(next.dependencyDefinition),
        jstr(next.compatibilityDefinition),
        next.changelog,
        next.status,
        next.approvedAt,
        next.publishedAt,
        id,
      );
      return this.getVersion(id);
    },

    async listComponents(versionId) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "CapabilityComponent" WHERE "capabilityVersionId" = ? ORDER BY "sortOrder" ASC`,
        versionId,
      );
      return (rows || []).map((r) => ({
        ...r,
        configuration: jparse(r.configuration, {}),
        required: Boolean(r.required),
      }));
    },

    async insertComponent(data) {
      const id = data.id || cuid();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CapabilityComponent" (
          "id","capabilityVersionId","componentType","referenceType","referenceId",
          "configuration","sortOrder","required"
        ) VALUES (?,?,?,?,?,?,?,?)`,
        id,
        data.capabilityVersionId,
        data.componentType,
        data.referenceType || null,
        data.referenceId || null,
        jstr(data.configuration || {}),
        data.sortOrder || 0,
        data.required !== false,
      );
      return id;
    },

    async insertInstallation(data) {
      const id = data.id || cuid();
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CapabilityInstallation" (
          "id","capabilityId","capabilityVersionId","targetType","targetId","installedByUserId",
          "status","inputSnapshot","executionPlanSnapshot","resultSnapshot","beforeSnapshot",
          "failureCode","installedAt","updatedAt","rolledBackAt","createdAt"
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        data.capabilityId,
        data.capabilityVersionId,
        data.targetType,
        data.targetId,
        data.installedByUserId || null,
        data.status || 'PLANNED',
        jstr(data.inputSnapshot || null),
        jstr(data.executionPlanSnapshot || null),
        jstr(data.resultSnapshot || null),
        jstr(data.beforeSnapshot || null),
        data.failureCode || null,
        data.installedAt || null,
        now,
        data.rolledBackAt || null,
        now,
      );
      return this.getInstallation(id);
    },

    async getInstallation(id) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "CapabilityInstallation" WHERE "id" = ? LIMIT 1`,
        id,
      );
      return mapInstall(rows?.[0]);
    },

    async updateInstallation(id, patch) {
      const cur = await this.getInstallation(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      await prisma.$executeRawUnsafe(
        `UPDATE "CapabilityInstallation" SET
          "status"=?, "inputSnapshot"=?, "executionPlanSnapshot"=?, "resultSnapshot"=?,
          "beforeSnapshot"=?, "failureCode"=?, "installedAt"=?, "updatedAt"=?, "rolledBackAt"=?
         WHERE "id"=?`,
        next.status,
        jstr(next.inputSnapshot),
        jstr(next.executionPlanSnapshot),
        jstr(next.resultSnapshot),
        jstr(next.beforeSnapshot),
        next.failureCode,
        next.installedAt,
        next.updatedAt,
        next.rolledBackAt,
        id,
      );
      return this.getInstallation(id);
    },

    async listInstallations({ capabilityId, targetType, targetId, status } = {}) {
      let sql = `SELECT * FROM "CapabilityInstallation" WHERE 1=1`;
      const params = [];
      if (capabilityId) {
        sql += ` AND "capabilityId" = ?`;
        params.push(capabilityId);
      }
      if (targetType) {
        sql += ` AND "targetType" = ?`;
        params.push(targetType);
      }
      if (targetId) {
        sql += ` AND "targetId" = ?`;
        params.push(targetId);
      }
      if (status) {
        sql += ` AND "status" = ?`;
        params.push(status);
      }
      sql += ` ORDER BY "createdAt" DESC`;
      const rows = await prisma.$queryRawUnsafe(sql, ...params);
      return (rows || []).map(mapInstall);
    },

    async insertEvent(data) {
      const id = data.id || cuid();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "CapabilityExecutionEvent" (
          "id","installationId","stepId","eventType","status","beforeReference","afterReference","errorCode","createdAt"
        ) VALUES (?,?,?,?,?,?,?,?,?)`,
        id,
        data.installationId,
        data.stepId || null,
        data.eventType,
        data.status,
        jstr(data.beforeReference || null),
        jstr(data.afterReference || null),
        data.errorCode || null,
        new Date().toISOString(),
      );
      return id;
    },

    async listEvents(installationId) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "CapabilityExecutionEvent" WHERE "installationId" = ? ORDER BY "createdAt" ASC`,
        installationId,
      );
      return (rows || []).map((r) => ({
        ...r,
        beforeReference: jparse(r.beforeReference, null),
        afterReference: jparse(r.afterReference, null),
      }));
    },

    async countInstallations(capabilityId) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as c FROM "CapabilityInstallation" WHERE "capabilityId" = ? AND "status" = 'INSTALLED'`,
        capabilityId,
      );
      return Number(rows?.[0]?.c || 0);
    },
  };
}
