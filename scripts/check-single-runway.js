const fs = require("fs");
const path = require("path");

const DASHBOARD_ROOT = path.join(__dirname, "..", "apps", "dashboard");

// Forbidden patterns to prevent drift
const FORBIDDEN = [
  "/api/mi/orchestra/start",
  "startOrchestraTask(",
  "/api/chat/resolve-scope",
  "resolve-scope"
];

// Allowlist of files where these are permitted
// (keep this list small and explicit)
const ALLOWLIST = [
  // orchestration boundary module
  "executeOrchestra.ts",
  // if you have a mission-only chat module that can resolve scope safely, allow it:
  // "MissionExecutionChat.tsx",
];

const EXT_OK = [".ts", ".tsx", ".js", ".jsx"];

let violations = [];

function isAllowed(filePath) {
  return ALLOWLIST.some((a) => filePath.endsWith(a) || filePath.includes(a));
}

function scan(dir) {
  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      scan(full);
      continue;
    }

    const ext = path.extname(full);
    if (!EXT_OK.includes(ext)) continue;

    const content = fs.readFileSync(full, "utf8");

    for (const keyword of FORBIDDEN) {
      if (content.includes(keyword) && !isAllowed(full)) {
        violations.push({ file: full, keyword });
      }
    }
  }
}

scan(DASHBOARD_ROOT);

if (violations.length > 0) {
  console.error("\n❌ Single Runway guardrail violation(s) detected:\n");
  for (const v of violations) {
    console.error(`- ${v.file}\n  contains forbidden pattern: ${v.keyword}\n`);
  }
  console.error(
    "Fix: Artifact UIs must queue IntentRequest and execute only from Mission Execution.\n"
  );
  process.exit(1);
}

console.log("✅ Single Runway guardrails check passed");