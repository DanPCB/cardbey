/**
 * Test script for PDF generation
 * 
 * Usage:
 *   node scripts/testReportPdf.js <report-id>
 *   OR
 *   REPORT_ID=<report-id> node scripts/testReportPdf.js
 */

import { PrismaClient } from '@prisma/client';
import { generateReportPdf } from '../src/utils/reportPdf.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function testPdfGeneration() {
  try {
    // Get report ID from args or env
    const reportId = process.argv[2] || process.env.REPORT_ID;

    if (!reportId) {
      console.error('Error: Report ID required');
      console.error('Usage: node scripts/testReportPdf.js <report-id>');
      console.error('   OR: REPORT_ID=<report-id> node scripts/testReportPdf.js');
      process.exit(1);
    }

    console.log(`[Test] Loading report ${reportId}...`);

    // Load report
    const report = await prisma.tenantReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      console.error(`Error: Report ${reportId} not found`);
      process.exit(1);
    }

    console.log(`[Test] Found report: ${report.title}`);
    console.log(`[Test] Kind: ${report.kind}, Period: ${report.periodKey}`);
    console.log(`[Test] Content length: ${report.contentMd?.length || 0} chars`);

    // Generate PDF
    console.log(`[Test] Generating PDF...`);
    const startTime = Date.now();
    const pdfBuffer = await generateReportPdf(report);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`[Test] PDF generated in ${duration}s (${pdfBuffer.length} bytes)`);

    // Ensure tmp directory exists
    const tmpDir = join(process.cwd(), 'tmp');
    try {
      mkdirSync(tmpDir, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }

    // Write to file
    const outputPath = join(tmpDir, 'report.pdf');
    writeFileSync(outputPath, pdfBuffer);

    console.log(`[Test] ✓ PDF written to: ${outputPath}`);
    console.log(`[Test] Done!`);
  } catch (error) {
    console.error('[Test] Error:', error);
    console.error('[Test] Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPdfGeneration();

