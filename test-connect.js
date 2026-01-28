const net = require('net');

const port = 5000;
const host = '127.0.0.1';

console.log(`Attempting to connect to ${host}:${port}...`);

const socket = net.createConnection(port, host, () => {
  console.log('SUCCESS: Connected to server!');
  console.log('Server details:', socket.address());
  socket.end();
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('ERROR:', err.message);
  console.error('Code:', err.code);
  process.exit(1);
});

socket.setTimeout(5000, () => {
  console.error('TIMEOUT: Connection took too long');
  socket.destroy();
  process.exit(1);
});
