import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { LiveService } from './live/service';
import { ProfileService } from './profile/service';
import { RiotClient } from './riot/client';
import { MatchStore } from './riot/matchStore';
import { TtlCache } from './cache';
import { loadConfig } from './config';
import { DataDragon } from './dataDragon';
import { fetchJson } from './http';
import { MatchupService } from './matchup';
import { patchInfo } from './patch';
import { matchDir } from './paths';
import { createProvider } from './providers';

// wires every service; shared by the local server and the Vercel handler
export async function buildApp() {
  const config = loadConfig();
  const dd = new DataDragon(fetchJson);
  await dd.load();

  const matchups = new MatchupService(createProvider(config, fetchJson), dd, new TtlCache(6 * 60 * 60 * 1000), config.minGames);
  if (!config.riotApiKey) console.warn('RIOT_API_KEY is empty: player profiles are disabled');
  const riot = new RiotClient(config.riotApiKey);
  const dir = matchDir(process.env, fileURLToPath(new URL('../data/matches', import.meta.url)));
  const store = new MatchStore(dir, (id) => riot.match(id));
  const profiles = new ProfileService(riot, store, dd, matchups, new TtlCache(5 * 60 * 1000));
  const live = new LiveService(riot, store, dd, matchups, new TtlCache(30 * 1000), new TtlCache(10 * 60 * 1000));

  // notes page checked once at startup; falls back to the patch index
  const patch = patchInfo(dd.version);
  return createApp({ champions: dd, matchups, profiles, live, patch: () => patch });
}
