import net from 'node:net';

const port = Number(process.env.PORT || 3001);

const server = net.createServer();

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} already in use. Stop the other process or set PORT.`);
    process.exit(1);
  } else {
    throw err;
  }
});

server.once('listening', () => {
  server.close(() => process.exit(0));
});

server.listen(port, '0.0.0.0');


