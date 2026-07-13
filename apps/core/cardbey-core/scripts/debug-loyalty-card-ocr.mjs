#!/usr/bin/env node
/**
 * Standalone loyalty-card OCR accuracy probe.
 *
 * Usage:
 *   npm run debug:loyalty-ocr -- --image "C:\path\with spaces\card.png"
 *   npm run debug:loyalty-ocr -- --text path/to/ocr.txt
 *   npm run debug:loyalty-ocr -- --sample one-token-per-line
 *
 * Requires OPENAI_API_KEY (or ANTHROPIC_API_KEY) in apps/core/cardbey-core/.env
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';

// Load .env from package root BEFORE any module that reads OPENAI_API_KEY at import time.
await import('../src/env/loadEnv.js');

const { ocrExtractText } = await import('../src/lib/ocr/ocrProvider.js');
const { runOcr } = await import('../src/modules/vision/runOcr.js');
const { parseLoyaltyCardTopologyFromOcr } = await import(
  '../src/lib/loyalty/loyaltyOcrTopologyParser.js'
);
const { extractLoyaltyCardTopology } = await import(
  '../src/lib/loyalty/loyaltyTopologyExtraction.js'
);
const { tryReconcileLoyaltyFromOcr } = await import(
  '../src/lib/loyalty/loyaltyTopologyOcrReconcile.js'
);

const EXPECTED = Object.freeze({
  rows: 4,
  columns: 8,
  purchasesPerRow: 7,
  rewardPerRow: 1,
  footer: 'Catering Available',
});

function buildOneTokenPerLineSample(purchasesPerRow = 7, rows = 4) {
  const rowLines = [...Array.from({ length: purchasesPerRow }, () => 'Coffee'), 'Free'];
  const body = Array.from({ length: rows }, () => rowLines.join('\n')).join('\n');
  return `${body}\nCatering Available`;
}

const SAMPLES = {
  'one-token-per-line': buildOneTokenPerLineSample(7, 4),
  'row-lines': [
    ...Array.from({ length: 4 }, () => 'Coffee Coffee Coffee Coffee Coffee Coffee Coffee Free'),
    'Catering Available',
  ].join('\n'),
  'under-count-row-lines': [
    ...Array.from({ length: 4 }, () => 'Coffee Coffee Coffee Coffee Coffee Free'),
    'Catering Available',
  ].join('\n'),
  'logged-session': buildOneTokenPerLineSample(5, 4),
};

function usage() {
  console.log(`Loyalty card OCR accuracy probe

Options:
  --image <path>            Run live OCR on image file (quote paths with spaces)
  --text <path>             Parse topology from saved OCR text file
  --sample <name>           Built-in samples: ${Object.keys(SAMPLES).join(', ')}
  --stdin                   Read OCR text from stdin
  --expected <rows>x<cols>   Override expected grid (default 4x8)
  --json                    Emit machine-readable JSON only
  --linear-ocr              Force legacy linear OCR instead of GPT grid vision
  -h, --help                Show this help

Env (apps/core/cardbey-core/.env):
  OPENAI_API_KEY            Primary vision OCR
  ANTHROPIC_API_KEY         Fallback when OpenAI refuses or is unavailable
`);
}

function consumePathArg(argv, startIndex) {
  const parts = [];
  let i = startIndex;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith('-') && token !== '-') break;
    parts.push(token);
    i += 1;
  }
  return { value: parts.join(' ').trim(), nextIndex: i - 1 };
}

function parseArgs(argv) {
  /** @type {{ image?: string; text?: string; sample?: string; stdin?: boolean; json?: boolean; linearOcr?: boolean; expected?: { rows: number; columns: number } }} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--image') {
      const { value, nextIndex } = consumePathArg(argv, i + 1);
      out.image = value;
      i = nextIndex;
    } else if (arg === '--text') {
      const { value, nextIndex } = consumePathArg(argv, i + 1);
      out.text = value;
      i = nextIndex;
    } else if (arg === '--sample') out.sample = argv[++i];
    else if (arg === '--stdin') out.stdin = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--linear-ocr') out.linearOcr = true;
    else if (arg === '--expected') {
      const m = String(argv[++i] ?? '').match(/^(\d+)x(\d+)$/);
      if (m) out.expected = { rows: Number(m[1]), columns: Number(m[2]) };
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }
  }
  return out;
}

function logEnvStatus() {
  const openai = Boolean(String(process.env.OPENAI_API_KEY ?? '').trim());
  const anthropic = Boolean(String(process.env.ANTHROPIC_API_KEY ?? '').trim());
  console.error(
    `[env] OPENAI_API_KEY=${openai ? 'present' : 'missing'} | ANTHROPIC_API_KEY=${anthropic ? 'present' : 'missing'}`,
  );
  if (!openai && !anthropic) {
    console.error(
      '[env] Add OPENAI_API_KEY to apps/core/cardbey-core/.env (or .env.local) and retry.',
    );
  }
}

function imagePathToDataUrl(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(
      `Image not found: ${abs}\n` +
        'Tip: quote paths with spaces, e.g. --image "C:\\Users\\you\\Desktop\\Screenshot 2026.png"',
    );
  }
  const ext = extname(abs).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const base64 = readFileSync(abs).toString('base64');
  return `data:${mime};base64,${base64}`;
}

async function runLiveOcr(imageDataUrl, useGridVision = true) {
  if (useGridVision) {
    const { extractLoyaltyCardGridFromVision } = await import(
      '../src/lib/loyalty/loyaltyCardGridVisionExtract.js'
    );
    const grid = await extractLoyaltyCardGridFromVision({ imageUrl: imageDataUrl });
    if (grid?.ok) {
      return {
        text: grid.ocrText ?? JSON.stringify(grid.rawParsed ?? grid.detected ?? {}, null, 2),
        provider: 'gpt4o_grid_vision',
        grid,
      };
    }
    console.error(`[OCR] Grid vision failed (${grid?.reason ?? 'unknown'}), falling back to linear OCR ...`);
  }
  try {
    const ocrResult = await ocrExtractText({
      imageDataUrl,
      context: { purpose: 'intake_attachment' },
    });
    if (ocrResult.text?.trim()) {
      return { text: ocrResult.text.trim(), provider: ocrResult.provider ?? 'openai_vision' };
    }
  } catch (openaiErr) {
    console.error(
      `[OCR] OpenAI path failed: ${openaiErr instanceof Error ? openaiErr.message : openaiErr}`,
    );
  }

  if (!String(process.env.ANTHROPIC_API_KEY ?? '').trim()) {
    throw new Error(
      'Live OCR failed. Set OPENAI_API_KEY in apps/core/cardbey-core/.env (or ANTHROPIC_API_KEY for fallback).',
    );
  }

  console.error('[OCR] Trying Anthropic vision fallback (task: loyalty_card) ...');
  const text = await runOcr(imageDataUrl, { task: 'loyalty_card' });
  if (!text?.trim()) {
    throw new Error('OCR returned empty text from all providers.');
  }
  return { text: text.trim(), provider: 'anthropic_vision_fallback' };
}

function countTokens(ocrText) {
  const tokens = String(ocrText ?? '').match(/\b(coffee|free|tea|latte|espresso)\b/gi) ?? [];
  const coffee = tokens.filter((t) => /^(coffee|tea|latte|espresso)$/i.test(t)).length;
  const free = tokens.filter((t) => /^free$/i.test(t)).length;
  const lines = String(ocrText ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { coffee, free, totalTokens: tokens.length, lineCount: lines.length, lines };
}

function scoreLayout(actual, expected) {
  if (!actual?.rows || !actual?.columns) {
    return { match: false, rowsOk: false, columnsOk: false, purchasesOk: false, score: 0 };
  }
  const purchasesPerRow = actual.columns - 1;
  const rowsOk = actual.rows === expected.rows;
  const columnsOk = actual.columns === expected.columns;
  const purchasesOk = purchasesPerRow === expected.purchasesPerRow;
  const match = rowsOk && columnsOk && purchasesOk;
  const score = (rowsOk ? 1 : 0) + (columnsOk ? 1 : 0) + (purchasesOk ? 1 : 0);
  return { match, rowsOk, columnsOk, purchasesOk, score, purchasesPerRow };
}

function analyzeOcrText(ocrText, expected, source) {
  const tokenStats = countTokens(ocrText);
  const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
  const reconcile = tryReconcileLoyaltyFromOcr(ocrText, {});

  const layouts = [
    {
      name: 'parseLoyaltyCardTopologyFromOcr',
      method: parsed?.method ?? null,
      rows: parsed?.detected?.rows ?? null,
      columns: parsed?.detected?.columns ?? null,
      confidence: parsed?.detected?.overallConfidence ?? null,
      score: scoreLayout(parsed?.detected, expected),
    },
    {
      name: 'tryReconcileLoyaltyFromOcr',
      method: reconcile?.method ?? null,
      rows: reconcile?.cardTopology?.rows ?? null,
      columns: reconcile?.cardTopology?.columns ?? null,
      confidence: reconcile?.cardTopology?.confidence ?? null,
      purchasesRequired: reconcile?.rule?.purchasesRequired ?? null,
      score: scoreLayout(reconcile?.cardTopology, expected),
    },
  ];

  return {
    source,
    ocrText,
    tokenStats,
    footerDetected: parsed?.detected?.footerText ?? null,
    layouts,
    bestLayout:
      layouts
        .filter((l) => l.rows && l.columns)
        .sort((a, b) => b.score.score - a.score.score)[0] ?? null,
  };
}

async function analyzeOcrTextAsync(ocrText, expected, source, gridResult = null) {
  const base = analyzeOcrText(ocrText, expected, source);

  /** @type {Record<string, unknown> | null} */
  let gptGridVision = null;
  if (gridResult?.ok && gridResult.cardTopology) {
    gptGridVision = {
      method: gridResult.extractionMethod ?? 'gpt4o_grid_vision',
      rows: gridResult.cardTopology.rows ?? null,
      columns: gridResult.cardTopology.columns ?? null,
      purchasesRequired: gridResult.rule?.purchasesRequired ?? null,
      footer: gridResult.cardTopology.footerText ?? gridResult.detected?.footerText ?? null,
      confidence: gridResult.confidence ?? gridResult.cardTopology.confidence ?? null,
      score: scoreLayout(gridResult.cardTopology, expected),
    };
  }

  // When grid vision succeeded, skip LLM-on-footer re-extraction (misleading 1×1).
  let extraction = null;
  if (!gridResult?.ok) {
    try {
      extraction = await extractLoyaltyCardTopology({ ocrText, missionId: 'ocr_probe' });
    } catch (err) {
      extraction = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const layouts = [...base.layouts];
  if (gptGridVision) {
    layouts.unshift({
      name: 'extractLoyaltyCardGridFromVision (GPT-4o)',
      method: gptGridVision.method,
      rows: gptGridVision.rows,
      columns: gptGridVision.columns,
      confidence: gptGridVision.confidence,
      purchasesRequired: gptGridVision.purchasesRequired,
      score: gptGridVision.score,
    });
  }

  const bestLayout =
    layouts
      .filter((l) => l.rows && l.columns)
      .sort((a, b) => b.score.score - a.score.score)[0] ?? null;

  return {
    ...base,
    layouts,
    bestLayout,
    gptGridVision,
    extractLoyaltyCardTopology: extraction?.ok
      ? {
          method: extraction.extractionMethod ?? null,
          rows: extraction.cardTopology?.rows ?? null,
          columns: extraction.cardTopology?.columns ?? null,
          purchasesRequired: extraction.rule?.purchasesRequired ?? null,
          footer: extraction.cardTopology?.footerText ?? null,
          score: scoreLayout(extraction.cardTopology, expected),
        }
      : extraction,
    primaryPath: gridResult?.ok ? 'gpt4o_grid_vision' : 'ocr_token_pipeline',
  };
}

function printHumanReport(report, expected) {
  console.log('\n=== Loyalty Card OCR Probe ===\n');
  console.log(`Source: ${report.source}`);
  console.log(
    `Expected grid: ${expected.rows}×${expected.columns} (${expected.purchasesPerRow} purchases + ${expected.rewardPerRow} reward per row)`,
  );
  console.log(`Footer expected: "${expected.footer}"`);
  if (report.primaryPath === 'gpt4o_grid_vision') {
    console.log(`Primary path: GPT-4o structured grid vision (production intake uses this)`);
  } else {
    console.log(`Primary path: OCR token pipeline`);
  }
  console.log('\n--- Token stats ---');
  console.log(
    `Coffee-like: ${report.tokenStats.coffee} | Free: ${report.tokenStats.free} | Lines: ${report.tokenStats.lineCount}`,
  );
  if (report.tokenStats.free > 0) {
    const impliedPurchasesPerRow = report.tokenStats.coffee / report.tokenStats.free;
    console.log(
      `Implied from token counts: ${report.tokenStats.free} rows × ${Number.isInteger(impliedPurchasesPerRow) ? impliedPurchasesPerRow : impliedPurchasesPerRow.toFixed(2)} purchases + 1 reward`,
    );
  }
  console.log(`Footer detected: ${report.footerDetected ? `"${report.footerDetected}"` : '(none)'}`);

  console.log('\n--- Raw OCR / auxiliary text ---');
  console.log(report.ocrText || '(empty)');
  if (report.gptGridVision?.footer) {
    console.log(`Grid vision footer: "${report.gptGridVision.footer}"`);
  }

  console.log('\n--- Parser results ---');
  for (const layout of report.layouts) {
    const s = layout.score;
    const status = s.match ? 'PASS' : s.score > 0 ? 'PARTIAL' : 'MISS';
    console.log(
      `[${status}] ${layout.name}: ${layout.rows ?? '?'}×${layout.columns ?? '?'} via ${layout.method ?? 'n/a'} (confidence ${layout.confidence ?? 'n/a'})`,
    );
    if (layout.purchasesRequired != null) {
      console.log(`         purchasesRequired=${layout.purchasesRequired}`);
    }
  }

  if (report.extractLoyaltyCardTopology && report.primaryPath !== 'gpt4o_grid_vision') {
    const ex = report.extractLoyaltyCardTopology;
    if (ex.ok === false) {
      console.log(`\n[FAIL] extractLoyaltyCardTopology: ${ex.error}`);
    } else {
      const status = ex.score?.match ? 'PASS' : ex.score?.score > 0 ? 'PARTIAL' : 'MISS';
      console.log(
        `\n[${status}] extractLoyaltyCardTopology: ${ex.rows}×${ex.columns} via ${ex.method} | purchasesRequired=${ex.purchasesRequired}`,
      );
    }
  }

  if (report.bestLayout) {
    const b = report.bestLayout;
    console.log(
      `\nBest result: ${b.name} → ${b.rows}×${b.columns} (${b.score.match ? 'matches expected' : 'does NOT match expected'})`,
    );
  } else {
    console.log('\nBest result: none detected a grid');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expected = {
    ...EXPECTED,
    ...(args.expected
      ? {
          rows: args.expected.rows,
          columns: args.expected.columns,
          purchasesPerRow: args.expected.columns - 1,
        }
      : {}),
  };

  let ocrText = '';
  let source = 'unknown';
  let gridResult = null;

  if (args.image) {
    logEnvStatus();
    source = `live-ocr:${resolve(args.image)}`;
    const imageDataUrl = imagePathToDataUrl(args.image);
    console.error(`Running live OCR on ${source} ...`);
    const ocrResult = await runLiveOcr(imageDataUrl, !args.linearOcr);
    ocrText = ocrResult.text;
    gridResult = ocrResult.grid ?? null;
    console.error(`OCR provider: ${ocrResult.provider}`);
    if (ocrResult.grid?.ok) {
      console.error(
        `[grid] ${ocrResult.grid.cardTopology?.rows}×${ocrResult.grid.cardTopology?.columns} purchasesRequired=${ocrResult.grid.rule?.purchasesRequired ?? '?'}`,
      );
    }
  } else if (args.text) {
    source = `file:${resolve(args.text)}`;
    ocrText = readFileSync(resolve(args.text), 'utf8');
  } else if (args.sample) {
    const key = String(args.sample).trim();
    if (!SAMPLES[key]) {
      console.error(`Unknown sample "${key}". Available: ${Object.keys(SAMPLES).join(', ')}`);
      process.exit(1);
    }
    source = `sample:${key}`;
    ocrText = SAMPLES[key];
  } else if (args.stdin) {
    source = 'stdin';
    ocrText = readFileSync(0, 'utf8');
  } else {
    usage();
    process.exit(1);
  }

  const report = await analyzeOcrTextAsync(ocrText.trim(), expected, source, gridResult);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, expected);
  }

  const bestScore = Math.max(
    report.gptGridVision?.score?.score ?? 0,
    report.bestLayout?.score?.score ?? 0,
    report.extractLoyaltyCardTopology?.score?.score ?? 0,
  );
  process.exit(bestScore >= 3 ? 0 : bestScore > 0 ? 1 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
