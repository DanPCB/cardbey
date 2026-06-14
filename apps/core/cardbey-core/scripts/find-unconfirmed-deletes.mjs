#!/usr/bin/env node
/**
 * Scan dashboard/core for DELETE calls that may omit hybrid confirmation.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function findUnconfirmedDeletes() {
  console.log('Scanning for DELETE calls without confirmed: true...\n');

  const patterns = [
    { label: 'apiDELETE(', cmd: ['rg', 'apiDELETE\\(', 'apps/dashboard', '--glob', '*.{ts,tsx,js,jsx}'] },
    { label: 'method: "DELETE"', cmd: ['rg', 'method:\\s*[\'"]DELETE[\'"]', 'apps/dashboard', '--glob', '*.{ts,tsx,js,jsx}'] },
  ];

  let found = 0;

  for (const { label, cmd } of patterns) {
    try {
      const { stdout } = await execFileAsync(cmd[0], cmd.slice(1), { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.includes('confirmed: true'))
        .filter((line) => !line.includes('confirmedDelete'))
        .filter((line) => !line.includes('apiDELETEWithBody'));

      if (lines.length) {
        found += lines.length;
        console.log(`⚠️  ${label} — possible unconfirmed deletes:`);
        for (const line of lines) console.log(`  ${line}`);
        console.log('');
      }
    } catch (err) {
      if (err.code !== 1) {
        console.warn(`Scan failed for ${label}:`, err.message);
      }
    }
  }

  if (found === 0) {
    console.log('✅ No obvious unconfirmed DELETE calls found');
  } else {
    console.log(`Found ${found} candidate line(s) to review manually.`);
    process.exitCode = 1;
  }
}

findUnconfirmedDeletes().catch((err) => {
  console.error(err);
  process.exit(1);
});
