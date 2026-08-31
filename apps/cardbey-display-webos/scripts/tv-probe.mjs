const url = process.argv[2];
if (!url) {
  console.error('Usage: node tv-probe.mjs <wsUrl>');
  process.exit(1);
}

const ws = new WebSocket(url);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + method)), 12000);
    pending.set(msgId, { resolve, reject, t });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    clearTimeout(p.t);
    pending.delete(msg.id);
    p.resolve(msg);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

await send('Runtime.enable');
const expr =
  "(() => {" +
  "  var chrome = document.getElementById('shell-chrome');" +
  "  var stage = document.getElementById('playback-stage');" +
  "  var video = stage && stage.querySelector('video');" +
  "  var img = stage && stage.querySelector('img');" +
  "  var shell = window.__cardbeyDisplayShell;" +
  "  var sync = null;" +
  "  var pb = null;" +
  "  var status = null;" +
  "  try {" +
  "    status = shell && shell.getState && shell.getState().status;" +
  "    pb = shell && shell.getPlayback && shell.getPlayback() && shell.getPlayback().getState();" +
  "    var act = shell && shell.getActivation && shell.getActivation();" +
  "    sync = act && act.getSync && act.getSync() && act.getSync().getSnapshot();" +
  "  } catch (e) { sync = { err: String(e) }; }" +
  "  return {" +
  "    build: window.__CARDBEY_BUILD_ID__," +
  "    chromeHidden: !!(chrome && chrome.hidden)," +
  "    text: chrome ? String(chrome.innerText || '').slice(0, 500) : null," +
  "    status: status," +
  "    playback: pb," +
  "    syncOp: sync && sync.lastOperation," +
  "    contentCode: sync && sync.lastContentCode," +
  "    http: sync && sync.lastHttpStatus," +
  "    err: sync && sync.lastErrorMessage," +
  "    video: video ? { src: String(video.currentSrc || '').slice(0, 140), ready: video.readyState, err: video.error && video.error.code, paused: video.paused, w: video.videoWidth } : null," +
  "    img: img ? { src: String(img.currentSrc || '').slice(0, 140), w: img.naturalWidth } : null" +
  "  };" +
  "})()";

const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
const value = res.result && res.result.result && res.result.result.value;
console.log(JSON.stringify(value || res, null, 2));
ws.close();
