import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('webOS index boot diagnostic', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('shows Cardbey Player starting and boot stage helpers before the entry', () => {
    expect(html).toContain('Cardbey Player starting');
    expect(html).toContain('cardbey-boot');
    expect(html).toContain('__cardbeyBootStage');
    expect(html).toContain('id=\\"boot-stage\\"');
    expect(html).toContain('DOM_READY');
    const bootIdx = html.indexOf('__cardbeyBootStage');
    const entryIdx = html.indexOf('src="/src/main.ts"');
    expect(bootIdx).toBeGreaterThan(-1);
    expect(entryIdx).toBeGreaterThan(bootIdx);
  });

  it('uses ES5-safe inline diagnostic syntax', () => {
    const scriptMatch = html.match(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/);
    expect(scriptMatch).toBeTruthy();
    const script = scriptMatch![0];
    expect(script).not.toMatch(/\?\.|\?\?/);
    expect(script).not.toMatch(/=>/);
    expect(script).not.toMatch(/`/);
  });

  it('defines #app mount root and full-bleed baseline CSS', () => {
    expect(html).toContain('id="app"');
    expect(html).toMatch(/#app\s*\{[^}]*height:\s*100%/);
  });

  it('uses capture-phase resource error reporting', () => {
    expect(html).toContain('RESOURCE_LOAD_ERROR');
    expect(html).toContain('RUNTIME_ERROR');
    expect(html).toMatch(/addEventListener\(\s*"error"[\s\S]*?true\s*\)/);
  });
});
