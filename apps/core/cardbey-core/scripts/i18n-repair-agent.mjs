#!/usr/bin/env node
/**
 * i18n Repair Agent
 * Scans dashboard codebase for hardcoded strings and wires them to i18n keys
 * Run: node scripts/i18n-repair-agent.mjs [--dry-run] [--file=path] [--dir=path]
 */

import { scanHardcodedStrings } from '../src/lib/toolExecutors/i18n/scanHardcodedStrings.js'
import { checkI18nKey } from '../src/lib/toolExecutors/i18n/checkI18nKey.js'
import { generateI18nKey } from '../src/lib/toolExecutors/i18n/generateI18nKey.js'
import { translateString } from '../src/lib/toolExecutors/i18n/translateString.js'
import { addI18nKey } from '../src/lib/toolExecutors/i18n/addI18nKey.js'
import { wireI18nString } from '../src/lib/toolExecutors/i18n/wireI18nString.js'
import { runI18nTests } from '../src/lib/toolExecutors/i18n/runI18nTests.js'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const DASHBOARD_SRC = path.resolve(
  process.cwd(),
  '../../../apps/dashboard/cardbey-marketing-dashboard/src',
)

const I18N_SRC = path.resolve(
  process.cwd(),
  '../../../apps/dashboard/cardbey-marketing-dashboard/src/i18n.js',
)

const DASHBOARD_ROOT = path.resolve(DASHBOARD_SRC, '..')

const ACTIVE_LOCALES = ['vi']  // en is source, vi is target

const DRY_RUN = process.argv.includes('--dry-run')
const VERIFY = process.argv.includes('--verify')
const SINGLE_FILE = process.argv.find(a => a.startsWith('--file='))?.split('=')[1]
const SINGLE_DIR = process.argv.find(a => a.startsWith('--dir='))?.split('=')[1]

const PRIORITY_DIRS = [
  'components/frontscreen',
  'components/booking',
  'app/console',
  'components/assistant',
  'pages/public',
  'components/navigation',
  'pages/dashboard',
  'features',
]

const SKIP_FILES = [
  'i18n.js', '.test.', '.spec.', 
  'node_modules', '.d.ts', '__snapshots__'
]

// Stats
const stats = {
  filesScanned: 0,
  filesFixed: 0,
  stringsFound: 0,
  stringsWired: 0,
  keysAdded: 0,
  flaggedForReview: [],
  errors: [],
}

function getAllTsxFiles(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getAllTsxFiles(full))
    } else if (
      ['.tsx', '.ts', '.jsx', '.js'].includes(path.extname(entry.name)) &&
      !SKIP_FILES.some(s => full.includes(s))
    ) {
      results.push(full)
    }
  }
  return results
}

function runEslintCount(filePath, dashboardDir) {
  const eslintTarget = filePath.replace(/\\/g, '/')
  try {
    execSync(`npx eslint "${eslintTarget}" --format json`, {
      encoding: 'utf8',
      cwd: dashboardDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return 0
  } catch (err) {
    try {
      const stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString?.() ?? ''
      const output = JSON.parse(stdout)
      return output?.[0]?.errorCount ?? 0
    } catch {
      return 0
    }
  }
}

async function verifyFile(filePath, originalSource, dashboardDir) {
  if (!VERIFY) return { ok: true, message: 'skipped' }

  const ext = path.extname(filePath)
  const tempPath = filePath.slice(0, -ext.length) + '.__baseline__' + ext

  try {
    fs.writeFileSync(tempPath, originalSource, 'utf8')

    const baselineErrors = runEslintCount(tempPath, dashboardDir)
    const afterErrors = runEslintCount(filePath, dashboardDir)

    if (afterErrors > baselineErrors) {
      return {
        ok: false,
        message: `+${afterErrors - baselineErrors} new eslint error(s), ${baselineErrors} → ${afterErrors}`,
      }
    }

    return {
      ok: true,
      message: baselineErrors > 0 ? `${baselineErrors} pre-existing error(s) unchanged` : 'clean',
    }
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}

async function verifyWiredFile(filePath, backup) {
  const result = await verifyFile(filePath, backup, DASHBOARD_ROOT)
  if (!result.ok && backup != null) {
    fs.writeFileSync(filePath, backup, 'utf8')
  }
  return result
}

async function processFile(filePath) {
  console.log(`\n[SCAN] ${path.relative(DASHBOARD_SRC, filePath)}`)

  const fileBackup = !DRY_RUN ? fs.readFileSync(filePath, 'utf8') : null
  
  const scanResult = await scanHardcodedStrings({ filePath })
  if (!scanResult.ok || scanResult.skipped) return
  
  stats.filesScanned++
  stats.stringsFound += scanResult.found.length
  
  if (scanResult.found.length === 0) {
    console.log('  ✓ No hardcoded strings found')
    return
  }

  console.log(`  Found ${scanResult.found.length} hardcoded strings`)
  let fileFixed = false

  for (const item of scanResult.found) {
    console.log(`  → "${item.value}" (${item.type}, line ${item.line})`)

    // Generate key
    const keyResult = await generateI18nKey({ 
      value: item.value, 
      filePath 
    })
    
    // Check if key exists
    const checkResult = await checkI18nKey({ key: keyResult.fullKey, i18nPath: I18N_SRC })

    if (!checkResult.exists) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log(`    ⚠ No API key — skipping new key: ${keyResult.fullKey}`)
        stats.flaggedForReview.push({
          filePath,
          value: item.value,
          reason: 'no_api_key_for_translation',
        })
        continue
      }

      // Translate
      console.log(`    Translating "${item.value}"...`)
      const translateResult = await translateString({
        value: item.value,
        targetLocales: ACTIVE_LOCALES,
        context: `UI string in ${path.basename(filePath)}`,
      })

      if (!translateResult.ok) {
        console.log(`    ⚠ Translation failed — flagging for review`)
        stats.flaggedForReview.push({ filePath, value: item.value, reason: 'translation_failed' })
        continue
      }

      if (!DRY_RUN) {
        // Add key to i18n.js
        await addI18nKey({
          namespace: keyResult.namespace,
          key: keyResult.key,
          translations: translateResult.translations,
          i18nPath: I18N_SRC,
        })
        stats.keysAdded++
      } else {
        console.log(`    [DRY RUN] Would add key: ${keyResult.fullKey}`)
        console.log(`    [DRY RUN] Translations:`, translateResult.translations)
      }
    } else {
      console.log(`    ✓ Key exists: ${keyResult.fullKey}`)
    }

    if (!DRY_RUN) {
      // Wire the component
      const wireResult = await wireI18nString({
        filePath,
        originalString: item.value,
        i18nKey: keyResult.fullKey,
        namespace: keyResult.namespace,
        type: item.type,
        line: item.line,
        attr: item.attr,
      })

      if (wireResult.needsManualReview) {
        console.log(`    ⚠ Manual review: ${wireResult.reason}${wireResult.detail ? ` (${wireResult.detail})` : ''}`)
        stats.flaggedForReview.push({
          filePath,
          value: item.value,
          reason: wireResult.reason,
          detail: wireResult.detail,
          component: wireResult.component,
        })
        continue
      }

      if (wireResult.ok) {
        stats.stringsWired++
        fileFixed = true
        console.log(`    ✓ Wired: ${item.value} → t('${keyResult.fullKey}')`)
      } else {
        console.log(`    ✗ Wire failed`)
        stats.errors.push({ filePath, value: item.value })
      }
    } else {
      console.log(`    [DRY RUN] Would wire: t('${keyResult.fullKey}')`)
      stats.stringsWired++
    }
  }

  if (fileFixed) stats.filesFixed++

  if (fileFixed && fileBackup != null) {
    const verifyResult = await verifyWiredFile(filePath, fileBackup)
    if (!verifyResult.ok) {
      console.log(`    ✗ Verify failed — rolled back file (${verifyResult.message})`)
      stats.filesFixed -= 1
      stats.flaggedForReview.push({
        filePath,
        reason: 'verify_failed',
        message: verifyResult.message,
      })
    } else if (VERIFY) {
      console.log(`    ✓ eslint verify passed (${verifyResult.message})`)
    }
  }
}

async function main() {
  console.log('🌐 i18n Repair Agent')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}${VERIFY ? ' + VERIFY (eslint per file)' : ''}`)
  console.log(`Target: ${DASHBOARD_SRC}`)
  console.log(`Active locales: en (source) + ${ACTIVE_LOCALES.join(', ')}`)
  console.log('─'.repeat(60))

  let files = []

  if (SINGLE_FILE) {
    files = [path.resolve(SINGLE_FILE)]
  } else if (SINGLE_DIR) {
    files = getAllTsxFiles(path.resolve(SINGLE_DIR))
  } else {
    // Priority order
    for (const dir of PRIORITY_DIRS) {
      const fullDir = path.join(DASHBOARD_SRC, dir)
      files.push(...getAllTsxFiles(fullDir))
    }
    // Remove duplicates
    files = [...new Set(files)]
  }

  console.log(`Files to process: ${files.length}`)

  for (let i = 0; i < files.length; i++) {
    await processFile(files[i])

    // Run tests every 10 files
    if (!DRY_RUN && (i + 1) % 10 === 0) {
      console.log('\n[TEST] Running i18n tests...')
      const testResult = await runI18nTests()
      if (!testResult.ok) {
        console.error('❌ Tests failed — stopping agent')
        console.error(testResult.error)
        break
      }
      console.log(`✓ Tests passing (${testResult.passed} passed)`)
    }
  }

  // Final report
  console.log('\n' + '═'.repeat(60))
  console.log('📊 i18n Repair Agent — Final Report')
  console.log('═'.repeat(60))
  console.log(`Files scanned:     ${stats.filesScanned}`)
  console.log(`Files fixed:       ${stats.filesFixed}`)
  console.log(`Strings found:     ${stats.stringsFound}`)
  console.log(`Strings wired:     ${stats.stringsWired}`)
  console.log(`Keys added:        ${stats.keysAdded}`)
  console.log(`Flagged for review: ${stats.flaggedForReview.length}`)
  console.log(`Errors:            ${stats.errors.length}`)

  if (stats.flaggedForReview.length > 0) {
    console.log('\n⚠ Flagged for review:')
    stats.flaggedForReview.forEach(f => 
      console.log(`  ${path.relative(DASHBOARD_SRC, f.filePath)}: "${f.value}"`)
    )
  }

  if (stats.errors.length > 0) {
    console.log('\n✗ Errors:')
    stats.errors.forEach(e => 
      console.log(`  ${path.relative(DASHBOARD_SRC, e.filePath)}: "${e.value}"`)
    )
  }

  // Save report
  const report = {
    ...stats,
    localesCovered: ['en', ...ACTIVE_LOCALES],
    futureLocalesReady: ['zh', 'fr', 'es', 'ja', 'ko', 'th', 'id'],
    completedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
  }
  fs.writeFileSync('i18n-repair-report.json', JSON.stringify(report, null, 2))
  console.log('\n📄 Report saved to i18n-repair-report.json')
}

main().catch(console.error)