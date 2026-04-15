/**
 * Report HTML Renderer
 * 
 * Converts TenantReport markdown content to HTML for PDF export
 */

/**
 * Simple markdown to HTML converter
 * For now, handles basic markdown syntax
 * Can be replaced with a library like 'marked' if needed
 */
function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  
  // Lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>');
  
  // Wrap consecutive list items in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/gim, (match) => {
    return '<ul>' + match + '</ul>';
  });
  
  // Paragraphs (lines that aren't headers or lists)
  html = html.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('</ul') || trimmed.startsWith('<li')) {
      return line;
    }
    return '<p>' + trimmed + '</p>';
  }).join('\n');
  
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/gim, '');
  
  return html;
}

/**
 * Render a TenantReport to HTML
 * 
 * @param {Object} report - TenantReport object
 * @param {Object} [summaryData] - Optional executive summary data with {summary: string, nextActions: string[]}
 * @returns {string} HTML string
 */
export function renderReportToHtml(report, summaryData = null) {
  const { title, contentMd, createdAt, periodKey, tags, kind } = report;
  
  const htmlContent = markdownToHtml(contentMd);
  
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown date';
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #fff;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #0066cc;
    }
    .brand {
      font-size: 24px;
      font-weight: 700;
      color: #0066cc;
      margin-bottom: 10px;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 10px;
      color: #1a1a1a;
      margin-top: 0;
    }
    .executive-summary {
      background: #f8f9fa;
      border-left: 4px solid #0066cc;
      padding: 20px;
      margin: 30px 0;
      border-radius: 4px;
    }
    .executive-summary h2 {
      margin-top: 0;
      color: #0066cc;
      border-bottom: none;
      padding-bottom: 0;
    }
    .next-actions {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .next-actions h2 {
      margin-top: 0;
      color: #856404;
      border-bottom: none;
      padding-bottom: 0;
    }
    .next-actions ul {
      margin-left: 20px;
      margin-top: 10px;
    }
    .next-actions li {
      margin-bottom: 8px;
      font-weight: 500;
    }
    h2 {
      font-size: 22px;
      margin-top: 30px;
      margin-bottom: 15px;
      color: #2c3e50;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 5px;
    }
    h3 {
      font-size: 18px;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #34495e;
    }
    p {
      margin-bottom: 12px;
      text-align: justify;
    }
    ul {
      margin-left: 20px;
      margin-bottom: 15px;
    }
    li {
      margin-bottom: 8px;
    }
    strong {
      color: #1a1a1a;
      font-weight: 600;
    }
    .metadata {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
    }
    .metadata-item {
      margin-bottom: 5px;
    }
    @media print {
      body {
        padding: 20px;
      }
      h1 {
        page-break-after: avoid;
      }
      h2 {
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Cardbey</div>
    <h1>${escapeHtml(title)}</h1>
    ${kind ? `<div class="metadata-item" style="font-size: 14px; color: #666; margin-top: 5px;"><strong>Type:</strong> ${escapeHtml(kind)}</div>` : ''}
    ${periodKey ? `<div class="metadata-item" style="font-size: 14px; color: #666; margin-top: 5px;"><strong>Period:</strong> ${escapeHtml(periodKey)}</div>` : ''}
  </div>
  
  ${summaryData ? `
  <div class="executive-summary">
    <h2>Executive Summary</h2>
    <p>${escapeHtml(summaryData.summary).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>
  </div>
  
  ${summaryData.nextActions && summaryData.nextActions.length > 0 ? `
  <div class="next-actions">
    <h2>Recommended Next Actions</h2>
    <ul>
      ${summaryData.nextActions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
    </ul>
  </div>
  ` : ''}
  ` : ''}
  
  <div class="content">
    <h2>Report Details</h2>
    ${htmlContent}
  </div>
  
  <div class="metadata">
    <div class="metadata-item"><strong>Generated:</strong> ${escapeHtml(formattedDate)}</div>
    ${tags ? `<div class="metadata-item"><strong>Tags:</strong> ${escapeHtml(tags)}</div>` : ''}
  </div>
</body>
</html>`;
  
  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

