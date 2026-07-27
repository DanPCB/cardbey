import express from "express";
const router = express.Router();

router.get("/pair", (_req, res) => {
  res.type("html").send(`<!doctype html>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cardbey • Pair Screen</title>
<style>
  :root{--bg:#0b0f14;--card:#121821;--txt:#e7edf5;--muted:#8fa3b8;--btn:#6ea8ff;--ok:#29d398;--bad:#ff7b7b}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--txt);font:16px/1.45 system-ui,Segoe UI,Roboto}
  .wrap{max-width:780px;margin:40px auto;padding:24px}
  .card{background:var(--card);border-radius:16px;padding:24px;box-shadow:0 6px 20px rgba(0,0,0,.35)}
  h1{margin:0 0 10px;font:700 22px system-ui}
  .row{display:flex;gap:10px;align-items:center;margin:14px 0}
  input{flex:1;padding:12px 14px;border-radius:10px;border:1px solid #233041;background:#0e141d;color:var(--txt)}
  button{padding:10px 14px;border:0;border-radius:10px;background:var(--btn);color:#051227;font-weight:700;cursor:pointer}
  small{color:var(--muted)}
  .mono{font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
</style>
<div class="wrap">
  <div class="card">
    <h1>Pair a Screen</h1>
    <div class="row">
      <input id="code" placeholder="Enter pairing code (e.g. PGMGTQ)" autofocus />
      <button id="pairBtn">Pair</button>
    </div>
    <small>Get the code from Dashboard → Screens → Generate Pairing Code.</small>
    <pre id="result" class="mono" style="margin-top:12px;white-space:pre-wrap"></pre>
  </div>
</div>
<script>
const $=s=>document.querySelector(s);
$("#pairBtn").onclick = async () => {
  const code = ($("#code").value||"").trim().toUpperCase();
  if(!code) return alert("Enter a code");
  const r = await fetch("/api/screens/pair/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});
  const body = await r.json();
  if(!r.ok){ $("#result").textContent = "Pair failed: " + (body?.error||r.statusText); return; }
  // Store screenId and redirect to player
  localStorage.setItem('cardbey.screenId', body.data.id);
  location.href = '/device/player';
};
</script>`);
});

router.get('/player', (_req, res) => {
  res.type('html').send(`<!doctype html>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cardbey Player</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#9fb3c8;font:16px system-ui}
  .center{position:absolute;inset:0;display:grid;place-items:center}
  #msg{opacity:.85}
  video, img{max-width:100vw;max-height:100vh;object-fit:contain;display:none}
  video.show, img.show{display:block}
</style>
<div class="center"><div id="msg">No playlist assigned<br/>Waiting for content...</div></div>
<video id="v" playsinline></video>
<img id="i" />
<script>
const API = (p)=>p.startsWith('/')?p:'/api'+p;
const screenId = localStorage.getItem('cardbey.screenId');
const msg = document.getElementById('msg');
const v = document.getElementById('v');
const i = document.getElementById('i');

if(!screenId){ msg.textContent = 'Not paired. Open /device/pair first.'; throw new Error('no screenId'); }

// Heartbeat loop
setInterval(()=>fetch(API('/screens/'+screenId+'/heartbeat'),{method:'POST'}).catch(()=>{}), 30000);

// Simple poll to get screen and assigned playlist
let playing = false, curIndex = 0, items = [];

function resolveUrl(url){
  if(!url) return null;
  if(url.startsWith('http://') || url.startsWith('https://')) return url;
  if(url.startsWith('/')) return window.location.origin + url;
  return window.location.origin + '/uploads/' + url;
}

async function fetchState(){
  try{
    const resp = await fetch(API('/screens/'+screenId)).then(r=>r.json());
    // Support both shapes: { ok, data } and bare screen object
    const s = resp && (resp.data || resp);
    if(!s || !s.assignedPlaylistId){ msg.textContent='No playlist assigned'; return; }
    const pl = await fetch(API('/playlists/'+s.assignedPlaylistId)).then(r=>r.json());
    const next = (pl?.data?.items||[]).map(x=>{
      const mediaUrl = x.media?.url || x.url || x.src || x.mediaUrl;
      const resolved = resolveUrl(mediaUrl);
      return resolved ? {type:(x.media?.kind||'IMAGE').toLowerCase(), url:resolved, duration: (x.durationS||x.duration||8)} : null;
    }).filter(x=>x);
    if(next.length){ items = next; if(!playing){ playing = true; playLoop(); } msg.textContent=''; }
    else { msg.textContent='Playlist empty'; }
  }catch(e){ /* ignore */ }
}
async function playLoop(){
  if(!items.length){ playing=false; return; }
  const it = items[curIndex % items.length]; curIndex++;
  if(it.type === 'video'){
    i.classList.remove('show'); i.src='';
    v.src = it.url; v.classList.add('show'); v.muted = true; v.play().catch(()=>{});
    v.onended = ()=> setTimeout(playLoop, 50);
  } else {
    v.classList.remove('show'); v.pause(); v.removeAttribute('src'); v.load();
    i.src = it.url; i.classList.add('show');
    setTimeout(playLoop, Math.max(1000, (it.duration||8)*1000));
  }
}
fetchState(); setInterval(fetchState, 10000);
</script>`);
});

export default router;
