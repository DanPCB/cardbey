/**
 * RAG Chunking Utilities
 * 
 * Shared utilities for chunking text for RAG ingestion.
 */

/**
 * Chunk text into overlapping chunks
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Target chunk size in characters (default: 500)
 * @param {number} overlap - Overlap size in characters (default: 80)
 * @returns {string[]} Array of chunk strings
 */
export function chunkText(text, chunkSize = 500, overlap = 80) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move start position forward, accounting for overlap
    const nextStart = end - overlap;
    
    // Prevent infinite loop - ensure we always make progress
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
    
    // Safety check: if we've processed all text, break
    if (start >= text.length) {
      break;
    }
  }

  return chunks;
}

