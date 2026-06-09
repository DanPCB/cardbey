# Cardbey Truth Enforcer (VS Code / Cursor extension)

Workspace extension that surfaces truth-enforcer violations as editor diagnostics.

## Install locally

From the monorepo root:

```bash
# VS Code / Cursor CLI
code --install-extension ./extensions/cardbey-truth-enforcer
```

Or open `extensions/cardbey-truth-enforcer` and press **F5** to launch an Extension Development Host.

## Settings (`.vscode/settings.json`)

```json
{
  "editor.codeActionsOnSave": {
    "source.truthEnforce": "explicit"
  },
  "truthEnforcer.enable": true,
  "truthEnforcer.autoFixOnSave": false,
  "truthEnforcer.strictMode": false
}
```

## CLI (used by extension + pre-commit)

```bash
pnpm run truth:check
pnpm run truth:fix
node scripts/truth-enforcer/index.mjs --json --quiet --file path/to/file.js
```
