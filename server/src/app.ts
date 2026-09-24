import express, { type NextFunction, type Request, type Response } from 'express';
import { DEFAULT_TIER, LANES, TIERS, type Champion, type Lane, type Tier } from '@lol/shared';
import type { MatchupService } from './matchup';
import { ProviderError } from './providers/types';
import type { ProfileService } from './profile/service';
import { RiotError } from './riot/client';

export interface AppDeps {
  champions: { champions(): Champion[]; championById(id: string): Champion | undefined };
  matchups: Pick<MatchupService, 'getMatchup' | 'getTierList' | 'getMainLanes'>;
  profiles: Pick<ProfileService, 'getProfile' | 'findProfile'>;
}

class BadRequest extends Error {}
class NotFound extends Error {}

export function createApp({ champions, matchups, profiles }: AppDeps) {
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
  const tier = (value: unknown): Tier => {
    if (value === undefined || value === '') return DEFAULT_TIER;
    if (!TIERS.includes(value as Tier)) throw new BadRequest(`Invalid tier: ${value}`);
    return value as Tier;
  };

  app.get('/api/champions', (_req, res) => { res.json(champions.champions()); });

  app.get('/api/main-lanes', async (_req, res) => { res.json(await matchups.getMainLanes()); });

  app.get('/api/matchup', async (req, res) => {
    const c = champion(req.query.champ);
    const l = lane(req.query.lane);
    res.json(await matchups.getMatchup(c, l, tier(req.query.tier)));
  });

  app.get('/api/tierlist', async (req, res) => {
    const l = lane(req.query.lane);
    res.json(await matchups.getTierList(l, tier(req.query.tier)));
  });

  // no tag: tries the default EUW tags
  app.get('/api/profile/:gameName', async (req, res) => {
    try {
      res.json(await profiles.findProfile(req.params.gameName));
    } catch (e) {
      if (e instanceof RiotError && e.kind === 'not_found') throw new NotFound(e.message);
      throw e;
    }
  });

  app.get('/api/profile/:gameName/:tagLine', async (req, res) => {
    const { gameName, tagLine } = req.params;
    try {
      res.json(await profiles.getProfile(gameName, tagLine));
    } catch (e) {
      if (e instanceof RiotError && e.kind === 'not_found') throw new NotFound(`No EUW account for ${gameName}#${tagLine}`);
      throw e;
    }
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return void res.status(400).json({ error: err.message });
    if (err instanceof NotFound) return void res.status(404).json({ error: err.message });
    console.error(err);
    if (err instanceof RiotError && err.kind !== 'http') return void res.status(503).json({ error: err.message });
    if (err instanceof ProviderError || err instanceof RiotError) return void res.status(502).json({ error: 'Data source unavailable' });
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
