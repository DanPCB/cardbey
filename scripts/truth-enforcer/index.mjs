#!/usr/bin/env node
// scripts/truth-enforcer/index.mjs — monorepo canonical truth enforcer CLI

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const traverse = traverseModule.default ?? traverseModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const CONFIG = {
  forbiddenPatterns: [
    {
      id: 'FAKE_HERO_UPDATE',
      pattern: /heroUpdated:\s*true/,
      message: 'Fake hero update - no DB write detected',
      fix: 'Return { status: "blocked", reason: "hero_generation_not_available" }',
      severity: 'error',
    },
    {
      id: 'FAKE_STATUS_OK',
      pattern: /return\s*\{\s*status:\s*['"]ok['"],?\s*(?:[^}]*\})/,
      message: 'Status "ok" returned without evidence of side effect',
      fix: 'Add actual DB/API operation or return honest failure status',
      severity: 'error',
    },
    {
      id: 'EMPTY_CATCH',
      pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
      message: 'Empty catch block swallows errors',
      fix: 'Add error handling: console.error, return failed status, or rethrow',
      severity: 'error',
    },
    {
      id: 'STUB_SUCCESS',
      pattern: /stub:\s*true.*status:\s*['"]ok['"]/,
      message: 'Stub executor returning success',
      fix: 'Either implement real logic or return status: "blocked"',
      severity: 'error',
    },
    {
      id: 'PLACEHOLDER_DATA',
      pattern: /url:\s*null.*placeholder:\s*true/,
      message: 'Placeholder URL returned as success',
      fix: 'Return honest failure or implement actual asset generation',
      severity: 'warning',
    },
    {
      id: 'TODO_SUCCESS',
      pattern: /\/\/\s*TODO.*return\s*\{\s*status:\s*['"]ok['"]/,
      message: 'TODO comment with success return - not actually implemented',
      fix: 'Remove TODO and implement, or return blocked status',
      severity: 'error',
    },
  ],
  requiresCheckpointAuthority: [
    'apps/core/cardbey-core/src/routes/stores.js',
    'apps/core/cardbey-core/src/lib/toolExecutors/store/structured_store_build.js',
    'apps/core/cardbey-core/src/routes/draftStore.js',
  ],
  requiresAuthorityForWrites: ['heroUrl', 'logoUrl', 'videoUrl', 'graphicUrl'],
  requiredRealExecutors: [
    'structured_store_build',
    'analyze_store',
    'create_offer_draft',
    'revise_offer_draft',
  ],
  registryPath: 'apps/core/cardbey-core/src/lib/toolExecutors/index.js',
};

function toRepoRelative(filePath) {
  const normalized = path.normalize(filePath);
  if (path.isAbsolute(normalized)) {
    return path.relative(REPO_ROOT, normalized).split(path.sep).join('/');
  }
  return normalized.replace(/\\/g, '/');
}

function resolveReadablePath(filePath) {
  const rel = toRepoRelative(filePath);
  const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, rel);
  return { rel, abs };
}

class TruthEnforcer {
  constructor(options = {}) {
    this.fix = options.fix || false;
    this.strict = options.strict || false;
    this.quiet = options.quiet || false;
    this.files = options.files || null;
    this.fileMode = Array.isArray(options.files) && options.files.length > 0;
    this.audit = options.audit || false;
    this.withRegistry = options.withRegistry || false;
    this.violations = [];
  }

  log(...args) {
    if (!this.quiet) console.log(...args);
  }

  async run() {
    this.log(chalk.blue('🔍 Cardbey Truth Enforcer v1.0'));
    this.log(chalk.gray('Checking for fake functions and hidden lies...\n'));

    const filesToCheck = this.getFilesToCheck();
    if (filesToCheck.length === 0) {
      this.log(chalk.yellow('No staged changes to check.'));
      this.log(
        chalk.gray(
          'Truth enforcer scans files with staged modifications only (git diff --cached). ' +
            '`git add` on an unchanged file does not queue it for check.',
        ),
      );
      this.log(
        chalk.gray(
          '  • Stage a modified file: git add path/to/file.js\n' +
            '  • Or check one path directly: node scripts/truth-enforcer/index.mjs --file path/to/file.js',
        ),
      );
      return true;
    }

    if (this.audit) {
      this.log(`Auditing ${filesToCheck.length} tracked file(s) under apps/, packages/, scripts/...\n`);
    } else if (this.fileMode) {
      this.log(`Checking ${filesToCheck.length} file(s) directly (bypasses git staging)...\n`);
    } else {
      this.log(`Checking ${filesToCheck.length} staged file(s)...\n`);
    }

    for (const file of filesToCheck) {
      await this.checkFile(file);
    }

    if (this.audit || !this.fileMode || this.withRegistry) {
      await this.checkToolRegistry();
    }
    return await this.report();
  }

  getFilesToCheck() {
    if (this.audit) return this.getAuditFiles();
    if (Array.isArray(this.files) && this.files.length > 0) {
      return this.files
        .map((f) => toRepoRelative(f))
        .filter((f) => f.match(/\.(js|ts|jsx|tsx|mjs|cjs)$/))
        .filter((f) => !f.includes('node_modules'))
        .filter((f) => !f.includes('dist'))
        .filter((f) => !f.includes('build'));
    }
    return this.getStagedFiles();
  }

  getAuditFiles() {
    try {
      const output = execSync('git ls-files apps packages scripts', {
        encoding: 'utf-8',
        cwd: REPO_ROOT,
        maxBuffer: 64 * 1024 * 1024,
      });
      return output
        .split('\n')
        .filter((f) => f.trim())
        .filter((f) => /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f))
        .filter((f) => !f.includes('node_modules'))
        .filter((f) => !f.includes('/dist/'))
        .filter((f) => !f.includes('/build/'))
        .filter((f) => !f.endsWith('.min.js'));
    } catch {
      return [];
    }
  }

  getStagedFiles() {
    try {
      const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
        encoding: 'utf-8',
        cwd: REPO_ROOT,
      });
      return output
        .split('\n')
        .filter((f) => f.trim())
        .filter((f) => f.match(/\.(js|ts|jsx|tsx)$/))
        .filter((f) => !f.includes('node_modules'))
        .filter((f) => !f.includes('dist'))
        .filter((f) => !f.includes('build'));
    } catch {
      return [];
    }
  }

  async checkFile(filePath) {
    const { rel, abs } = resolveReadablePath(filePath);
    if (!existsSync(abs)) return;

    const content = readFileSync(abs, 'utf-8');

    for (const pattern of CONFIG.forbiddenPatterns) {
      if (pattern.pattern.test(content)) {
        const astViolations = await this.checkWithAST(rel, abs, content, pattern);
        if (astViolations.length > 0) {
          this.violations.push(...astViolations);
        }
      }
    }

    if (CONFIG.requiresCheckpointAuthority.includes(rel)) {
      const authorityViolations = this.checkCheckpointAuthority(rel, content);
      this.violations.push(...authorityViolations);
    }
  }

  async checkWithAST(relPath, absPath, content, pattern) {
    const violations = [];
    const enforcer = this;

    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
      });

      let lineNumber = 1;

      traverse(ast, {
        enter(nodePath) {
          if (nodePath.node.loc) {
            lineNumber = nodePath.node.loc.start.line;
          }

          if (t.isReturnStatement(nodePath.node)) {
            const code = content.slice(nodePath.node.start, nodePath.node.end);

            if (pattern.id === 'FAKE_HERO_UPDATE' && code.includes('heroUpdated: true')) {
              const surroundingCode = enforcer.getSurroundingCode(content, nodePath.node.start, 200);
              const hasDbWrite =
                surroundingCode.includes('prisma.') ||
                surroundingCode.includes('fs.write') ||
                surroundingCode.includes('fetch');

              if (!hasDbWrite) {
                violations.push({
                  file: relPath,
                  line: lineNumber,
                  pattern: pattern.id,
                  message: pattern.message,
                  fix: pattern.fix,
                  severity: pattern.severity,
                  code: code.trim(),
                });
              }
            }

            if (pattern.id === 'FAKE_STATUS_OK' && pattern.pattern.test(code)) {
              const hasSideEffect = enforcer.checkForSideEffects(nodePath, content);
              const declaredPure = enforcer.isDeclaredPureTransform(nodePath, content);
              if (!hasSideEffect && !declaredPure) {
                violations.push({
                  file: relPath,
                  line: lineNumber,
                  pattern: pattern.id,
                  message: pattern.message,
                  fix: pattern.fix,
                  severity: pattern.severity,
                  code: code.trim(),
                });
              }
            }
          }

          if (pattern.id === 'EMPTY_CATCH' && t.isCatchClause(nodePath.node)) {
            const body = nodePath.node.body;
            if (t.isBlockStatement(body) && body.body.length === 0) {
              violations.push({
                file: relPath,
                line: lineNumber,
                pattern: pattern.id,
                message: pattern.message,
                fix: pattern.fix,
                severity: pattern.severity,
                code: 'catch (err) { }',
              });
            }
          }
        },
      });
    } catch {
      if (pattern.pattern.test(content)) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (pattern.pattern.test(lines[i])) {
            violations.push({
              file: relPath,
              line: i + 1,
              pattern: pattern.id,
              message: pattern.message,
              fix: pattern.fix,
              severity: pattern.severity,
              code: lines[i].trim(),
            });
          }
        }
      }
    }

    return violations;
  }

  checkForSideEffects(nodePath, content) {
    let current = nodePath.parentPath;
    while (
      current &&
      !t.isFunctionDeclaration(current.node) &&
      !t.isFunctionExpression(current.node) &&
      !t.isObjectMethod(current.node) &&
      !t.isArrowFunctionExpression(current.node)
    ) {
      current = current.parentPath;
    }

    if (current?.node) {
      const functionBody = content.slice(current.node.start, current.node.end);
      return /(prisma\.|fetch\(|axios\.|fs\.write|adapter\.invoke|await\s+\w+\.create|await\s+fn\(|await\s+\w+\(|\.save\(\))/.test(
        functionBody,
      );
    }

    return false;
  }

  // Sanctioned exemption: a function may declare itself a deterministic, IO-free
  // pure transform with an explicit `@pure-transform` marker in its body. This is
  // honest (status "ok" reflects a real computed result) and keeps FAKE_STATUS_OK
  // strict everywhere a side effect is actually expected.
  isDeclaredPureTransform(nodePath, content) {
    let current = nodePath.parentPath;
    while (
      current &&
      !t.isFunctionDeclaration(current.node) &&
      !t.isFunctionExpression(current.node) &&
      !t.isObjectMethod(current.node) &&
      !t.isArrowFunctionExpression(current.node)
    ) {
      current = current.parentPath;
    }

    if (current?.node) {
      const functionBody = content.slice(current.node.start, current.node.end);
      return /@pure-transform\b/.test(functionBody);
    }

    return false;
  }

  checkCheckpointAuthority(relPath, content) {
    const violations = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const field of CONFIG.requiresAuthorityForWrites) {
        if (
          line.includes(`.${field}`) &&
          (line.includes('prisma.') || line.includes('update(')) &&
          !line.includes('artifactCheckpointAuthority') &&
          !line.includes('checkpoint')
        ) {
          violations.push({
            file: relPath,
            line: i + 1,
            pattern: 'BYPASS_CHECKPOINT_AUTHORITY',
            message: `Direct write to ${field} without checkpoint authority`,
            fix: `Wrap ${field} update in artifactCheckpointAuthority.assertArtifact()`,
            severity: 'error',
            code: line.trim(),
          });
        }
      }
    }

    return violations;
  }

  async checkToolRegistry() {
    const registryPath = CONFIG.registryPath;
    const abs = path.join(REPO_ROOT, registryPath);
    if (!existsSync(abs)) return;

    const content = readFileSync(abs, 'utf-8');
    const violations = [];

    const stubMatches = content.match(/\/\/\s*STUB|stub:\s*true|placeholder:\s*true/g);
    if (stubMatches) {
      violations.push({
        file: registryPath,
        pattern: 'STUB_EXECUTOR',
        message: `Found ${stubMatches.length} stub executor(s) in registry`,
        fix: 'Replace stubs with real implementations or remove them',
        severity: this.strict ? 'error' : 'warning',
        code: stubMatches.join('\n'),
      });
    }

    for (const required of CONFIG.requiredRealExecutors) {
      const executorPattern = new RegExp(`${required}:\\s*\\{[^}]*stub:\\s*true`);
      if (executorPattern.test(content)) {
        violations.push({
          file: registryPath,
          pattern: 'REQUIRED_EXECUTOR_STUB',
          message: `Required executor '${required}' is a stub`,
          fix: `Implement real logic for ${required}`,
          severity: 'error',
          code: `${required}: { stub: true, ... }`,
        });
      }
    }

    this.violations.push(...violations);
  }

  getSurroundingCode(content, position, contextLength = 200) {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(content.length, position + contextLength);
    return content.slice(start, end);
  }

  async autoFix(violation) {
    if (!this.fix) return false;

    try {
      const { abs } = resolveReadablePath(violation.file);
      const content = readFileSync(abs, 'utf-8');
      const lines = content.split('\n');
      const lineIndex = violation.line - 1;

      switch (violation.pattern) {
        case 'FAKE_HERO_UPDATE':
          lines[lineIndex] = lines[lineIndex].replace(
            /heroUpdated:\s*true/,
            'status: "blocked", reason: "hero_generation_not_available"',
          );
          lines[lineIndex] = lines[lineIndex].replace(/status:\s*['"]ok['"]/, 'status: "blocked"');
          break;
        case 'EMPTY_CATCH':
          lines[lineIndex] = lines[lineIndex].replace(
            /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
            'catch (err) { console.error("Execution failed:", err); return { status: "failed", error: err.message }; }',
          );
          break;
        case 'BYPASS_CHECKPOINT_AUTHORITY':
          lines[lineIndex] = `// FIXME: ${violation.fix}\n${lines[lineIndex]}`;
          break;
        default:
          return false;
      }

      writeFileSync(abs, lines.join('\n'), 'utf-8');
      this.log(chalk.green(`  ✓ Auto-fixed: ${violation.file}:${violation.line}`));
      return true;
    } catch (error) {
      this.log(chalk.red(`  ✗ Failed to auto-fix: ${error.message}`));
      return false;
    }
  }

  async report() {
    const errors = this.violations.filter((v) => v.severity === 'error');
    const warnings = this.violations.filter((v) => v.severity === 'warning');

    if (!this.quiet) {
      console.log(chalk.bold('\n📊 Truth Enforcement Report\n'));
    }

    if (this.violations.length === 0) {
      this.log(chalk.green('✅ No truth violations found. Code is honest.'));
      return true;
    }

    if (!this.quiet) {
      console.log(chalk.yellow(`Found ${errors.length} error(s) and ${warnings.length} warning(s):\n`));
      for (const violation of this.violations) {
        const color = violation.severity === 'error' ? chalk.red : chalk.yellow;
        console.log(color(`  ${violation.severity.toUpperCase()}: ${violation.file}:${violation.line ?? '?'}`));
        console.log(chalk.gray(`    Pattern: ${violation.pattern}`));
        console.log(chalk.white(`    Message: ${violation.message}`));
        console.log(chalk.cyan(`    Fix: ${violation.fix}`));
        console.log(chalk.gray(`    Code: ${String(violation.code ?? '').substring(0, 100)}...`));
        console.log('');
      }
    }

    if (this.fix) {
      this.log(chalk.blue('🔧 Auto-fix mode enabled. Attempting fixes...\n'));
      let fixed = 0;
      for (const violation of this.violations) {
        if (await this.autoFix(violation)) fixed++;
      }
      this.log(chalk.green(`\n✓ Auto-fixed ${fixed} violations. Please review changes and commit again.`));
      return fixed > 0;
    }

    if (errors.length > 0) {
      if (this.fileMode) {
        this.log(chalk.red(`\n❌ File check failed: ${errors.length} error(s) must be fixed.`));
        this.log(
          chalk.cyan(
            '\nTo auto-fix this file: node scripts/truth-enforcer/index.mjs --fix --file <path>\n',
          ),
        );
      } else {
        this.log(chalk.red(`\n❌ Blocking commit: ${errors.length} error(s) must be fixed.`));
        this.log(chalk.cyan('\nTo auto-fix staged files, run: pnpm run truth:fix\n'));
      }
      return false;
    }

    if (this.fileMode) {
      this.log(chalk.yellow(`\n⚠️  ${warnings.length} warning(s) found in file check.`));
    } else {
      this.log(chalk.yellow(`\n⚠️  ${warnings.length} warning(s) found. Commit allowed but should be fixed.`));
    }
    return true;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const strict = args.includes('--strict');
  const quiet = args.includes('--quiet');
  const withRegistry = args.includes('--with-registry');
  const audit = args.includes('--audit');
  const fileIdx = args.indexOf('--file');
  const files = fileIdx >= 0 && args[fileIdx + 1] ? [args[fileIdx + 1]] : null;

  if (args.includes('--json')) {
    const enforcer = new TruthEnforcer({ fix: false, strict, quiet: true, files, withRegistry, audit });
    await enforcer.run();
    console.log(JSON.stringify(enforcer.violations, null, 2));
    process.exit(enforcer.violations.filter((v) => v.severity === 'error').length > 0 ? 1 : 0);
  }

  const enforcer = new TruthEnforcer({ fix, strict, quiet, files, withRegistry, audit });
  const success = await enforcer.run();
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
