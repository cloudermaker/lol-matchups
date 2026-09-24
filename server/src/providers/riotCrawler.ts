import type { Provider } from './types';

// Future: crawl EUW Platinum+ ranked matches into SQLite and aggregate.
export class RiotCrawlerProvider implements Provider {
  constructor(private apiKey?: string) {}
  async getCounters(): Promise<never> { throw new Error('Riot crawler provider not implemented yet'); }
  async getBuild(): Promise<never> { throw new Error('Riot crawler provider not implemented yet'); }
  async getTierList(): Promise<never> { throw new Error('Riot crawler provider not implemented yet'); }
}
