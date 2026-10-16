// Vercel's disk is read-only except /tmp
export function matchDir(env: NodeJS.ProcessEnv, localDir: string): string {
  if (env.MATCH_DIR) return env.MATCH_DIR;
  return env.VERCEL ? '/tmp/matches' : localDir;
}
