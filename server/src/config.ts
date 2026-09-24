export interface Config { provider: 'lolalytics' | 'riot'; host: string; port: number; minGames: number; riotApiKey?: string }

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}: ${raw}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = env.PROVIDER || 'lolalytics';
  if (provider !== 'lolalytics' && provider !== 'riot') throw new Error(`Unknown PROVIDER: ${provider}`);
  return {
    provider,
    host: env.HOST || '127.0.0.1',
    port: int(env, 'PORT', 3001, 1, 65535),
    minGames: int(env, 'MIN_GAMES', 1000, 0),
    riotApiKey: env.RIOT_API_KEY || undefined,
  };
}
