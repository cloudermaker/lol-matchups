import express, { type NextFunction, type Request, type Response } from 'express';
import { LANES, type Champion, type Lane } from '@lol/shared';
import type { MatchupService } from './matchup';
import { ProviderError } from './providers/types';

export interface AppDeps {
  champions: { champions(): Champion[]; championById(id: string): Champion | undefined };
  matchups: Pick<MatchupService, 'getMatchup' | 'getBuild' | 'getTierList'>;
}

class BadRequest extends Error {}

export function createApp({ champions, matchups }: AppDeps) {
  const app = express();

  const champion = (value: unknown): Champion => {
    const c = typeof value === 'string' ? champions.championById(value) : undefined;
    if (!c) throw new BadRequest(`Unknown champion: ${value ?? ''}`);
    return c;
  };
  const lane = (value: unknown): Lane => {
    if (!LANES.includes(value as Lane)) throw new BadRequest(`Invalid lane: ${value ?? ''}`);
    return value as Lane;
  };

  app.get('/api/champions', (_req, res) => { res.json(champions.champions()); });

  app.get('/api/matchup', async (req, res) => {
    const c = champion(req.query.champ);
    res.json(await matchups.getMatchup(c, lane(req.query.lane)));
  });

  app.get('/api/build', async (req, res) => {
    const c = champion(req.query.champ);
    const l = lane(req.query.lane);
    const vs = req.query.vs ? champion(req.query.vs) : undefined;
    res.json(await matchups.getBuild(c, l, vs));
  });

  app.get('/api/tierlist', async (req, res) => {
    res.json(await matchups.getTierList(lane(req.query.lane)));
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return void res.status(400).json({ error: err.message });
    console.error(err);
    if (err instanceof ProviderError) return void res.status(502).json({ error: 'Data source unavailable' });
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
