/**
 * One-off codemod: replace runtime @prisma/client imports with client-gen via prismaClient.js
 * and module-level `new PrismaClient()` with the shared singleton from prisma.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(packageRoot, 'src');
const prismaClientFile = path.join(srcRoot, 'lib', 'prismaClient.js');
const prismaSingletonFile = path.join(srcRoot, 'lib', 'prisma.js');

const SKIP_FILES = new Set([
  path.normalize(prismaClientFile),
  path.normalize(prismaSingletonFile),
]);

function relImport(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function stripPrismaClientFromImport(importLine, clientRel) {
  const m = importLine.match(/^import\s+(\{[^}]+\})\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);
  if (!m) return importLine;
  const names = m[1]
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== 'PrismaClient' && s !== 'type PrismaClient');
  if (names.length === 0) return null;
  return `import { ${names.join(', ')} } from '${clientRel}';`;
}

function processFile(filePath) {
  if (SKIP_FILES.has(path.normalize(filePath))) return false;

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  if (!content.includes('@prisma/client')) return false;

  const clientRel = relImport(filePath, prismaClientFile);
  const prismaRel = relImport(filePath, prismaSingletonFile);

  content = content.replace(/import\(['"]@prisma\/client['"]\)/g, `import('${clientRel}')`);
  content = content.replace(
    /import\s+type\s+\{([^}]+)\}\s+from\s+['"]@prisma\/client['"]\s*;?/g,
    `import type {$1} from '${clientRel}';`,
  );
  content = content.replace(
    /import\s+\{([^}]+)\}\s+from\s+['"]@prisma\/client['"]\s*;?/g,
    `import {$1} from '${clientRel}';`,
  );

  const removedSingletonVars = new Set();
  content = content.replace(
    /^const\s+(prisma|db)\s*=\s*new\s+PrismaClient\s*\([^)]*\)\s*;?\s*\r?\n/gm,
    (_, name) => {
      removedSingletonVars.add(name);
      return '';
    },
  );

  if (removedSingletonVars.has('prisma') || removedSingletonVars.has('db')) {
    const wantPrisma = removedSingletonVars.has('prisma');
    const wantDb = removedSingletonVars.has('db');
    const hasPrismaImport =
      new RegExp(`import\\s+\\{[^}]*\\bprisma\\b[^}]*\\}\\s+from\\s+['"]${prismaRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(
        content,
      );
    if (wantPrisma && !hasPrismaImport) {
      const importLine = `import { prisma } from '${prismaRel}';\n`;
      const imports = [...content.matchAll(/^import .+;?\s*$/gm)];
      if (imports.length > 0) {
        const last = imports[imports.length - 1];
        const idx = last.index + last[0].length;
        content = `${content.slice(0, idx)}\n${importLine}${content.slice(idx)}`;
      } else {
        content = importLine + content;
      }
    }
    if (wantDb) {
      content = content.replace(
        /\bctx\.db\s*\|\|\s*new\s+PrismaClient\s*\(\)/g,
        `ctx.db || prisma`,
      );
      content = content.replace(
        /\bnew\s+PrismaClient\s*\(\)/g,
        'prisma',
      );
    }
  }

  content = content.replace(
    /\bctx\.db\s*\|\|\s*new\s+PrismaClient\s*\(\)/g,
    'ctx.db || prisma',
  );

  const lines = content.split('\n');
  const nextLines = [];
  for (const line of lines) {
    if (/^import\s+\{/.test(line) && line.includes(clientRel) && line.includes('PrismaClient')) {
      const stripped = stripPrismaClientFromImport(line.trim(), clientRel);
      if (stripped) nextLines.push(stripped);
      continue;
    }
    nextLines.push(line);
  }
  content = nextLines.join('\n');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = walk(srcRoot);
let changed = 0;
for (const f of files) {
  if (processFile(f)) {
    changed += 1;
    console.log('updated:', path.relative(packageRoot, f));
  }
}
console.log(`\nDone. ${changed} file(s) updated.`);
