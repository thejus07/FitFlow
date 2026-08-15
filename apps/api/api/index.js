import { app } from '../dist/server.js';

export default async function handler(req, res) {
  try {
    await app.ready();
    app.server.emit('request', req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err?.message || String(err) }));
  }
}
