/**
 * Confidence engine — merge per-source field confidence and flag low-confidence fields.
 */

export interface FieldProvenance {
  source: string;
  sourceUrl?: string | null;
  confidence: number;
  timestamp: string;
  attributionText?: string | null;
}

export interface ScoredField<T = unknown> {
  value: T;
  confidence: number;
  provenance: FieldProvenance[];
  needsConfirmation: boolean;
}

/** Per-source base weights for common acquisition paths. */
export const SOURCE_CONFIDENCE_BASE: Record<string, number> = {
  user_upload: 0.95,
  uploaded_business_card_ocr: 0.95,
  google_places: 0.9,
  cardbey_internal: 0.85,
  business_discovery: 0.75,
  schema_org: 0.7,
  website_title: 0.7,
  website_metadata: 0.55,
  pexels: 0.5,
  pixabay: 0.45,
  coverr: 0.45,
  mixkit: 0.4,
  inferred: 0.35,
  manual: 0.5,
};

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Merge multiple provenance entries into a single confidence score.
 * Uses weighted max + corroboration boost when multiple independent sources agree.
 */
export function mergeFieldConfidence(provenance: FieldProvenance[]): number {
  if (!provenance.length) return 0;
  const sorted = [...provenance].sort((a, b) => b.confidence - a.confidence);
  let score = sorted[0].confidence;
  if (sorted.length >= 2 && sorted[1].confidence >= 0.5) {
    score = clampConfidence(score + 0.05 * (sorted.length - 1));
  }
  return clampConfidence(score);
}

export function scoreField<T>(
  value: T,
  provenance: FieldProvenance[],
  opts?: { confirmThreshold?: number },
): ScoredField<T> {
  const threshold = opts?.confirmThreshold ?? 0.6;
  const confidence = mergeFieldConfidence(provenance);
  return {
    value,
    confidence,
    provenance,
    needsConfirmation: confidence < threshold,
  };
}

export function provenanceFromSource(
  source: string,
  confidence: number,
  extras?: Partial<FieldProvenance>,
): FieldProvenance {
  const base = SOURCE_CONFIDENCE_BASE[source] ?? 0.4;
  return {
    source,
    confidence: clampConfidence(extras?.confidence ?? base),
    timestamp: extras?.timestamp ?? new Date().toISOString(),
    sourceUrl: extras?.sourceUrl ?? null,
    attributionText: extras?.attributionText ?? null,
  };
}

export interface LowConfidenceReport {
  field: string;
  confidence: number;
  threshold: number;
  sources: string[];
}

/** Flag fields that must be confirmed before publish (Phase 1 gate). */
export function flagLowConfidenceFields(
  fields: Record<string, ScoredField<unknown>>,
  threshold = 0.6,
): LowConfidenceReport[] {
  const out: LowConfidenceReport[] = [];
  for (const [field, scored] of Object.entries(fields)) {
    if (scored.confidence < threshold) {
      out.push({
        field,
        confidence: scored.confidence,
        threshold,
        sources: scored.provenance.map((p) => p.source),
      });
    }
  }
  return out.sort((a, b) => a.confidence - b.confidence);
}

export function overallEntityConfidence(fields: Record<string, ScoredField<unknown>>): number {
  const keys = Object.keys(fields);
  if (!keys.length) return 0;
  const sum = keys.reduce((acc, k) => acc + fields[k].confidence, 0);
  return clampConfidence(sum / keys.length);
}
