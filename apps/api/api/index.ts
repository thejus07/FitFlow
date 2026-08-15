export default async function handler(req: any, res: any) {
  try {
    const { app } = await import('../src/server.js');
    await app.ready();
    app.server.emit('request', req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`VERCEL_API_DIAGNOSTIC_ERROR:\n${err?.stack || err?.message || String(err)}`);
  }
}
