/**
 * Shared CSV / tabular parsing for ingestion adapters.
 */

import type { IngestionSourceType, RawBusinessRecord } from '../types.js';

const FIELD_ALIASES: Record<string, keyof Omit<RawBusinessRecord, 'sourceRowId' | 'sourceType' | 'sourceReference' | 'fetchedAt' | 'raw'>> = {
  name: 'businessName',
  business_name: 'businessName',
  businessname: 'businessName',
  company_name: 'businessName',
  legal_name: 'legalName',
  legalname: 'legalName',
  address: 'address',
  street_address: 'address',
  phone: 'phone',
  telephone: 'phone',
  phone_number: 'phone',
  website: 'website',
  url: 'website',
  web: 'website',
  category: 'category',
  business_type: 'category',
  type: 'category',
  industry: 'category',
  registration_number: 'registrationNumber',
  abn: 'registrationNumber',
  tax_id: 'registrationNumber',
  email: 'email',
  e_mail: 'email',
  region: 'operatingRegion',
  operating_region: 'operatingRegion',
  state: 'operatingRegion',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function cleanCell(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/\s+/g, ' ');
  return s.length ? s : null;
}

export function parseCsvText(
  text: string,
  opts: { delimiter?: string; hasHeader?: boolean } = {},
): Record<string, string>[] {
  const delimiter = opts.delimiter ?? ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const hasHeader = opts.hasHeader !== false;
  const headers = hasHeader ? splitLine(lines[0]).map(normalizeHeader) : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, idx) => {
    const cells = splitLine(line);
    if (headers) {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] ?? '';
      });
      row.__rowIndex = String(idx + (hasHeader ? 2 : 1));
      return row;
    }
    return {
      __rowIndex: String(idx + 1),
      col0: cells[0] ?? '',
      col1: cells[1] ?? '',
      col2: cells[2] ?? '',
      col3: cells[3] ?? '',
      col4: cells[4] ?? '',
      col5: cells[5] ?? '',
      col6: cells[6] ?? '',
      col7: cells[7] ?? '',
    };
  });
}

export function rowToRawBusinessRecord(
  row: Record<string, unknown>,
  ctx: {
    sourceType: IngestionSourceType;
    sourceReference: string;
    rowId?: string;
    fieldMap?: Record<string, string>;
  },
): RawBusinessRecord {
  const fetchedAt = new Date().toISOString();
  const mapped: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('__')) continue;
    const normKey = normalizeHeader(key);
    const alias = ctx.fieldMap?.[normKey] ?? FIELD_ALIASES[normKey] ?? normKey;
    if (alias in FIELD_ALIASES || ctx.fieldMap?.[normKey]) {
      mapped[alias] = cleanCell(value);
    } else if (
      ['businessName', 'legalName', 'address', 'phone', 'website', 'category', 'registrationNumber', 'email', 'operatingRegion'].includes(alias)
    ) {
      mapped[alias] = cleanCell(value);
    }
  }

  // Fallback: col0..col7 positional mapping when headers are generic.
  if (!mapped.businessName && row.col0) mapped.businessName = cleanCell(row.col0);
  if (!mapped.address && row.col1) mapped.address = cleanCell(row.col1);
  if (!mapped.phone && row.col2) mapped.phone = cleanCell(row.col2);
  if (!mapped.website && row.col3) mapped.website = cleanCell(row.col3);
  if (!mapped.category && row.col4) mapped.category = cleanCell(row.col4);
  if (!mapped.registrationNumber && row.col5) mapped.registrationNumber = cleanCell(row.col5);
  if (!mapped.email && row.col6) mapped.email = cleanCell(row.col6);
  if (!mapped.operatingRegion && row.col7) mapped.operatingRegion = cleanCell(row.col7);

  const sourceRowId =
    ctx.rowId ??
    cleanCell(row.__rowIndex) ??
    cleanCell(row.id) ??
    cleanCell(row.sourceRowId) ??
    `row-${Math.random().toString(36).slice(2, 10)}`;

  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!k.startsWith('__')) raw[k] = v;
  }

  return {
    sourceRowId,
    sourceType: ctx.sourceType,
    sourceReference: ctx.sourceReference,
    fetchedAt,
    businessName: mapped.businessName ?? null,
    legalName: mapped.legalName ?? null,
    address: mapped.address ?? null,
    phone: mapped.phone ?? null,
    website: mapped.website ?? null,
    category: mapped.category ?? null,
    registrationNumber: mapped.registrationNumber ?? null,
    email: mapped.email ?? null,
    operatingRegion: mapped.operatingRegion ?? null,
    raw: Object.keys(raw).length ? raw : undefined,
  };
}

export function jsonRecordsToRaw(
  records: unknown[],
  ctx: {
    sourceType: IngestionSourceType;
    sourceReference: string;
    fieldMap?: Record<string, string>;
  },
): RawBusinessRecord[] {
  return records.map((rec, idx) => {
    const row =
      rec && typeof rec === 'object' && !Array.isArray(rec)
        ? (rec as Record<string, unknown>)
        : { value: rec };
    return rowToRawBusinessRecord(
      { ...row, __rowIndex: String(idx + 1) },
      { ...ctx, rowId: cleanCell((row as Record<string, unknown>).id) ?? `row-${idx + 1}` },
    );
  });
}
