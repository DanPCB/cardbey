/**
 * Dashboard layout — widget grid with metrics.
 */

import { isMarkdownTableRow } from '../layoutDetection.js';

export class DashboardLayout {
  async process(content, options = {}) {
    const widgets = this._parseWidgets(content);
    const layout = this._generateGrid(widgets, options);

    return {
      processed: layout,
      stats: {
        widgets: widgets.length,
        columns: options.columns || 4,
        rows: Math.ceil(widgets.length / (options.columns || 4)) || 0,
      },
      suggestedActions: [
        { id: 'add_widget', label: 'Add widget' },
        { id: 'reorder', label: 'Reorder widgets' },
        { id: 'export_dashboard', label: 'Export dashboard' },
      ],
    };
  }

  _parseWidgets(content) {
    const lines = content.split('\n').filter((l) => l.trim());
    /** @type {Array<{ name: string, value: string, trend: string }>} */
    const widgets = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;

      if (trimmed.includes('|')) {
        if (!isMarkdownTableRow(trimmed)) continue;

        const parts = trimmed
          .split('|')
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length >= 2 && !/^[-:]+$/.test(parts[0])) {
          widgets.push({
            name: parts[0] || 'Widget',
            value: parts[1] || '0',
            trend: parts[2] || '—',
          });
        }
        continue;
      }

      const metricMatch = trimmed.match(/^(.+?)\s+([\d,.]+%?)\s+([+-]?\d+(?:\.\d+)?%?)?$/);
      if (metricMatch) {
        widgets.push({
          name: metricMatch[1].trim(),
          value: metricMatch[2],
          trend: metricMatch[3] || '—',
        });
      }
    }

    return widgets;
  }

  _generateGrid(widgets, options) {
    const format = options.format || 'markdown';
    const cols = options.columns || 4;

    if (format === 'json') {
      return JSON.stringify({ columns: cols, widgets }, null, 2);
    }

    let result = '# Dashboard\n\n';
    result += '| Widget | Value | Trend |\n';
    result += '|--------|-------|-------|\n';

    for (const widget of widgets) {
      result += `| ${widget.name} | ${widget.value} | ${widget.trend} |\n`;
    }

    if (format === 'html') {
      const rows = widgets
        .map(
          (w) =>
            `      <article class="widget"><h3>${w.name}</h3><p class="value">${w.value}</p><span class="trend">${w.trend}</span></article>`,
        )
        .join('\n');
      return `<div class="dashboard" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">\n${rows}\n</div>`;
    }

    return result.trim();
  }
}

export default DashboardLayout;
