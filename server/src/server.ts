import { createApp } from './app';
import { TtlCache } from './cache';
import { loadConfig } from './config';
import { DataDragon } from './dataDragon';
import { fetchJson } from './http';
import { MatchupService } from './matchup';
import { createProvider } from './providers';

const config = loadConfig();
const dd = new DataDragon(fetchJson);
await dd.load();

const matchups = new MatchupService(createProvider(config, fetchJson), dd, new TtlCache(6 * 60 * 60 * 1000), config.minGames);
createApp({ champions: dd, matchups }).listen(config.port, config.host, () => {
  console.log(`API on http://${config.host}:${config.port} (provider: ${config.provider})`);
});
