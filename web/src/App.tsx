import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TIER, LANES, TIERS, TIER_LABELS, lolalyticsBuildUrl,
  type Champion, type Lane, type MainLanesResponse, type MatchupResponse, type ProfileResponse, type Tier, type TierListResponse,
} from '@lol/shared';
import { fetchChampions, fetchMainLanes, fetchMatchup, fetchProfile, fetchTierList } from './api';
import { PlayerPage } from './components/PlayerPage';
import { PlayerSearch } from './components/PlayerSearch';
import { addRecent, readRecent } from './recentPlayers';
import { parseRiotId } from './riotId';
import { ChampionPicker, findChampion } from './components/ChampionPicker';
import { LanePicker } from './components/LanePicker';
import { TierPicker } from './components/TierPicker';
import { CounterList } from './components/CounterList';
import { BuildPanel } from './components/BuildPanel';
import { TierList } from './components/TierList';

interface Route { champ: string | null; player: string | null; lane: Lane; tier: Tier }

function readRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const lane = q.get('lane') as Lane;
  const tier = q.get('tier') as Tier;
  return {
    champ: q.get('champ'),
    player: q.get('player'),
    lane: LANES.includes(lane) ? lane : 'top',
    tier: TIERS.includes(tier) ? tier : DEFAULT_TIER,
  };
}

function routeUrl({ champ, player, lane, tier }: Route): string {
  if (player) return `?${new URLSearchParams({ player })}`;
  const q = new URLSearchParams();
  if (champ) q.set('champ', champ);
  // homepage on the default lane stays at /
  if (champ || lane !== 'top') q.set('lane', lane);
  if (tier !== DEFAULT_TIER) q.set('tier', tier);
  const query = q.toString();
  return query ? `?${query}` : '/';
}

const HOME_LANE: Lane = 'top';

// no tag: the server tries the default tags
function loadProfile(player: string): Promise<ProfileResponse> {
  const text = player.trim();
  if (!text.includes('#')) return fetchProfile(text);
  const riotId = parseRiotId(text);
  return riotId ? fetchProfile(riotId.gameName, riotId.tagLine) : Promise.reject(new Error(`Invalid Riot ID: ${text}`));
}

export function App() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [mainLanes, setMainLanes] = useState<MainLanesResponse>({});
  const [route, setRoute] = useState<Route>(readRoute);
  const [query, setQuery] = useState('');
  const [draftLane, setDraftLane] = useState<Lane>(route.lane);
  const [result, setResult] = useState<MatchupResponse | null>(null);
  const [tierList, setTierList] = useState<TierListResponse | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    fetchChampions().then(setChampions).catch((e) => setError(e.message));
    // optional: only used to preselect the lane
    fetchMainLanes().then(setMainLanes).catch(() => {});
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // search box shows the current champion, empty on the homepage
  useEffect(() => {
    setQuery(route.champ ? (champions.find((c) => c.id === route.champ)?.name ?? route.champ) : '');
  }, [route.champ, champions]);

  useEffect(() => {
    setDraftLane(route.lane);
    // ignore responses from older navigations
    const id = ++request.current;
    setLoading(true); setError(null);
    const load = route.player
      ? loadProfile(route.player).then((p) => {
        if (id !== request.current) return;
        setProfile(p);
        setRecent(addRecent(p.riotId));
        // keep Riot's exact ID in the URL
        if (p.riotId !== route.player) window.history.replaceState(null, '', routeUrl({ ...route, player: p.riotId }));
      })
      : route.champ
        ? fetchMatchup(route.champ, route.lane, route.tier).then((r) => { if (id === request.current) setResult(r); })
        : fetchTierList(route.lane, route.tier).then((t) => { if (id === request.current) setTierList(t); });
    load
      .catch((e) => { if (id === request.current) { setResult(null); setTierList(null); setProfile(null); setError((e as Error).message); } })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [route]);

  function navigate(next: Route) {
    window.history.pushState(null, '', routeUrl(next));
    setRoute(next);
  }

  function typeChampion(text: string) {
    setQuery(text);
    const exact = champions.find((c) => c.name.toLowerCase() === text.trim().toLowerCase());
    const lane = exact ? mainLanes[exact.id] : undefined;
    if (lane) setDraftLane(lane);
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    const champion = findChampion(champions, query);
    if (!champion) return setError(`Unknown champion: ${query.trim()}`);
    open(champion.id, draftLane);
  }

  function changeLane(lane: Lane) {
    setDraftLane(lane);
    // on the homepage the lane buttons switch the lists directly
    if (!route.champ && !route.player) navigate({ ...route, lane });
  }

  const open = (champ: string, lane: Lane) => navigate({ champ, player: null, lane, tier: route.tier });
  const openPlayer = (player: string) => navigate({ ...route, champ: null, player });
  const home: Route = { champ: null, player: null, lane: HOME_LANE, tier: route.tier };

  return (
    <main>
      <h1>
        <a href={routeUrl(home)} onClick={(e) => { e.preventDefault(); navigate(home); }}>
          LoL Matchups
        </a>{' '}
        <small>EUW · {TIER_LABELS[route.player && profile ? profile.tier : route.tier]}</small>
      </h1>
      {route.player ? (
        // remount on a new player so the box shows Riot's exact ID
        <PlayerSearch key={profile?.riotId ?? route.player} initial={profile?.riotId ?? route.player} recent={recent} onSearch={openPlayer} />
      ) : (
        <div className="controls">
          <form className="field field-champ" onSubmit={search}>
            <span className="field-label">Champion</span>
            <div className="field-row">
              <ChampionPicker champions={champions} value={query} onChange={typeChampion} />
              <button type="submit" className="primary" disabled={!query.trim() || loading}>
                {loading ? 'Loading…' : 'Search'}
              </button>
            </div>
          </form>
          <div className="field">
            <span className="field-label">Lane</span>
            <LanePicker value={draftLane} onChange={changeLane} />
          </div>
          <div className="field">
            <span className="field-label">Tier</span>
            <TierPicker value={route.tier} onChange={(tier) => navigate({ ...route, tier })} />
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {!route.champ && !route.player && tierList && <TierList data={tierList} onOpen={(id) => open(id, tierList.lane)} />}
      {!route.champ && !route.player && <PlayerSearch recent={recent} onSearch={openPlayer} />}
      {route.player && profile && (
        <PlayerPage data={profile} onOpen={(champ, lane) => navigate({ champ, player: null, lane, tier: profile.tier })} />
      )}
      {route.champ && result && (
        <div className="results">
          <section>
            <h2>Top 10 counters — {result.champion.name} {result.lane}</h2>
            <CounterList counters={result.counters} onOpen={(id) => open(id, result.lane)} />
          </section>
          <BuildPanel title="Recommended build" build={result.build}>
            <p className="ext">
              <a href={lolalyticsBuildUrl(result.champion.id, result.lane, result.tier)} target="_blank" rel="noreferrer">
                Runes &amp; summoner spells on lolalytics ↗
              </a>
            </p>
          </BuildPanel>
        </div>
      )}
      <footer className="muted">v{__APP_VERSION__}</footer>
    </main>
  );
}
