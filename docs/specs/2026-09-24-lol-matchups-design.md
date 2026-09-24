# LoL Matchups — design

Private local site: enter a champion + lane, get the top 5 counters and build advice.

## Scope
- Region **EUW**, tier **Platinum+** (`platinum_plus`, ~2x the games of Platinum alone), ranked solo queue.
- Input: champion + lane (top, jungle, middle, bottom, support). Lane is always explicit.
- Output:
  - Top 5 counters in that lane: icon, name, your win rate vs them, games played.
  - General build for the champion in that lane: core items, boots, runes, summoner spells.
  - Per-counter build tweaks (click a counter) when enough data exists.
- Private: local git repo, no remote, no deployment. Secrets only in `.env` (git-ignored).

## Out of scope (v1)
- Riot match crawler implementation (interface only).
- Other regions/tiers, accounts, deployment.

## Stack
- TypeScript everywhere, npm workspaces.
- Server: Node 22, Express, run with `tsx`.
- Web: React + Vite; Vite dev server proxies `/api` to Express.
- Shared API types in `shared/`.
- Vitest for tests.
- SQLite reserved for the future crawler.

## Data sources
- Counters: `https://a1.lolalytics.com/mega/?ep=counter&v=1&patch=30&c={champ}&lane={lane}&tier=platinum_plus&queue=ranked&region=euw` (verified).
- Items: `...&ep=build-itemset` and starting items `...&ep=build-earlyset` (verified).
- Runes, summoner spells, matchup-specific builds: endpoint not yet found; locate during implementation. If none exists, v1 ships without them and the UI hides that section.
- Static data: Data Dragon `https://ddragon.leagueoflegends.com/api/versions.json`, `.../cdn/{ver}/data/en_US/champion.json`, `item.json`, `runesReforged.json`.

## Architecture
```
shared/
  types.ts             API request/response types
server/src/
  server.ts            Express app + API
  config.ts            reads .env (PROVIDER, PORT, RIOT_API_KEY)
  cache.ts             in-memory TTL cache (6 h)
  dataDragon.ts        champion/item/rune names + icons
  providers/
    index.ts           selects provider from PROVIDER
    types.ts           Provider interface
    lolalytics.ts      v1 source (unofficial JSON endpoints)
    riotCrawler.ts     stub; later: crawl ranked matches into SQLite
server/test/
  fixtures/            saved provider responses
web/src/
  App.tsx, components/ (ChampionPicker, LanePicker, CounterList, BuildPanel)
```

### Provider interface
```
getCounters(champKey, lane)            -> [{ champKey, winRate, games }]  // all opponents
getBuild(champKey, lane, vsChampKey?)  -> { items: { core, boots }, runes, summoners, games } | null
```
- Win rate is always **the searched champion's** win rate vs the opponent.
- The server sorts counters by win rate ascending, drops those with fewer than `MIN_GAMES` (default 1000; 100 let rare off-role picks through), keeps 5.
- `getBuild` with `vsChampKey` returns `null` when the matchup has too little data; the UI then says so.

### API
- `GET /api/champions` → `[{ key, name, icon }]`
- `GET /api/matchup?champ=darius&lane=top` → `{ champ, lane, counters: [...5], build }`
- `GET /api/build?champ=darius&lane=top&vs=malphite` → matchup build or `{ build: null }`
- Errors: invalid champ/lane → 400; provider failure → 502 `{ error: "Data source unavailable" }`.

## Data flow
1. Browser loads champion list (Data Dragon, cached).
2. User picks champion + lane → `/api/matchup`.
3. Server checks cache → provider → normalise → filter/sort → cache → respond.
4. Clicking a counter → `/api/build?vs=...`.

## Error handling
- Provider errors or unexpected shape → 502 with a clear message; no silent fallback.
- Frontend shows "Data source unavailable" or "Not enough data for this matchup".

## Testing
- Unit: provider normalisation from fixtures, counter filter/sort, cache TTL, input validation.
- No live network in tests.
- One manual end-to-end check against live data.
