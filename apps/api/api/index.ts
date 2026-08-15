import { app } from '../src/server.js';

export default async function handler(req: any, res: any) {
  try {
    await app.ready();
    app.server.emit('request', req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err?.message || 'Serverless function initialization error', stack: err?.stack }));
  }
}
