import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('uses defaults', () => {
    expect(loadConfig({})).toEqual({ provider: 'lolalytics', host: '127.0.0.1', port: 3001, minGames: 1000, riotApiKey: undefined });
  });
  it('treats empty values as unset', () => {
    expect(loadConfig({ PORT: '', MIN_GAMES: '', PROVIDER: '' })).toMatchObject({ provider: 'lolalytics', port: 3001, minGames: 1000 });
  });
  it('reads env', () => {
    expect(loadConfig({ PROVIDER: 'riot', HOST: '0.0.0.0', PORT: '4000', MIN_GAMES: '500', RIOT_API_KEY: 'k' }))
      .toEqual({ provider: 'riot', host: '0.0.0.0', port: 4000, minGames: 500, riotApiKey: 'k' });
  });
  it('rejects unknown provider', () => {
    expect(() => loadConfig({ PROVIDER: 'opgg' })).toThrow('Unknown PROVIDER');
  });
  it('rejects invalid numbers', () => {
    expect(() => loadConfig({ MIN_GAMES: 'abc' })).toThrow('MIN_GAMES');
    expect(() => loadConfig({ MIN_GAMES: '-1' })).toThrow('MIN_GAMES');
    expect(() => loadConfig({ PORT: '0' })).toThrow('PORT');
    expect(() => loadConfig({ PORT: '70000' })).toThrow('PORT');
  });
});
