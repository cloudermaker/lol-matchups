import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const buildApp = vi.fn();
vi.mock('../src/bootstrap', () => ({ buildApp: () => buildApp() }));

const inner = () => { const a = express(); a.get('/api/ping', (_req, res) => { res.json({ ok: true }); }); return a; };

beforeEach(() => { vi.resetModules(); buildApp.mockReset(); });

describe('Vercel handler', () => {
  it('builds the app once, on the first request', async () => {
    buildApp.mockResolvedValue(inner());
    const { default: handler } = await import('../src/handler');
    expect(buildApp).not.toHaveBeenCalled();
    expect((await request(handler).get('/api/ping')).body).toEqual({ ok: true });
    await request(handler).get('/api/ping');
    expect(buildApp).toHaveBeenCalledTimes(1);
  });

  it('answers 503 when setup fails, then retries on the next request', async () => {
    buildApp.mockRejectedValueOnce(new Error('ddragon down')).mockResolvedValue(inner());
    const { default: handler } = await import('../src/handler');
    const first = await request(handler).get('/api/ping');
    expect(first.status).toBe(503);
    expect(first.body).toEqual({ error: 'Service starting, try again' });
    expect((await request(handler).get('/api/ping')).status).toBe(200);
  });
});
