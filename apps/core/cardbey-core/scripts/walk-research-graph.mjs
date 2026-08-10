import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seen = new Set();
const missing = [];
const ok = [];

function walk(rel) {
  const abs = path.resolve(root, rel);
  if (seen.has(abs)) return;
  seen.add(abs);
  if (!fs.existsSync(abs)) {
    missing.push(rel + ' (missing file)');
    return;
  }
  ok.push(path.relative(root, abs).replace(/\\/g, '/'));
  let src;
  try {
    src = fs.readFileSync(abs, 'utf8');
  } catch {
    return;
  }
  const re = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    let next = path.resolve(path.dirname(abs), spec);
    const relNext = path.relative(root, next).replace(/\\/g, '/');
    if (!path.extname(next)) {
      if (fs.existsSync(next + '.js')) next = next + '.js';
      else if (fs.existsSync(next + '.mjs')) next = next + '.mjs';
      else if (fs.existsSync(next + '.ts')) {
        missing.push(relNext + ' (extensionless -> .ts only)');
        continue;
      } else {
        missing.push(relNext + ' (extensionless, missing)');
        continue;
      }
    } else if (!fs.existsSync(next) && String(next).endsWith('.js')) {
      const ts = next.replace(/\.js$/, '.ts');
      if (fs.existsSync(ts)) {
        missing.push(relNext + ' (.js missing, .ts exists)');
        continue;
      }
      missing.push(relNext + ' (missing)');
      continue;
    } else if (!fs.existsSync(next)) {
      missing.push(relNext + ' (missing)');
      continue;
    }
    if (/\.(js|mjs|cjs)$/.test(next)) walk(path.relative(root, next));
  }
}

const entry = process.argv[2] || 'src/lib/storeCreationResearch/index.js';
walk(entry);
console.log('OK count', ok.length);
console.log('MISSING count', new Set(missing).size);
for (const x of [...new Set(missing)].sort()) console.log(' -', x);
