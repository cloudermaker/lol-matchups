import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { ProfileService } from './profile/service';
import { RiotClient } from './riot/client';
import { MatchStore } from './riot/matchStore';
import { TtlCache } from './cache';
import { loadConfig } from './config';
import { DataDragon } from './dataDragon';
import { fetchJson } from './http';
import { MatchupService } from './matchup';
import { patchInfo } from './patch';
import { createProvider } from './providers';

const config = loadConfig();
const dd = new DataDragon(fetchJson);
await dd.load();

const matchups = new MatchupService(createProvider(config, fetchJson), dd, new TtlCache(6 * 60 * 60 * 1000), config.minGames);
if (!config.riotApiKey) console.warn('RIOT_API_KEY is empty: player profiles are disabled');
const riot = new RiotClient(config.riotApiKey);
const store = new MatchStore(fileURLToPath(new URL('../data/matches', import.meta.url)), (id) => riot.match(id));
const profiles = new ProfileService(riot, store, dd, matchups, new TtlCache(5 * 60 * 1000));

// notes page checked once at startup; falls back to the patch index
const patch = patchInfo(dd.version);

createApp({ champions: dd, matchups, profiles, patch: () => patch }).listen(config.port, config.host, () => {
  console.log(`API on http://${config.host}:${config.port} (provider: ${config.provider})`);
});
