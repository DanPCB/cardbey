import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pub = join(root, 'public');

mkdirSync(dist, { recursive: true });

for (const name of ['appinfo.json', 'icon.png', 'largeIcon.png']) {
  const from = join(pub, name);
  if (!existsSync(from)) {
    throw new Error(`Missing public asset: ${name}`);
  }
  copyFileSync(from, join(dist, name));
}

console.log('Copied webOS assets into dist/');
