/**
 * Document layout — page structure, sections, headings, footnotes.
 */

const CHAPTER_RE = /^(chapter|section|part)\s+(\d+|[ivxlcdm]+)\s*[:\-.]?\s*(.*)$/i;
const HEADING_RE = /^(heading|title|subtitle|subheading)\s*[:\-.]?\s*(.+)$/i;
const FOOTNOTE_RE = /^\[\^?(\d+)\]?\s*(.+)$|^footnote\s*[:\-.]?\s*(.+)$/i;

export class DocumentLayout {
  async process(content, options = {}) {
    const doc = this._parseDocument(content.split('\n'));
    const formatted = this._formatDocument(doc, options);

    return {
      processed: formatted,
      stats: {
        sections: doc.sections.length,
        chapters: doc.chapters.length,
        footnotes: doc.footnotes.length,
        paragraphs: doc.paragraphs.length,
      },
      suggestedActions: [
        { id: 'add_section', label: 'Add section' },
        { id: 'export_pdf', label: 'Export PDF' },
        { id: 'table_of_contents', label: 'Generate table of contents' },
      ],
    };
  }

  _parseDocument(lines) {
    const doc = {
      title: '',
      sections: [],
      chapters: [],
      footnotes: [],
      paragraphs: [],
    };

    let currentSection = null;

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const chapterMatch = trimmed.match(CHAPTER_RE);
      if (chapterMatch) {
        const chapter = {
          label: chapterMatch[0],
          title: chapterMatch[3]?.trim() || '',
        };
        doc.chapters.push(chapter);
        currentSection = chapter;
        doc.sections.push({ type: 'chapter', ...chapter });
        continue;
      }

      const headingMatch = trimmed.match(HEADING_RE);
      if (headingMatch) {
        const section = { type: 'heading', label: headingMatch[1], title: headingMatch[2].trim() };
        doc.sections.push(section);
        currentSection = section;
        continue;
      }

      const footnoteMatch = trimmed.match(FOOTNOTE_RE);
      if (footnoteMatch) {
        doc.footnotes.push({
          id: footnoteMatch[1] || String(doc.footnotes.length + 1),
          text: (footnoteMatch[2] || footnoteMatch[3] || '').trim(),
        });
        continue;
      }

      if (!doc.title && trimmed.length < 120 && !trimmed.endsWith('.')) {
        doc.title = trimmed;
        continue;
      }

      doc.paragraphs.push({ text: trimmed, section: currentSection?.title || null });
    }

    return doc;
  }

  _formatDocument(doc, options) {
    const format = options.format || 'markdown';
    if (format === 'json') {
      return JSON.stringify(doc, null, 2);
    }

    let result = doc.title ? `# ${doc.title}\n\n` : '';

    for (const section of doc.sections) {
      if (section.type === 'chapter') {
        result += `## ${section.label}${section.title ? `: ${section.title}` : ''}\n\n`;
      } else {
        result += `### ${section.title}\n\n`;
      }
    }

    let lastSection = null;
    for (const para of doc.paragraphs) {
      if (para.section && para.section !== lastSection) {
        result += `#### ${para.section}\n\n`;
        lastSection = para.section;
      }
      result += `${para.text}\n\n`;
    }

    if (doc.footnotes.length) {
      result += '---\n\n## Footnotes\n\n';
      for (const note of doc.footnotes) {
        result += `[^${note.id}]: ${note.text}\n`;
      }
    }

    return result.trim();
  }
}

export default DocumentLayout;
