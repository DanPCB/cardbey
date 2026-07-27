/**
 * Report PDF Generator
 * 
 * Generates PDFs from TenantReport objects using pdfkit.
 */

import PDFDocument from 'pdfkit';

/**
 * Simple markdown text parser - extracts text and basic structure
 * @param {string} markdown - Markdown content
 * @returns {Array<{type: string, text: string, level?: number}>} Parsed content blocks
 */
function parseMarkdown(markdown) {
  if (!markdown || markdown.trim().length === 0) {
    return [{ type: 'text', text: 'No detailed content available for this report.' }];
  }

  const lines = markdown.split('\n');
  const blocks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue; // Skip empty lines
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.substring(4), level: 3 });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.substring(3), level: 2 });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.substring(2), level: 1 });
    }
    // Bullet lists
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ type: 'bullet', text: trimmed.substring(2) });
    }
    // Numbered lists
    else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ type: 'numbered', text: trimmed.replace(/^\d+\.\s/, '') });
    }
    // Regular text
    else {
      // Remove markdown formatting
      let text = trimmed
        .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
        .replace(/\*(.*?)\*/g, '$1') // Italic
        .replace(/`(.*?)`/g, '$1'); // Code

      blocks.push({ type: 'text', text });
    }
  }

  return blocks;
}

/**
 * Generate PDF from a TenantReport
 * 
 * @param {Object} report - TenantReport object
 * @param {Object} [options] - Optional options
 * @param {Object} [options.summaryData] - Optional executive summary data
 * @param {string} [options.tenantName] - Friendly tenant name (defaults to report.tenantId)
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateReportPdf(report, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const { summaryData, tenantName } = options;
      
      // Compute friendly tenant name
      const friendlyTenantName = tenantName || report.tenantName || report.tenantId;
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
        autoFirstPage: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => {
        buffers.push(chunk);
      });
      doc.on('end', () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          if (pdfBuffer.length === 0) {
            reject(new Error('PDF buffer is empty'));
            return;
          }
          resolve(pdfBuffer);
        } catch (bufferError) {
          reject(new Error(`Failed to create PDF buffer: ${bufferError.message}`));
        }
      });
      doc.on('error', (error) => {
        reject(new Error(`PDF generation error: ${error.message}`));
      });

      // Title - replace tenantId with friendly name if present in title
      let displayTitle = report.title || 'Report';
      if (report.tenantId && friendlyTenantName !== report.tenantId) {
        // Replace tenantId in title with friendly name
        displayTitle = displayTitle.replace(report.tenantId, friendlyTenantName);
      }
      
      doc.fontSize(24)
        .font('Helvetica-Bold')
        .text(displayTitle, {
          align: 'left',
        });

      doc.moveDown(0.5);

      // Subtitle/metadata
      const metadata = [];
      if (report.kind) {
        metadata.push(`Type: ${report.kind}`);
      }
      if (report.periodKey) {
        metadata.push(`Period: ${report.periodKey}`);
      }
      if (report.createdAt) {
        const date = new Date(report.createdAt);
        metadata.push(`Generated: ${date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`);
      }

      if (metadata.length > 0) {
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text(metadata.join(' • '), {
            align: 'left',
          });
      }

      doc.moveDown(1);

      // Horizontal rule
      doc.strokeColor('#cccccc')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();

      doc.moveDown(1.5);

      // Executive Summary (if available)
      if (summaryData && summaryData.summary) {
        doc.fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Executive Summary', {
            align: 'left',
          });

        doc.moveDown(0.5);

        const summaryText = String(summaryData.summary || '').trim();
        if (summaryText) {
          doc.fontSize(11)
            .font('Helvetica')
            .fillColor('#333333')
            .text(summaryText, {
              align: 'left',
              paragraphGap: 5,
            });
        }

        doc.moveDown(1);

        // Next Actions
        if (summaryData.nextActions && summaryData.nextActions.length > 0) {
          doc.fontSize(14)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('Recommended Next Actions', {
              align: 'left',
            });

          doc.moveDown(0.5);

          doc.fontSize(11)
            .font('Helvetica')
            .fillColor('#333333');

          for (const action of summaryData.nextActions) {
            const actionText = String(action || '').trim();
            if (actionText) {
              doc.text(`• ${actionText}`, {
                indent: 10,
                paragraphGap: 3,
              });
            }
          }

          doc.moveDown(1);
        }
      }

      // Report Content
      const contentMd = report.contentMd || '';
      const blocks = parseMarkdown(contentMd);

      for (const block of blocks) {
        // Check if we need a new page
        if (doc.y > 750) {
          doc.addPage();
        }

        try {
          switch (block.type) {
            case 'h1':
              const h1Text = String(block.text || '').trim();
              if (h1Text) {
                doc.fontSize(18)
                  .font('Helvetica-Bold')
                  .fillColor('#000000')
                  .text(h1Text, {
                    align: 'left',
                  });
                doc.moveDown(0.5);
              }
              break;

            case 'h2':
              const h2Text = String(block.text || '').trim();
              if (h2Text) {
                doc.fontSize(16)
                  .font('Helvetica-Bold')
                  .fillColor('#000000')
                  .text(h2Text, {
                    align: 'left',
                  });
                doc.moveDown(0.5);
              }
              break;

            case 'h3':
              const h3Text = String(block.text || '').trim();
              if (h3Text) {
                doc.fontSize(14)
                  .font('Helvetica-Bold')
                  .fillColor('#333333')
                  .text(h3Text, {
                    align: 'left',
                  });
                doc.moveDown(0.5);
              }
              break;

            case 'bullet':
            case 'numbered':
              const bulletText = String(block.text || '').trim();
              if (bulletText) {
                doc.fontSize(11)
                  .font('Helvetica')
                  .fillColor('#333333')
                  .text(`• ${bulletText}`, {
                    indent: 10,
                    paragraphGap: 3,
                  });
              }
              break;

            case 'text':
            default:
              // Ensure text is a string and not empty
              const text = String(block.text || '').trim();
              if (text) {
                doc.fontSize(11)
                  .font('Helvetica')
                  .fillColor('#333333')
                  .text(text, {
                    align: 'left',
                    paragraphGap: 5,
                  });
              }
              break;
          }
        } catch (blockError) {
          console.warn(`[ReportPDF] Error rendering block (non-critical):`, blockError.message);
          // Continue with next block
        }
      }

      // Ensure we have at least some content
      if (blocks.length === 0) {
        doc.fontSize(11)
          .font('Helvetica')
          .fillColor('#333333')
          .text('No detailed content available for this report.', {
            align: 'left',
          });
      }

      // Add footer to each page as it's created
      let pageNumber = 1;
      const addFooter = () => {
        try {
          doc.fontSize(8)
            .font('Helvetica')
            .fillColor('#999999')
            .text(
              `Cardbey Report • Page ${pageNumber}`,
              50,
              doc.page.height - 30,
              {
                align: 'center',
                width: doc.page.width - 100,
              }
            );
        } catch (footerError) {
          // Ignore footer errors - not critical
          console.warn('[ReportPDF] Footer error (non-critical):', footerError.message);
        }
      };

      // Add footer to first page
      addFooter();

      // Add footer to subsequent pages
      doc.on('pageAdded', () => {
        pageNumber++;
        addFooter();
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

