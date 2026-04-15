type Client = { id: number; res: any; ping: NodeJS.Timer };

let nextId = 1;
const clients = new Map<number, Client>();

export function broadcast(event: string, payload: any) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);

  for (const { res } of clients.values()) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${data}\n\n`);
  }
}

export function sseHandler(req: any, res: any) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.flushHeaders?.();
  res.write(':\n\n');

  res.write(`event: hello\n`);
  res.write(`data: {"ok":true,"now":${Date.now()}}\n\n`);

  const ping = setInterval(() => {
    res.write('event: ping\n');
    res.write('data: {}\n\n');
  }, 15000);

  const id = nextId++;
  clients.set(id, { id, res, ping });
  req.socket.setKeepAlive?.(true);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(id);
  });
}

export function sseCount() {
  return clients.size;
}


