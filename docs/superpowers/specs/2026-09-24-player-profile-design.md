# Player profile — design

Date: 2026-09-24 · Status: draft for review

## Goal
Give feedback on a player's ranked play from their Riot ID: champion pool, stats vs lane opponents, and short advice.

## Scope
- Users: owner and a few friends; any EUW Riot ID. Personal Riot API key (`RIOT_API_KEY`).
- Data: last 50 Ranked Solo/Duo games (queue 420).
- Out of scope: timeline lane-phase deltas, Flex/normals, match history browsing, other regions, Riot crawler.

## Architecture

### Server
- `server/src/riot/client.ts` — `RiotClient`
  - Adds `X-Riot-Token`; routes `europe` (account-v1, match-v5) and `euw1` (league-v4).
  - Rate limiter: 20 req/1 s and 100 req/120 s.
  - 429 → wait `Retry-After`, retry once, then fail as "busy".
  - Errors: `RiotError` with kind `not_found` (404), `key` (401/403 or no key), `busy`, `http`.
  - A match that returns 404 is skipped, so it never reads as "account not found".
- `server/src/riot/matchStore.ts`
  - `get(id)`: read `server/data/matches/{id}.json`, else fetch and write (raw JSON).
  - Corrupt file → delete and refetch. `server/data/` is gitignored.
- `server/src/profile/` — `aggregate.ts` and `advice.ts` (pure, no I/O) plus `service.ts` (orchestration) → `ProfileResponse`.
- Route `GET /api/profile/:gameName/:tagLine` → `ProfileResponse`.
  - `TtlCache` (5 min) on the whole profile, keyed by lower-cased Riot ID.
- `riotCrawler.ts` stays a placeholder; it will later reuse `RiotClient`.

### Flow
1. account-v1: Riot ID → PUUID.
2. match-v5: `ids?queue=420&count=50`.
3. `matchStore` for each id, max 5 fetches in parallel.
4. league-v4 `entries/by-puuid` → rank (tier, division, LP).
5. `profile/` aggregates; counters and builds come from the existing lolalytics lookups.

### Shared
- `ProfileResponse` type in `shared/src/types.ts`.

### Web
- Page kept in the URL as `?player=Name%23TAG`, like the existing `?champ=` routing.
- Search box: input containing `#` (e.g. `Name#EUW`) opens the player page; otherwise unchanged.

## Page content

### Header
- Riot ID, rank and LP, games analysed, overall win rate, main lane (most-played `teamPosition`).

### Champion pool table
- One row per champion and lane: games, W-L, win rate, KDA; sorted by games.
- Champion links to its existing champion page (↗).

### Benchmarks vs lane opponent
- Lane opponent = enemy participant with the same `teamPosition`.
- Metrics: CS/min (`totalMinionsKilled + neutralMinionsKilled`), deaths, vision score/min, damage to champions/min, gold/min.
- Shown as "you vs opponents' average"; difference beyond ±10 % coloured green (better) or red (worse). Fewer deaths counts as better.
- Only for rows with 3+ games; other rows greyed out as "too few games".

### Advice (3–6 rule-based lines)
- Best pick: highest win rate among champions with 5+ games.
- Struggling: win rate ≤ 40 % with 5+ games.
- Counters that hurt: lane opponent champion faced 2+ times with win rate ≤ 40 %; tagged "known counter" if in lolalytics' top 10 counters for your champion and lane.
- Build gap: a common core item (lolalytics) found in fewer than half of your games on that champion and lane (3+ games).
- Off-role: games outside the main lane, with their win rate, when they are 20 %+ of games.

### Tier for lolalytics lookups
- From rank: Emerald and above → Emerald+; Platinum → Platinum+; Gold and below (or unranked) → Gold+.

### Excluded games
- Remakes (duration < 5 min or `gameEndedInEarlySurrender`): excluded everywhere.
- Missing `teamPosition`: excluded from benchmarks and lane stats only.

## Errors
| Case | Behaviour |
|---|---|
| Riot ID not found (404) | "No EUW account for Name#TAG" |
| Key missing/invalid/expired | "Riot API key missing or expired"; startup warning if `RIOT_API_KEY` empty |
| 429 after retry | "Riot API busy, try again in a minute" |
| < 50 games | Analyse what exists; 0 → "No ranked Solo/Duo games found" |
| lolalytics down | Profile still loads; no "known counter" tags or build-gap advice; small note shown |
| Corrupt match file | Delete and refetch |

## Testing
No test calls the real Riot API.
- `profile/` with hand-made fixtures: opponent pairing, remake exclusion, 3-game threshold, each advice rule, tier mapping.
- `RiotClient` with mocked fetch: routing, error mapping, 429 retry.
- `matchStore` in a temp dir: hit, miss (write), corrupt file.
- Route: success and 404 with mocked Riot calls.
- Web: `#` search goes to player page; player page renders table and advice from a stubbed API.
