import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TIER, LANES, TIERS, TIER_LABELS, lolalyticsBuildUrl,
  type Champion, type Lane, type MainLanesResponse, type MatchupResponse, type Tier, type TierListResponse,
} from '@lol/shared';
import { fetchChampions, fetchMainLanes, fetchMatchup, fetchTierList } from './api';
import { ChampionPicker } from './components/ChampionPicker';
import { LanePicker } from './components/LanePicker';
import { TierPicker } from './components/TierPicker';
import { CounterList } from './components/CounterList';
import { BuildPanel } from './components/BuildPanel';
import { TierList } from './components/TierList';

interface Route { champ: string | null; lane: Lane; tier: Tier }

function readRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const lane = q.get('lane') as Lane;
  const tier = q.get('tier') as Tier;
  return {
    champ: q.get('champ'),
    lane: LANES.includes(lane) ? lane : 'top',
    tier: TIERS.includes(tier) ? tier : DEFAULT_TIER,
  };
}

function routeUrl({ champ, lane, tier }: Route): string {
  const q = new URLSearchParams(champ ? { champ, lane } : { lane });
  if (tier !== DEFAULT_TIER) q.set('tier', tier);
  return `?${q}`;
}

export function App() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [mainLanes, setMainLanes] = useState<MainLanesResponse>({});
  const [route, setRoute] = useState<Route>(readRoute);
  const [draftChamp, setDraftChamp] = useState<string | null>(route.champ);
  const [draftLane, setDraftLane] = useState<Lane>(route.lane);
  const [result, setResult] = useState<MatchupResponse | null>(null);
  const [tierList, setTierList] = useState<TierListResponse | null>(null);
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

  useEffect(() => {
    setDraftChamp(route.champ);
    setDraftLane(route.lane);
    // ignore responses from older navigations
    const id = ++request.current;
    setLoading(true); setError(null);
    const load = route.champ
      ? fetchMatchup(route.champ, route.lane, route.tier).then((r) => { if (id === request.current) setResult(r); })
      : fetchTierList(route.lane, route.tier).then((t) => { if (id === request.current) setTierList(t); });
    load
      .catch((e) => { if (id === request.current) { setResult(null); setTierList(null); setError((e as Error).message); } })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [route]);

  function navigate(next: Route) {
    window.history.pushState(null, '', routeUrl(next));
    setRoute(next);
  }

  function pickChampion(id: string | null) {
    setDraftChamp(id);
    const lane = id ? mainLanes[id] : undefined;
    if (lane) setDraftLane(lane);
  }

  function changeLane(lane: Lane) {
    setDraftLane(lane);
    // on the homepage the lane buttons switch the lists directly
    if (!route.champ) navigate({ ...route, lane });
  }

  const open = (champ: string, lane: Lane) => navigate({ champ, lane, tier: route.tier });

  return (
    <main>
      <h1>
        <a href={routeUrl({ ...route, champ: null })} onClick={(e) => { e.preventDefault(); navigate({ ...route, champ: null }); }}>
          LoL Matchups
        </a>{' '}
        <small>EUW · {TIER_LABELS[route.tier]}</small>
      </h1>
      <div className="search">
        <ChampionPicker champions={champions} value={draftChamp} onChange={pickChampion} />
        <LanePicker value={draftLane} onChange={changeLane} />
        <TierPicker value={route.tier} onChange={(tier) => navigate({ ...route, tier })} />
        <button onClick={() => draftChamp && open(draftChamp, draftLane)} disabled={!draftChamp || loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!route.champ && tierList && <TierList data={tierList} onOpen={(id) => open(id, tierList.lane)} />}
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
