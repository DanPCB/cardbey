/**
 * Graphic layout — design tokens to CSS/HTML structure.
 */

export class GraphicLayout {
  async process(content, options = {}) {
    const tokens = this._parseDesignTokens(content);
    const layout = this._generateLayout(tokens, options);

    return {
      processed: layout,
      stats: {
        elements: tokens.elements.length,
        colors: tokens.colors.length,
        dimensions: Object.keys(tokens.dimensions).length,
      },
      suggestedActions: [
        { id: 'export_css', label: 'Export CSS' },
        { id: 'generate_code', label: 'Generate code' },
        { id: 'preview_design', label: 'Preview design' },
      ],
    };
  }

  _parseDesignTokens(content) {
    const tokens = {
      elements: [],
      colors: [],
      dimensions: {},
    };

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const colorMatches = trimmed.match(/#[0-9a-f]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)/gi);
      if (colorMatches) {
        tokens.colors.push(...colorMatches);
      }

      const dimMatches = trimmed.matchAll(/(\d+(?:\.\d+)?)\s*(px|rem|em|vw|vh|%|pt)/gi);
      for (const match of dimMatches) {
        tokens.dimensions[`${match[1]}${match[2]}`] = true;
      }

      if (/\b(flex|grid|position|align|margin|padding|gap|z-index)\b/i.test(trimmed)) {
        tokens.elements.push(trimmed);
      }
    }

    tokens.colors = [...new Set(tokens.colors)];
    return tokens;
  }

  _generateLayout(tokens, options) {
    const format = options.format || 'css';
    if (format === 'html') {
      return this._generateHTML(tokens);
    }
    if (format === 'json') {
      return JSON.stringify(tokens, null, 2);
    }
    return this._generateCSS(tokens);
  }

  _generateCSS(tokens) {
    const colorVars = tokens.colors.map((c, i) => `  --color-${i + 1}: ${c};`).join('\n');
    const gaps = Object.keys(tokens.dimensions).filter((d) => d.endsWith('px')).slice(0, 3);

    return `/* Generated Layout */
:root {
${colorVars || '  --color-1: #333;'}
}

.container {
  display: flex;
  flex-wrap: wrap;
  gap: ${gaps[0] || '16px'};
  padding: ${gaps[1] || '20px'};
  align-items: center;
}

.item {
  flex: 1 1 200px;
  background: var(--color-1);
  border-radius: 8px;
  padding: 12px;
}

.group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${gaps[2] || '12px'};
}
`.trim();
  }

  _generateHTML(tokens) {
    const swatches = tokens.colors
      .slice(0, 6)
      .map((c) => `    <div class="item" style="background:${c}"></div>`)
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Generated Layout</title>
  <style>
${this._generateCSS(tokens)}
  </style>
</head>
<body>
  <div class="container">
    <div class="group">
${swatches || '    <div class="item">Element</div>'}
    </div>
  </div>
</body>
</html>`;
  }
}

export default GraphicLayout;
