function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function cropMarksSvg() {
  return `
<svg width="0" height="0" style="position:absolute;left:-9999px;top:-9999px" aria-hidden="true">
  <defs>
    <g id="cropMark" stroke="black" stroke-width="0.3mm" fill="none">
      <path d="M0 10mm L0 0 L10mm 0" />
    </g>
  </defs>
</svg>`;
}

function cropMarksCorners() {
  return `
<div style="position:absolute; inset:0; pointer-events:none;">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">
    <g stroke="#111827" stroke-width="0.6" fill="none">
      <path d="M4 18 L4 4 L18 4" />
      <path d="M82 4 L96 4 L96 18" />
      <path d="M4 82 L4 96 L18 96" />
      <path d="M82 96 L96 96 L96 82" />
    </g>
  </svg>
</div>`;
}

function renderMedia(content) {
  const mediaUrl = typeof content.mediaUrl === 'string' ? content.mediaUrl.trim() : '';
  if (!mediaUrl) return '';
  const isVideo = /\.(mp4|webm|ogg)(\?|#|$)/i.test(mediaUrl);
  if (isVideo) {
    return `<video src="${esc(mediaUrl)}" muted autoplay loop playsinline style="width:100%; max-height:140px; border-radius:12px; object-fit:cover;"></video>`;
  }
  return `<img src="${esc(mediaUrl)}" alt="media" style="width:100%; max-height:140px; border-radius:12px; object-fit:cover;" />`;
}

function cardInnerHtml({ template, colors, fonts, content, logo, qrCodeUrl }) {
  const primary = colors.primary ?? '#7C3AED';
  const secondary = colors.secondary ?? '#F3F4F6';
  const headingFont = fonts.heading ?? 'Inter';
  const bodyFont = fonts.body ?? 'Inter';

  const title = esc(content.title ?? '');
  const body = esc(content.body ?? '');
  const cta = esc(content.cta ?? '');
  const offer = esc(content.offer ?? '');
  const eventDate = esc(content.eventDate ?? '');
  const venue = esc(content.venue ?? '');

  const logoHtml =
    typeof logo === 'string' && logo.trim()
      ? `<img src="${esc(logo.trim())}" alt="logo" style="height:28px; width:auto; border-radius:6px;" />`
      : `<div style="height:28px; width:28px; border-radius:8px; background:${esc(primary)}22;"></div>`;

  const qrHtml =
    typeof qrCodeUrl === 'string' && qrCodeUrl.trim()
      ? `<img src="${esc(qrCodeUrl.trim())}" alt="qr" style="height:62px; width:62px; border-radius:8px; background:white; padding:6px;" />`
      : '';

  const mediaHtml = template === 'event' || template === 'invitation' ? renderMedia(content) : '';

  const metaLine =
    template === 'event' || template === 'invitation'
      ? `<div style="font-size:12px; color:#374151;">
          ${eventDate ? `<div><b>Date:</b> ${eventDate}</div>` : ''}
          ${venue ? `<div><b>Venue:</b> ${venue}</div>` : ''}
        </div>`
      : template === 'promo' || template === 'loyalty' || template === 'gift'
        ? offer
          ? `<div style="font-size:12px; color:#374151;"><b>Offer:</b> ${offer}</div>`
          : ''
        : '';

  return `
<div style="
  width:100%;
  height:100%;
  border-radius:16px;
  background: linear-gradient(135deg, ${esc(primary)} 0%, ${esc(primary)} 12%, ${esc(secondary)} 100%);
  padding:16px;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  gap:12px;
  font-family:${esc(bodyFont)}, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color:#111827;
">
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
    <div style="display:flex; align-items:center; gap:10px;">
      ${logoHtml}
      <div style="font-family:${esc(headingFont)}, system-ui; font-weight:800; font-size:14px; letter-spacing:0.2px;">
        ${esc((template ?? 'profile').toUpperCase())}
      </div>
    </div>
    ${qrHtml}
  </div>

  ${mediaHtml ? `<div>${mediaHtml}</div>` : ''}

  <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
    <div style="font-family:${esc(headingFont)}, system-ui; font-weight:900; font-size:22px; line-height:1.15;">
      ${title || 'Card'}
    </div>
    <div style="font-size:14px; line-height:1.35; color:#111827cc;">
      ${body}
    </div>
    ${metaLine}
  </div>

  <div style="
    margin-top:auto;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding:12px;
    border-radius:14px;
    background: rgba(255,255,255,0.75);
    border:1px solid rgba(17,24,39,0.06);
  ">
    <div style="font-weight:700; color:#111827;">${cta || 'Chat with us'}</div>
    <div style="font-size:12px; color:#6b7280;">Scan or tap to open</div>
  </div>
</div>`;
}

export function renderCard(card) {
  const c = asObject(card);
  const dj = asObject(c.designJson);
  const colors = asObject(dj.colors);
  const fonts = asObject(dj.fonts);
  const content = asObject(dj.content);
  const template = typeof dj.template === 'string' ? dj.template : c.type;

  const unit =
    typeof c.sizeUnit === 'string'
      ? c.sizeUnit
      : dj.size && typeof dj.size.unit === 'string'
        ? dj.size.unit
        : 'mm';
  const w =
    typeof c.sizeW === 'number'
      ? c.sizeW
      : dj.size && typeof dj.size.w === 'number'
        ? dj.size.w
        : 85;
  const h =
    typeof c.sizeH === 'number'
      ? c.sizeH
      : dj.size && typeof dj.size.h === 'number'
        ? dj.size.h
        : 54;

  const qrCodeUrl = typeof c.qrCodeUrl === 'string' && c.qrCodeUrl.trim() ? c.qrCodeUrl.trim() : null;
  const logo = typeof dj.logo === 'string' ? dj.logo : null;

  const isPrint = unit === 'mm';
  const outerPad = isPrint ? '3mm' : '0px';
  const sizeStyle = unit === 'mm' ? `width:${w}mm; height:${h}mm;` : `width:${w}px; height:${h}px;`;

  const body = cardInnerHtml({ template, colors, fonts, content, logo, qrCodeUrl });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(c.title ?? 'Card')}</title>
    ${isPrint ? '<!-- color-profile: cmyk -->' : ''}
  </head>
  <body style="margin:0; background:#f9fafb; display:flex; align-items:center; justify-content:center; padding:16px;">
    ${isPrint ? cropMarksSvg() : ''}
    <div style="position:relative; padding:${outerPad}; background:white; border-radius:18px; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
      ${isPrint ? cropMarksCorners() : ''}
      <div style="${sizeStyle} overflow:hidden; border-radius:16px;">
        ${body}
      </div>
    </div>
  </body>
</html>`;
}

export function getCardHtmlForEmbed(card) {
  const c = asObject(card);
  const id = esc(c.id ?? '');
  const html = renderCard(card);

  const widget = `
<style>
  .cb-chat-btn{position:fixed; right:16px; bottom:16px; z-index:9999; background:#111827; color:white; border:0; border-radius:999px; padding:12px 14px; font-weight:700; cursor:pointer}
  .cb-chat-panel{position:fixed; right:16px; bottom:64px; width:min(360px, calc(100vw - 32px)); height:420px; z-index:9999; background:white; border-radius:16px; box-shadow:0 24px 48px rgba(0,0,0,.18); border:1px solid rgba(17,24,39,.08); display:none; overflow:hidden}
  .cb-chat-head{padding:12px 14px; border-bottom:1px solid rgba(17,24,39,.08); font-weight:800}
  .cb-chat-body{padding:12px 14px; height:320px; overflow:auto; font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size:14px}
  .cb-chat-row{margin:8px 0}
  .cb-chat-row.user{text-align:right}
  .cb-bubble{display:inline-block; max-width:85%; padding:10px 12px; border-radius:14px; background:#f3f4f6}
  .cb-chat-row.user .cb-bubble{background:#111827; color:white}
  .cb-chat-form{display:flex; gap:8px; padding:10px; border-top:1px solid rgba(17,24,39,.08)}
  .cb-chat-input{flex:1; border:1px solid rgba(17,24,39,.16); border-radius:12px; padding:10px}
  .cb-chat-send{border:0; border-radius:12px; padding:10px 12px; background:#7c3aed; color:white; font-weight:800; cursor:pointer}
</style>
<button class="cb-chat-btn" id="cbChatBtn">💬 Chat</button>
<div class="cb-chat-panel" id="cbChatPanel">
  <div class="cb-chat-head">Chat</div>
  <div class="cb-chat-body" id="cbChatBody"></div>
  <form class="cb-chat-form" id="cbChatForm">
    <input class="cb-chat-input" id="cbChatInput" placeholder="Type a message..." />
    <button class="cb-chat-send" type="submit">Send</button>
  </form>
</div>
<script>
  (function(){
    const cardId = ${JSON.stringify(id)};
    const key = 'card_session_' + cardId;
    let token = localStorage.getItem(key);
    if(!token){ token = (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2)); localStorage.setItem(key, token); }
    const btn = document.getElementById('cbChatBtn');
    const panel = document.getElementById('cbChatPanel');
    const body = document.getElementById('cbChatBody');
    const form = document.getElementById('cbChatForm');
    const input = document.getElementById('cbChatInput');
    const addRow = (role, text) => {
      const row = document.createElement('div');
      row.className = 'cb-chat-row ' + (role === 'user' ? 'user' : 'assistant');
      const bub = document.createElement('div');
      bub.className = 'cb-bubble';
      bub.textContent = text;
      row.appendChild(bub);
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
    };
    const send = async (text) => {
      addRow('user', text);
      const res = await fetch('/api/cards/' + encodeURIComponent(cardId) + '/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message: text, sessionToken: token, channel: 'web' })
      }).catch(()=>null);
      const json = res ? await res.json().catch(()=>null) : null;
      const reply = json && json.reply ? json.reply : "I'm having trouble right now, please try again in a moment.";
      addRow('assistant', reply);
    };
    btn.addEventListener('click', ()=> {
      const open = panel.style.display === 'block';
      panel.style.display = open ? 'none' : 'block';
      if(!open && body.childElementCount === 0){
        addRow('assistant', 'Hi! How can I help you today?');
      }
    });
    form.addEventListener('submit', (e)=> {
      e.preventDefault();
      const text = (input.value || '').trim();
      if(!text) return;
      input.value='';
      send(text);
    });
  })();
</script>`;

  return html.replace('</body>', `${widget}\n</body>`);
}

export async function printOnDemand(cardId) {
  // eslint-disable-next-line no-console
  console.log('[POD_READY]', { cardId, timestamp: new Date().toISOString() });
  return { status: 'queued', cardId };
}

