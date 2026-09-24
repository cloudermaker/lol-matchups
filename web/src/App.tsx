import { useEffect, useRef, useState } from 'react';
import { LANES, type Build, type Champion, type Lane, type MatchupResponse, type TierListResponse } from '@lol/shared';
import { fetchBuild, fetchChampions, fetchMatchup, fetchTierList } from './api';
import { ChampionPicker } from './components/ChampionPicker';
import { LanePicker } from './components/LanePicker';
import { CounterList } from './components/CounterList';
import { BuildPanel } from './components/BuildPanel';
import { TierList } from './components/TierList';

interface Route { champ: string | null; lane: Lane }

function readRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const lane = q.get('lane') as Lane;
  return { champ: q.get('champ'), lane: LANES.includes(lane) ? lane : 'top' };
}

export function App() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [route, setRoute] = useState<Route>(readRoute);
  const [draftChamp, setDraftChamp] = useState<string | null>(route.champ);
  const [draftLane, setDraftLane] = useState<Lane>(route.lane);
  const [result, setResult] = useState<MatchupResponse | null>(null);
  const [tierList, setTierList] = useState<TierListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [vs, setVs] = useState<string | null>(null);
  const [vsBuild, setVsBuild] = useState<Build | null | undefined>(undefined);
  const request = useRef(0);
  const buildRequest = useRef(0);

  useEffect(() => { fetchChampions().then(setChampions).catch((e) => setError(e.message)); }, []);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setDraftChamp(route.champ);
    setDraftLane(route.lane);
    buildRequest.current++;
    setVs(null); setVsBuild(undefined);
    // ignore responses from older navigations
    const id = ++request.current;
    setLoading(true); setError(null);
    const load = route.champ
      ? fetchMatchup(route.champ, route.lane).then((r) => { if (id === request.current) setResult(r); })
      : fetchTierList(route.lane).then((t) => { if (id === request.current) setTierList(t); });
    load
      .catch((e) => { if (id === request.current) { setResult(null); setTierList(null); setError((e as Error).message); } })
      .finally(() => { if (id === request.current) setLoading(false); });
  }, [route]);

  function navigate(champ: string | null, lane: Lane) {
    window.history.pushState(null, '', `?${new URLSearchParams(champ ? { champ, lane } : { lane })}`);
    setRoute({ champ, lane });
  }

  function changeLane(lane: Lane) {
    setDraftLane(lane);
    // on the homepage the lane buttons switch the lists directly
    if (!route.champ) navigate(null, lane);
  }

  async function selectCounter(id: string) {
    if (!result) return;
    // ignore responses from older clicks or navigations
    const req = ++buildRequest.current;
    setVs(id); setVsBuild(undefined); setError(null);
    try {
      const { build } = await fetchBuild(result.champion.id, result.lane, id);
      if (req === buildRequest.current) setVsBuild(build);
    } catch (e) {
      if (req === buildRequest.current) setError((e as Error).message);
    }
  }

  const vsName = result?.counters.find((c) => c.champion.id === vs)?.champion.name;

  return (
    <main>
      <h1>
        <a href={`?lane=${route.lane}`} onClick={(e) => { e.preventDefault(); navigate(null, route.lane); }}>LoL Matchups</a>{' '}
        <small>EUW · Platinum+</small>
      </h1>
      <div className="search">
        <ChampionPicker champions={champions} value={draftChamp} onChange={setDraftChamp} />
        <LanePicker value={draftLane} onChange={changeLane} />
        <button onClick={() => draftChamp && navigate(draftChamp, draftLane)} disabled={!draftChamp || loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!route.champ && tierList && <TierList data={tierList} onOpen={(id) => navigate(id, tierList.lane)} />}
      {route.champ && result && (
        <div className="results">
          <section>
            <h2>Top 5 counters — {result.champion.name} {result.lane}</h2>
            <CounterList
              counters={result.counters}
              selected={vs}
              onSelect={selectCounter}
              onOpen={(id) => navigate(id, result.lane)}
            />
          </section>
          <BuildPanel title="Recommended build" build={result.build} />
          {vs && vsBuild !== undefined && <BuildPanel title={`vs ${vsName}`} build={vsBuild} />}
        </div>
      )}
    </main>
  );
}
