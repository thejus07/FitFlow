import { app, initPromise } from '../src/server';

export default async function handler(req: any, res: any) {
  await initPromise;
  await app.ready();
  app.server.emit('request', req, res);
}
