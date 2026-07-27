/**
 * Text layout — headers, lists, tables, code blocks, sections.
 */

const SECTION_HEADER_RE =
  /^(Executive Summary|Summary|Introduction|Conclusion|Overview|Background|Appendix|References)$/i;
const NUMBERED_SECTION_RE = /^\d+\.\s+[A-Z]/;
const ALL_CAPS_HEADER_RE = /^[A-Z][A-Z0-9\s\-–—]{4,}$/;
const STANDALONE_TITLE_RE = /^[A-Z][A-Za-z0-9\s\-–—:(),]{3,80}$/;
const FLATTENED_TABLE_HEADER_RE =
  /^(Capability|Feature|Item|Component|Area|Module|Layer|Service)\s+.+(State|Status|Priority|Gap)/i;
const PRIORITY_TAIL_RE = /\s(P[0-3]|High|Medium|Low)\s*$/;
const GAP_SEGMENT_RE = /\s(High|Medium|Low)\s*[—–-]\s/;

export class TextLayout {
  async process(content, options = {}) {
    const input = String(content ?? '');
    const subtype = this._detectContentType(input);

    let processed = input;
    processed = this._fixLineBreaks(processed);
    processed = this._detectTitle(processed);
    processed = this._detectHeaders(processed);
    processed = this._detectFlattenedTables(processed);
    processed = this._detectLists(processed);
    processed = this._detectTables(processed);
    processed = this._detectCodeBlocks(processed);
    processed = this._detectSections(processed);

    if (options.format === 'html') {
      processed = this._toHtml(processed);
    }

    return {
      processed,
      stats: {
        ...this._getStats(processed),
        subtype,
      },
      suggestedActions: [
        { id: 'copy_markdown', label: 'Copy markdown' },
        { id: 'export_html', label: 'Export HTML' },
      ],
    };
  }

  _detectContentType(text) {
    if (text.includes('```') || /\b(function|const|import|class)\b/.test(text)) {
      return 'code';
    }
    if (text.includes('|') && text.includes('---')) {
      return 'table';
    }

    const lines = text.split('\n').map((line) => line.trim());
    if (lines.some((line) => SECTION_HEADER_RE.test(line) || NUMBERED_SECTION_RE.test(line))) {
      return 'markdown';
    }
    if (lines.some((line) => FLATTENED_TABLE_HEADER_RE.test(line))) {
      return 'table';
    }

    if (/^#{1,6}\s/m.test(text) || text.includes('##')) {
      return 'markdown';
    }
    if (/^\s*[-*]\s/m.test(text) || /^\s*\d+\.\s/m.test(text)) {
      return 'list';
    }
    return 'text';
  }

  _fixLineBreaks(text) {
    let result = text.replace(/\r\n/g, '\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/(#{1,6})\s+([^\n]+)(?<!\n)/g, '$1 $2\n');
    return result;
  }

  _detectTitle(text) {
    const lines = text.split('\n');
    const firstIdx = lines.findIndex((line) => line.trim());
    if (firstIdx === -1) return text;

    const line = lines[firstIdx].trim();
    if (line.startsWith('#')) return text;
    if (!STANDALONE_TITLE_RE.test(line)) return text;
    if (line.endsWith('.') || line.includes(':')) return text;

    lines[firstIdx] = `# ${line}`;
    return lines.join('\n');
  }

  _detectHeaders(text) {
    const lines = text.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        result.push(line);
        continue;
      }

      if (/^#{1,6}\s/.test(trimmed)) {
        result.push(trimmed);
        continue;
      }

      if (SECTION_HEADER_RE.test(trimmed) || NUMBERED_SECTION_RE.test(trimmed)) {
        result.push(`## ${trimmed}`);
        continue;
      }

      if (ALL_CAPS_HEADER_RE.test(trimmed) && trimmed.split(/\s+/).length <= 8) {
        result.push(`## ${trimmed}`);
        continue;
      }

      const prevBlank = i === 0 || !lines[i - 1]?.trim();
      const nextBlank = i === lines.length - 1 || !lines[i + 1]?.trim();
      if (
        prevBlank &&
        nextBlank &&
        STANDALONE_TITLE_RE.test(trimmed) &&
        trimmed.split(/\s+/).length <= 8 &&
        !trimmed.endsWith('.')
      ) {
        result.push(`### ${trimmed}`);
        continue;
      }

      result.push(line);
    }

    return result.join('\n');
  }

  _detectFlattenedTables(text) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (this._isFlattenedTableHeader(trimmed)) {
        const headerCells = this._parseFlattenedTableHeader(trimmed);
        const dataRows = [];

        let j = i + 1;
        while (j < lines.length) {
          const nextTrimmed = lines[j].trim();
          if (!nextTrimmed) break;
          if (this._isFlattenedTableHeader(nextTrimmed)) break;
          if (/^#{1,6}\s/.test(nextTrimmed)) break;
          if (nextTrimmed.includes('|')) break;
          dataRows.push(nextTrimmed);
          j++;
        }

        if (headerCells.length >= 2 && dataRows.length > 0) {
          result.push(this._formatFlattenedTable(headerCells, dataRows));
          i = j;
          continue;
        }
      }

      result.push(line);
      i++;
    }

    return result.join('\n');
  }

  _isFlattenedTableHeader(line) {
    if (!line || line.includes('|')) return false;
    if (line.length < 20 || line.length > 200) return false;
    return FLATTENED_TABLE_HEADER_RE.test(line);
  }

  _parseFlattenedTableHeader(headerLine) {
    const knownMulti = ['Current State', 'Required State'];
    let remainder = headerLine.trim();
    /** @type {string[]} */
    const cells = [];

    for (const phrase of knownMulti) {
      const idx = remainder.indexOf(phrase);
      if (idx === -1) continue;
      if (idx > 0) {
        cells.push(remainder.slice(0, idx).trim());
      }
      cells.push(phrase);
      remainder = remainder.slice(idx + phrase.length).trim();
    }

    const tail = remainder.split(/\s+/);
    while (tail.length) {
      cells.push(tail.shift() || '');
    }

    return cells.filter(Boolean);
  }

  _formatFlattenedTable(headerCells, dataRows) {
    const parsedRows = dataRows.map((row) => this._splitFlattenedTableRow(row, headerCells.length));
    const allRows = [headerCells, ...parsedRows];
    return this._formatTable(allRows.map((cells) => `| ${cells.join(' | ')} |`));
  }

  _splitFlattenedTableRow(row, columnCount) {
    if (columnCount <= 1) return [row.trim()];

    let remainder = row.trim();
    /** @type {string[]} */
    const cells = [];

    const priorityMatch = remainder.match(PRIORITY_TAIL_RE);
    if (priorityMatch) {
      cells.unshift(priorityMatch[1].trim());
      remainder = remainder.slice(0, priorityMatch.index).trim();
    }

    const gapMatch = remainder.match(GAP_SEGMENT_RE);
    if (gapMatch && cells.length) {
      const gapStart = gapMatch.index ?? 0;
      cells.unshift(remainder.slice(gapStart).trim());
      remainder = remainder.slice(0, gapStart).trim();
    }

    const requiredMarkers = ['Full context preserved', 'Full context'];
    for (const marker of requiredMarkers) {
      const requiredIdx = remainder.indexOf(marker);
      if (requiredIdx > 0) {
        cells.unshift(remainder.slice(requiredIdx).trim());
        remainder = remainder.slice(0, requiredIdx).trim();
        break;
      }
    }

    const currentMarkers = ['llmGateway', 'default maxTokens'];
    for (const marker of currentMarkers) {
      const currentIdx = remainder.indexOf(marker);
      if (currentIdx > 0) {
        return [remainder.slice(0, currentIdx).trim(), remainder.slice(currentIdx).trim(), ...cells].slice(
          0,
          columnCount,
        );
      }
    }

    const firstSpace = remainder.indexOf(' ');
    if (firstSpace > 0 && cells.length < columnCount - 1) {
      cells.unshift(remainder.slice(firstSpace).trim());
      remainder = remainder.slice(0, firstSpace).trim();
    }

    if (remainder) {
      cells.unshift(remainder.trim());
    }

    while (cells.length < columnCount) {
      cells.splice(1, 0, '');
    }

    return cells.slice(0, columnCount);
  }

  _detectLists(text) {
    const lines = text.split('\n');
    const result = [];
    let inList = false;

    for (const line of lines) {
      const isBullet = /^\s*[-*]\s/.test(line);
      const isNumbered = /^\s*\d+\.\s/.test(line);

      if (isBullet || isNumbered) {
        if (!inList && result.length && result[result.length - 1]?.trim()) {
          result.push('');
        }
        inList = true;
        result.push(line);
        continue;
      }

      if (inList && line.trim()) {
        inList = false;
      }
      result.push(line);
    }

    return result.join('\n');
  }

  _detectTables(text) {
    const lines = text.split('\n');
    const result = [];
    let inTable = false;
    /** @type {string[]} */
    let tableRows = [];

    for (const line of lines) {
      if (line.includes('|')) {
        if (!inTable) inTable = true;
        tableRows.push(line);
      } else {
        if (inTable && tableRows.length > 0) {
          result.push(this._formatTable(tableRows));
          tableRows = [];
          inTable = false;
        }
        result.push(line);
      }
    }

    if (tableRows.length > 0) {
      result.push(this._formatTable(tableRows));
    }

    return result.join('\n');
  }

  /** @param {string[]} rows */
  _formatTable(rows) {
    if (rows.length === 0) return '';

    const parsedRows = rows.map((row) =>
      row
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell, idx, arr) => !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === '')),
    );

    const maxCols = Math.max(...parsedRows.map((r) => r.length));
    const colWidths = [];
    for (let i = 0; i < maxCols; i++) {
      colWidths.push(Math.max(...parsedRows.map((r) => (r[i] || '').length), 3));
    }

    const formattedRows = parsedRows.map((row) => {
      const cells = [];
      for (let i = 0; i < maxCols; i++) {
        cells.push((row[i] || '').padEnd(colWidths[i] || 0));
      }
      return `| ${cells.join(' | ')} |`;
    });

    const hasSeparator = rows.some((row) => /^\|?\s*:?-{3,}/.test(row));
    if (hasSeparator || formattedRows.length < 2) {
      return formattedRows.join('\n');
    }

    const separator = `|${colWidths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
    return [formattedRows[0], separator, ...formattedRows.slice(1)].join('\n');
  }

  _detectCodeBlocks(text) {
    const lines = text.split('\n');
    const result = [];
    let inCodeBlock = false;
    let fenceChar = '';

    for (const line of lines) {
      const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
      if (fenceMatch) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          fenceChar = fenceMatch[2];
        } else if (line.includes(fenceChar)) {
          inCodeBlock = false;
          fenceChar = '';
        }
        result.push(line);
        continue;
      }

      result.push(line);
    }

    return result.join('\n');
  }

  _detectSections(text) {
    const sections = text.split('\n\n');
    const cleaned = sections.map((section) => section.trim().replace(/\n{3,}/g, '\n\n'));
    return cleaned.filter(Boolean).join('\n\n');
  }

  _getStats(processed) {
    const lines = processed.split('\n').filter((l) => l.trim());
    return {
      lines: lines.length,
      chars: processed.length,
      words: processed.split(/\s+/).filter(Boolean).length,
      paragraphs: processed.split('\n\n').filter((p) => p.trim()).length,
    };
  }

  _toHtml(markdown) {
    return markdown
      .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
      .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .concat('</p>');
  }
}

export default TextLayout;
