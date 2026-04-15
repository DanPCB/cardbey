require("dotenv").config();
const url = process.env.DATABASE_URL;
console.log("=== ENV ===");
console.log("DATABASE_URL from .env:", url);

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient({
  datasources: { db: { url: "file:C:/Projects/cardbey/apps/core/cardbey-core/prisma/dev.db" } }
});

async function main() {
  console.log("\n=== RECENT ORCHESTRATOR TASKS ===");
  const tasks = await p.orchestratorTask.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, createdAt: true, missionId: true, entryPoint: true }
  });
  tasks.forEach(t => console.log(
    "task:", t.id, "entry:", t.entryPoint,
    "missionId:", t.missionId, "date:", t.createdAt
  ));

  console.log("\n=== RECENT MISSIONS ===");
  const missions = await p.mission.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, createdAt: true, context: true }
  });
  missions.forEach(m => {
    const ctx = typeof m.context === "string"
      ? JSON.parse(m.context) : (m.context || {});
    console.log(
      "mission:", m.id,
      "react_validation:", !!ctx.react_validation,
      "reasoning_log:", !!ctx.reasoning_log,
      "keys:", Object.keys(ctx).join(",") || "EMPTY"
    );
  });

  console.log("\n=== RECENT DRAFTS ===");
  const drafts = await p.draftStore.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, createdAt: true, status: true, mode: true }
  });
  drafts.forEach(d => console.log(
    "draft:", d.id, "mode:", d.mode, "status:", d.status, "date:", d.createdAt
  ));
}

main().catch(console.error).then(() => process.exit(0));
