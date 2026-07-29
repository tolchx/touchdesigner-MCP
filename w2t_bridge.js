// w2t_bridge.js — Web2Touch WebSocket bridge
// Serves Web2Touch dist + relays WebSocket messages to TD MCP
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8090;
const BASE = path.join(__dirname, 'web2touch');
const MCP = 'http://127.0.0.1:44444';

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'
};

function serveFile(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch(e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function pyEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sendToTD(msg) {
  try {
    // Use json.dumps from TD Python side instead of string interpolation for safety
    const jsonStr = JSON.stringify(msg);
    const code = 'import json; t=op("/project1/neon_values"); d=json.loads(' + JSON.stringify(jsonStr) + '); cid=str(d.get("id","")); ctype=str(d.get("type","")); cval=str(d.get("value","")); cts=str(d.get("timestamp","")); found=-1\nfor r in range(1,t.numRows):\n if t[r,0].val==cid: found=r; break\nif found<0: t.appendRow([cid,ctype,cval,cts])\nelse: t[found,2]=cval; t[found,3]=cts';
    const data = JSON.stringify({ code });
    const req = require('http').request(MCP + '/exec', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => { res.resume(); });
    req.write(data);
    req.end();
    req.on('error', () => {});
  } catch(e) { console.error('TD send error:', e.message); }
}

const server = http.createServer((req, res) => {
  let filePath = path.join(BASE, req.url === '/' ? 'index.html' : req.url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(res, filePath);
  } else {
    serveFile(res, path.join(BASE, 'index.html'));
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('W2T: client connected');
  ws.on('message', (data) => {
    const text = data.toString();
    console.log('W2T RECV:', text.slice(0, 200));
    try {
      const msg = JSON.parse(text);
      sendToTD(msg);
    } catch(e) { console.log('W2T parse err:', e.message); }
  });
  ws.on('close', () => console.log('W2T: client disconnected'));
});

server.listen(PORT, () => {
  console.log(`🟢 Web2Touch: http://127.0.0.1:${PORT}`);
  console.log(`🟢 WebSocket: ws://127.0.0.1:${PORT}`);
  console.log(`🟢 Relaying to: ${MCP}`);
});
