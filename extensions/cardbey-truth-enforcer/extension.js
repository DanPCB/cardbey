const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');
const util = require('util');

const execFileAsync = util.promisify(execFile);
const DIAGNOSTIC_SOURCE = 'cardbey-truth-enforcer';

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('truthEnforcer');
  return {
    enable: cfg.get('enable', true),
    autoFix: cfg.get('autoFixOnSave', false),
    strict: cfg.get('strictMode', false),
  };
}

function getRepoRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
}

async function runTruthEnforcer(filePath, options = {}) {
  const root = getRepoRoot();
  if (!root) return [];

  const script = path.join(root, 'scripts', 'truth-enforcer', 'index.mjs');
  const args = ['--json', '--quiet', '--file', filePath];
  if (options.strict) args.push('--strict');
  if (options.fix) args.push('--fix');

  try {
    const { stdout } = await execFileAsync('node', [script, ...args], {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout.trim() || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.stdout) {
      try {
        const parsed = JSON.parse(String(error.stdout).trim() || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function violationsToDiagnostics(violations) {
  return violations.map((v) => {
    const line = Math.max(0, (v.line || 1) - 1);
    const range = new vscode.Range(line, 0, line, 1000);
    const severity =
      v.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(
      range,
      `${v.pattern}: ${v.message}`,
      severity,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = v.pattern;
    return diagnostic;
  });
}

class TruthEnforceCodeActionProvider {
  provideCodeActions(document, _range, context) {
    const actions = [];
    const runAction = new vscode.CodeAction(
      'Run Truth Enforcer on file',
      vscode.CodeActionKind.Source.append('truthEnforce'),
    );
    runAction.command = {
      command: 'cardbey.truthEnforcer.runFile',
      title: 'Run Truth Enforcer',
      arguments: [document.uri],
    };
    actions.push(runAction);

    for (const diag of context.diagnostics) {
      if (diag.source !== DIAGNOSTIC_SOURCE) continue;
      const fixHint = new vscode.CodeAction(
        `Truth fix hint: ${diag.message}`,
        vscode.CodeActionKind.QuickFix,
      );
      fixHint.diagnostics = [diag];
      fixHint.isPreferred = true;
      actions.push(fixHint);
    }

    return actions;
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  context.subscriptions.push(collection);

  const runFile = async (uri) => {
    const cfg = getConfig();
    if (!cfg.enable) return;

    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) return;

    const filePath = targetUri.fsPath;
    if (!/\.(js|ts|jsx|tsx)$/i.test(filePath)) return;

    const violations = await runTruthEnforcer(filePath, {
      strict: cfg.strict,
      fix: cfg.autoFix,
    });
    collection.set(targetUri, violationsToDiagnostics(violations));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('cardbey.truthEnforcer.runFile', runFile),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!getConfig().enable) return;
      await runFile(doc.uri);
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: 'file', language: 'javascript' }, { scheme: 'file', language: 'typescript' }, { scheme: 'file', language: 'javascriptreact' }, { scheme: 'file', language: 'typescriptreact' }],
      new TruthEnforceCodeActionProvider(),
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.Source,
          vscode.CodeActionKind.Source.append('truthEnforce'),
          vscode.CodeActionKind.QuickFix,
        ],
      },
    ),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
