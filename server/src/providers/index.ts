import type { Config } from '../config';
import type { FetchJson } from '../http';
import { LolalyticsProvider } from './lolalytics';
import { RiotCrawlerProvider } from './riotCrawler';
import type { Provider } from './types';

export function createProvider(config: Config, fetchJson: FetchJson): Provider {
  return config.provider === 'riot' ? new RiotCrawlerProvider(config.riotApiKey) : new LolalyticsProvider(fetchJson);
}
