/**
 * @typedef {{ id: number; res: import('express').Response; ping: NodeJS.Timer }} Client
 */

let nextId = 1;
/** @type {Map<number, Client>} */
const clients = new Map();

export function broadcast(event, payload) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);

  for (const { res } of clients.values()) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${data}\n\n`);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function sseHandler(req, res) {
  // NOTE: This is legacy code - use realtime/sse.js instead
  // CORS headers should be handled by cors() middleware, not manually
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // REMOVED: Manual CORS header - use cors() middleware instead
  // res.setHeader('Access-Control-Allow-Origin', '*');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  res.write(':\n\n');

  res.write(`event: hello\n`);
  res.write(`data: {"ok":true,"now":${Date.now()}}\n\n`);

  const ping = setInterval(() => {
    res.write('event: ping\n');
    res.write('data: {}\n\n');
  }, 15000);

  const id = nextId++;
  clients.set(id, { id, res, ping });
  if (req.socket && typeof req.socket.setKeepAlive === 'function') {
    req.socket.setKeepAlive(true);
  }

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(id);
  });
}

export function sseCount() {
  return clients.size;
}


