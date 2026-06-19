/**
 * Shared CRM utilities — used by executive Growth Command Center and store Business Growth Center.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function trim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = trim(email);
  return e ? e.toLowerCase() : null;
}

export function isValidEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return Boolean(e && EMAIL_RE.test(e));
}

export function renderEmailTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function parseCsvRows(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  }) as unknown as string[][];
}

/** Executive/platform lead CSV */
export function parseExecutiveCsvLeads(csvText: string, source?: string) {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const idx = (cols: string[], name: string) => headers.indexOf(name);

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const get = (name: string) => {
      const i = idx(cols, name);
      return i >= 0 ? cols[i] || null : null;
    };
    return {
      businessName: get('businessname') ?? get('name') ?? '',
      ownerName: get('ownername'),
      email: get('email'),
      phone: get('phone'),
      website: get('website'),
      category: get('category'),
      address: get('address') ?? get('addressline1'),
      suburb: get('suburb'),
      city: get('city'),
      state: get('state'),
      postcode: get('postcode'),
      country: get('country'),
      source: get('source') ?? source ?? 'csv_import',
      notes: get('notes'),
      consentStatus: get('consentstatus') ?? 'unknown',
    };
  }).filter((l) => String(l.businessName).trim());
}

/** Store customer CSV — name, email, phone, source, tags, notes */
export function parseStoreCustomerCsv(csvText: string, source?: string) {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const idx = (cols: string[], name: string) => headers.indexOf(name);

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const get = (name: string) => {
      const i = idx(cols, name);
      return i >= 0 ? cols[i] || null : null;
    };
    const tagsRaw = get('tags');
    const tags = tagsRaw ? tagsRaw.split('|').map((t) => t.trim()).filter(Boolean) : [];
    return {
      name: get('name') ?? get('customername') ?? get('businessname') ?? '',
      email: get('email'),
      phone: get('phone'),
      source: get('source') ?? source ?? 'csv_import',
      tags,
      notes: get('notes'),
      consentStatus: get('consentstatus') ?? 'unknown',
    };
  }).filter((l) => String(l.name).trim());
}

export const STORE_OUTREACH_TEMPLATES: Record<string, { subject: string; body: string }> = {
  store_offer: {
    subject: 'Special offer from {{storeName}}',
    body: `<p>Hi {{customerName}},</p><p>{{storeName}} has a new offer for you: {{offerSummary}}</p><p><a href="{{storePageUrl}}">Visit our store</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  store_invite: {
    subject: 'Visit {{storeName}} online',
    body: `<p>Hi {{customerName}},</p><p>We'd love to see you at {{storeName}}.</p><p><a href="{{storePageUrl}}">View our store page</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  follow_up: {
    subject: 'Following up — {{storeName}}',
    body: `<p>Hi {{customerName}},</p><p>Just checking in from {{storeName}}. Reply if you have any questions.</p><p><a href="{{storePageUrl}}">Visit store</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
};

export const EXECUTIVE_OUTREACH_TEMPLATES: Record<string, { subject: string; body: string }> = {
  introduction: {
    subject: 'Introducing Cardbey for {{businessName}}',
    body: `<p>Hi {{ownerName}},</p><p>We built a preview for <strong>{{businessName}}</strong> in {{city}}.</p><p><a href="{{storePreviewUrl}}">View your store preview</a> · <a href="{{claimStoreUrl}}">Claim your store</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  claim_preview: {
    subject: 'Claim your AI-created store preview — {{businessName}}',
    body: `<p>Hi {{ownerName}},</p><p>Your {{category}} business in {{city}} has a Cardbey preview ready.</p><p><a href="{{claimStoreUrl}}">Claim your store</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  improve_presence: {
    subject: 'Improve your online presence — {{businessName}}',
    body: `<p>Hi {{ownerName}},</p><p>Cardbey can help {{businessName}} reach more customers in {{city}}.</p><p><a href="{{storePreviewUrl}}">See preview</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  vietnamese_sme: {
    subject: 'Cardbey — dành cho doanh nghiệp {{businessName}}',
    body: `<p>Xin chào {{ownerName}},</p><p>Chúng tôi đã tạo bản xem trước cho {{businessName}} tại {{city}}.</p><p><a href="{{claimStoreUrl}}">Nhận cửa hàng</a></p><p><a href="{{unsubscribeUrl}}">Hủy đăng ký</a></p>`,
  },
  follow_up: {
    subject: 'Following up — {{businessName}} on Cardbey',
    body: `<p>Hi {{ownerName}},</p><p>Just checking in about your Cardbey preview for {{businessName}}.</p><p><a href="{{storePreviewUrl}}">View preview</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
};
