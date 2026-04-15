/**
 * Document Renderer — CC-3
 *
 * Renders a SmartDocument to HTML (for embed / live view / print preview).
 * Supports all docTypes: card, ticket, report, badge, menu, flyer.
 *
 * Usage:
 *   import { renderDocument } from './documentRenderer.js';
 *   const html = renderDocument(doc, { includeChatWidget: true });
 */

// ── HTML escape ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function parseJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

// ── Design theme helpers ───────────────────────────────────────────────────

const THEME_COLORS = {
  modern:       { bg: '#ffffff', text: '#1a1a2e', accent: '#6366f1', surface: '#f1f5f9' },
  warm:         { bg: '#fdf6ec', text: '#3b2f2f', accent: '#e97a34', surface: '#fef9f0' },
  bold:         { bg: '#1a1a2e', text: '#ffffff', accent: '#ff6b6b', surface: '#16213e' },
  festive:      { bg: '#fff0f6', text: '#5c0049', accent: '#f72585', surface: '#ffe0f0' },
  elegant:      { bg: '#f8f6f0', text: '#2d2d2d', accent: '#9c7e4a', surface: '#ede8de' },
  vibrant:      { bg: '#fff700', text: '#111111', accent: '#ff0055', surface: '#fff900' },
  dark:         { bg: '#0d0d0d', text: '#e0e0e0', accent: '#b967ff', surface: '#1a1a1a' },
  professional: { bg: '#f4f6f9', text: '#1e293b', accent: '#2563eb', surface: '#e2e8f0' },
  minimal:      { bg: '#ffffff', text: '#333333', accent: '#555555', surface: '#f5f5f5' },
  bright:       { bg: '#e0f7fa', text: '#004d61', accent: '#00b0d6', surface: '#b2ebf2' },
  corporate:    { bg: '#f0f4f8', text: '#1a202c', accent: '#1d4ed8', surface: '#e2e8f0' },
  clean:        { bg: '#ffffff', text: '#212121', accent: '#43a047', surface: '#f5f5f5' },
};

function getTheme(theme) {
  return THEME_COLORS[theme] ?? THEME_COLORS.modern;
}

// ── Chat widget ────────────────────────────────────────────────────────────

function chatWidgetHtml(docId, accentColor) {
  return `
<div id="doc-chat" style="
  position:fixed; bottom:20px; right:20px; z-index:9999;
  font-family: system-ui, -apple-system, sans-serif;
">
  <div id="doc-chat-bubble" onclick="toggleDocChat()" style="
    width:56px; height:56px; border-radius:50%;
    background:${esc(accentColor)}; color:#fff; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 16px rgba(0,0,0,.25); font-size:22px;
  ">💬</div>
  <div id="doc-chat-window" style="
    display:none; position:absolute; bottom:68px; right:0;
    width:300px; background:#fff; border-radius:16px;
    box-shadow:0 8px 32px rgba(0,0,0,.2); overflow:hidden;
  ">
    <div style="background:${esc(accentColor)};padding:12px 16px;color:#fff;font-weight:600;">
      Chat with us
    </div>
    <div id="doc-chat-messages" style="
      height:200px; overflow-y:auto; padding:12px; font-size:13px;
    "></div>
    <div style="display:flex;border-top:1px solid #eee;">
      <input id="doc-chat-input" placeholder="Type a message…" style="
        flex:1;border:none;padding:10px 12px;font-size:13px;outline:none;
      " onkeydown="if(event.key==='Enter')sendDocMsg()"/>
      <button onclick="sendDocMsg()" style="
        border:none;background:${esc(accentColor)};color:#fff;
        padding:10px 14px;cursor:pointer;font-size:13px;
      ">Send</button>
    </div>
  </div>
</div>
<script>
(function(){
  const docId = ${JSON.stringify(docId)};
  const token = localStorage.getItem('doc_session_'+docId)
    || ('tok_'+Math.random().toString(36).slice(2));
  localStorage.setItem('doc_session_'+docId, token);

  window.toggleDocChat = function(){
    const w = document.getElementById('doc-chat-window');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
  };

  window.sendDocMsg = async function(){
    const inp = document.getElementById('doc-chat-input');
    const msg = inp.value.trim();
    if(!msg) return;
    inp.value = '';
    appendMsg('You', msg);
    try {
      const r = await fetch('/api/docs/'+docId+'/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message: msg, sessionToken: token, channel: 'web' })
      });
      const d = await r.json();
      appendMsg('Assistant', d.reply || '…');
    } catch(e) {
      appendMsg('System', 'Connection error.');
    }
  };

  function appendMsg(from, text){
    const el = document.getElementById('doc-chat-messages');
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    div.innerHTML = '<b>'+from+':</b> '+text.replace(/</g,'&lt;');
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
})();
</script>`;
}

// ── Card renderer ──────────────────────────────────────────────────────────

function renderCard(doc, design, theme, opts) {
  const { bg, text, accent, surface } = getTheme(theme);
  const logo = design.logoUrl ? `<img src="${esc(design.logoUrl)}" style="max-height:40px;margin-bottom:8px;"/>` : '';
  const qr = doc.qrCodeUrl
    ? `<img src="${esc(doc.qrCodeUrl)}" style="width:80px;height:80px;margin-top:8px;" alt="QR"/>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(doc.title)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}</style>
</head><body style="background:${bg};color:${text};font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<div style="width:${doc.sizeW ?? 85.6}mm;min-height:${doc.sizeH ?? 54}mm;background:${bg};border-radius:8px;padding:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);display:flex;flex-direction:column;justify-content:space-between;">
  <div>
    ${logo}
    <div style="font-size:18px;font-weight:700;color:${accent}">${esc(doc.title)}</div>
    ${design.tagline ? `<div style="font-size:12px;color:${text};opacity:.7;margin-top:4px">${esc(design.tagline)}</div>` : ''}
    ${design.subtitle ? `<div style="font-size:13px;margin-top:8px;background:${surface};border-radius:4px;padding:6px 10px">${esc(design.subtitle)}</div>` : ''}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px">
    <div style="font-size:11px;opacity:.6">
      ${design.phone ? `📞 ${esc(design.phone)}<br/>` : ''}
      ${design.email ? `✉️ ${esc(design.email)}<br/>` : ''}
      ${design.website ? `🌐 ${esc(design.website)}` : ''}
    </div>
    ${qr}
  </div>
</div>
${opts.includeChatWidget ? chatWidgetHtml(doc.id, accent) : ''}
</body></html>`;
}

// ── Ticket renderer ────────────────────────────────────────────────────────

function renderTicket(doc, design, theme, opts) {
  const { bg, text, accent, surface } = getTheme(theme);
  const qr = doc.qrCodeUrl
    ? `<img src="${esc(doc.qrCodeUrl)}" style="width:100px;height:100px;" alt="QR"/>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(doc.title)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}</style>
</head><body style="background:#f0f0f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="width:${doc.sizeW ?? 190}mm;min-height:${doc.sizeH ?? 68}mm;background:${bg};border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.15);display:flex;">
  <div style="flex:1;padding:20px;color:${text}">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.6;color:${accent}">${esc(design.eventType ?? doc.subtype ?? 'Event')}</div>
    <div style="font-size:22px;font-weight:800;margin:6px 0">${esc(doc.title)}</div>
    ${design.eventDate ? `<div style="font-size:13px;margin-bottom:4px">📅 ${esc(design.eventDate)}</div>` : ''}
    ${design.venue ? `<div style="font-size:13px;margin-bottom:4px">📍 ${esc(design.venue)}</div>` : ''}
    ${design.seatInfo ? `<div style="font-size:13px;font-weight:600;color:${accent}">🎫 ${esc(design.seatInfo)}</div>` : ''}
  </div>
  <div style="width:120px;background:${surface};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;border-left:2px dashed rgba(0,0,0,.1)">
    ${qr}
    ${doc.id ? `<div style="font-size:9px;margin-top:6px;opacity:.5">${esc(doc.id.slice(-8).toUpperCase())}</div>` : ''}
  </div>
</div>
${opts.includeChatWidget ? chatWidgetHtml(doc.id, accent) : ''}
</body></html>`;
}

// ── Report renderer ────────────────────────────────────────────────────────

function renderReport(doc, design, theme, opts) {
  const { bg, text, accent } = getTheme(theme);
  const sections = Array.isArray(design.sections) ? design.sections : [];
  const sectionsHtml = sections
    .map((s) => `<div style="margin-bottom:24px">
      ${s.title ? `<h2 style="font-size:16px;color:${accent};margin-bottom:8px;border-bottom:2px solid ${accent};padding-bottom:4px">${esc(s.title)}</h2>` : ''}
      <p style="font-size:14px;line-height:1.7;opacity:.85">${esc(s.body ?? '')}</p>
    </div>`)
    .join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(doc.title)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0} body{padding:40px}</style>
</head><body style="background:${bg};color:${text};font-family:Georgia,serif;max-width:800px;margin:0 auto;">
<header style="margin-bottom:32px;padding-bottom:16px;border-bottom:3px solid ${accent}">
  ${design.logoUrl ? `<img src="${esc(design.logoUrl)}" style="max-height:48px;margin-bottom:12px;"/>` : ''}
  <h1 style="font-size:28px;font-weight:700;color:${accent}">${esc(doc.title)}</h1>
  ${design.subtitle ? `<p style="font-size:15px;margin-top:6px;opacity:.7">${esc(design.subtitle)}</p>` : ''}
  ${design.date ? `<p style="font-size:12px;margin-top:4px;opacity:.5">${esc(design.date)}</p>` : ''}
</header>
<main>${sectionsHtml}</main>
${opts.includeChatWidget ? chatWidgetHtml(doc.id, accent) : ''}
</body></html>`;
}

// ── Generic fallback renderer ──────────────────────────────────────────────

function renderGeneric(doc, design, theme, opts) {
  const { bg, text, accent } = getTheme(theme);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(doc.title)}</title>
</head><body style="background:${bg};color:${text};font-family:system-ui,sans-serif;padding:24px;max-width:600px;margin:0 auto;">
<h1 style="color:${accent}">${esc(doc.title)}</h1>
${design.body ? `<p style="margin-top:12px;line-height:1.7">${esc(design.body)}</p>` : ''}
${doc.qrCodeUrl ? `<img src="${esc(doc.qrCodeUrl)}" style="margin-top:16px;width:120px;height:120px;" alt="QR"/>` : ''}
${opts.includeChatWidget ? chatWidgetHtml(doc.id, accent) : ''}
</body></html>`;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Render a SmartDocument to HTML.
 *
 * @param {{
 *   id: string,
 *   docType: string,
 *   subtype?: string | null,
 *   title: string,
 *   sizeW?: number | null,
 *   sizeH?: number | null,
 *   sizeUnit?: string | null,
 *   designJson?: object | string | null,
 *   qrCodeUrl?: string | null,
 * }} doc
 * @param {{
 *   includeChatWidget?: boolean,
 * }} [options]
 * @returns {string} HTML string
 */
export function renderDocument(doc, options = {}) {
  const opts = { includeChatWidget: options.includeChatWidget ?? true };
  const design = parseJson(doc.designJson);
  const theme = design.theme ?? 'modern';

  switch (doc.docType) {
    case 'card':
      return renderCard(doc, design, theme, opts);
    case 'ticket':
      return renderTicket(doc, design, theme, opts);
    case 'report':
      return renderReport(doc, design, theme, opts);
    case 'badge':
      return renderCard(doc, design, theme, opts); // badge uses card layout
    case 'menu':
      return renderReport(doc, design, theme, opts); // menu uses report layout
    case 'flyer':
      return renderGeneric(doc, design, theme, opts);
    default:
      return renderGeneric(doc, design, theme, opts);
  }
}
