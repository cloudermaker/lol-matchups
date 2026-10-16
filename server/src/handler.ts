import express from 'express';
import { buildApp } from './bootstrap';

type App = Awaited<ReturnType<typeof buildApp>>;

// Vercel entry: services are built on the first request, retried after a failure
let ready: Promise<App> | undefined;
const handler = express();

handler.use(async (req, res, next) => {
  try {
    ready ??= buildApp();
    (await ready)(req, res, next);
  } catch (e) {
    ready = undefined;
    console.error(e);
    res.status(503).json({ error: 'Service starting, try again' });
  }
});

export default handler;
