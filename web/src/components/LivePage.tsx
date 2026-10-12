import { Fragment, useEffect, useRef, useState } from 'react';
import { LANES, type Lane, type LiveFormResponse, type LiveGameResponse, type LivePlayer, type VersusResponse } from '@lol/shared';
import { fetchLiveForm, fetchLiveGame, fetchVersus } from '../api';
import { parseRiotId } from '../riotId';

interface Props { riotId: string; onOpenChampion(id: string, lane: Lane): void }
type Form = LiveFormResponse | 'error';

const WORKERS = 2;
const ONE_TRICK = 7;
const STREAK = 3;
const FIRST_TIME = 10_000;

export function laneOpponent(game: LiveGameResponse): string | null {
  const me = game.allies.find((p) => p.puuid === game.me);
  if (!me?.lane) return null;
  return game.enemies.find((p) => p.lane === me.lane && p.puuid)?.puuid ?? null;
}

// opponent first, then enemies, then allies
export function formOrder(game: LiveGameResponse, opponent: string | null): string[] {
  const ids = (team: LivePlayer[]) => team.flatMap((p) => (p.puuid ? [p.puuid] : []));
  const order = [...ids(game.enemies), ...ids(game.allies)];
  return opponent ? [opponent, ...order.filter((id) => id !== opponent)] : order;
}

export function badges(p: LivePlayer, form?: LiveFormResponse): string[] {
  const out: string[] = [];
  if (form && form.champGames >= ONE_TRICK) out.push('One-trick');
  const run = form ? Number(form.streak.slice(1)) : 0;
  if (form && run >= STREAK) out.push(form.streak.startsWith('W') ? 'Hot streak' : 'Cold streak');
  if (p.mastery !== null && p.mastery < FIRST_TIME) out.push('First time');
  return out;
}

function formText(p: LivePlayer, form: Form | undefined): string {
  if (form === undefined) return 'Loading form…';
  if (form === 'error') return 'Form unavailable';
  if (form.games === 0) return 'No recent ranked games';
  return `${form.streak} · ${form.wins}-${form.games - form.wins} last ${form.games} · ${form.champWins}/${form.champGames} on ${p.champion.name}`;
}

// rows aligned by lane when lanes are known
function byLane(team: LivePlayer[]): LivePlayer[] {
  return team.every((p) => p.lane) ? [...team].sort((a, b) => LANES.indexOf(a.lane!) - LANES.indexOf(b.lane!)) : team;
}

function PlayerCard({ player, form, selected, onSelect }: { player: LivePlayer; form?: Form; selected?: boolean; onSelect?(): void }) {
  const icon = player.champion.icon ? <img src={player.champion.icon} alt="" width={40} height={40} /> : <span />;
  if (player.anonymous) return <div className="live-card muted">{icon}<span className="name">Hidden player</span><span>{player.champion.name}</span></div>;
  const rank = player.lookupFailed ? '–' : player.rank ? `${player.rank.tier} ${player.rank.division} · ${player.rank.lp} LP` : 'Unranked';
  const total = (player.seasonWins ?? 0) + (player.seasonLosses ?? 0);
  const season = total > 0 ? `${Math.round(((player.seasonWins ?? 0) / total) * 100)}% WR · ${total} games` : null;
  const mastery = player.mastery !== null ? `${Math.round(player.mastery / 1000)}k mastery` : null;
  const content = (
    <>
      {icon}
      <span className="name">{player.riotId} <span className="muted">{player.champion.name}</span></span>
      <span>{[rank, season, mastery].filter(Boolean).join(' · ')}</span>
      <span className={form === undefined ? 'skeleton' : 'muted'}>{formText(player, form)}</span>
      <span>{badges(player, form && form !== 'error' ? form : undefined).map((b) => <span key={b} className="badge">{b}</span>)}</span>
    </>
  );
  return onSelect
    ? <button className="live-card" aria-pressed={selected} onClick={onSelect}>{content}</button>
    : <div className="live-card">{content}</div>;
}

export function LivePage({ riotId, onOpenChampion }: Props) {
  const [game, setGame] = useState<LiveGameResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [opponent, setOpponent] = useState<string | null>(null);
  const [versus, setVersus] = useState<VersusResponse | null | 'error' | undefined>(undefined);
  // read by the form workers, so a new opponent is fetched next
  const order = useRef<string[]>([]);
  order.current = game ? formOrder(game, opponent) : [];

  useEffect(() => {
    let cancelled = false;
    setGame(null); setError(null); setForms({}); setOpponent(null);
    const id = parseRiotId(riotId);
    const load = id ? fetchLiveGame(id.gameName, id.tagLine) : Promise.reject(new Error(`Invalid Riot ID: ${riotId}`));
    load
      .then((g) => { if (!cancelled) { setGame(g); setOpponent(laneOpponent(g)); } })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [riotId, attempt]);

  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    const started = new Set<string>();
    const champKey = new Map([...game.allies, ...game.enemies].map((p) => [p.puuid, p.champion.key]));
    const next = () => order.current.find((id) => !started.has(id));
    const worker = async () => {
      for (let id = next(); id && !cancelled; id = next()) {
        started.add(id);
        const form: Form = await fetchLiveForm(id, champKey.get(id)!).catch(() => 'error' as const);
        if (!cancelled) setForms((f) => ({ ...f, [id]: form }));
      }
    };
    for (let i = 0; i < WORKERS; i++) void worker();
    return () => { cancelled = true; };
  }, [game]);

  const me = game?.allies.find((p) => p.puuid === game.me);
  const opp = game?.enemies.find((p) => p.puuid === opponent);
  const lane = me?.lane ?? opp?.lane ?? null;

  useEffect(() => {
    setVersus(undefined);
    if (!game || !me || !opp || !lane) return;
    let cancelled = false;
    fetchVersus(me.champion.id, opp.champion.id, lane, game.tier)
      .then((v) => { if (!cancelled) setVersus(v); })
      .catch(() => { if (!cancelled) setVersus('error'); });
    return () => { cancelled = true; };
  }, [game, me?.champion.id, opp?.champion.id, lane]);

  if (error) {
    return (
      <section className="live">
        <p className="error">{error}</p>
        <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
      </section>
    );
  }
  if (!game) return <p className="muted">Loading live game…</p>;

  const allies = byLane(game.allies);
  const enemies = byLane(game.enemies);
  const oppForm = opp?.puuid ? forms[opp.puuid] : undefined;

  return (
    <section className="live">
      <h2>Live game — {riotId}</h2>
      <div className="live-grid">
        {allies.map((a, i) => (
          <Fragment key={a.puuid ?? `a${i}`}>
            <PlayerCard player={a} form={a.puuid ? forms[a.puuid] : undefined} />
            {enemies[i] && (
              <PlayerCard
                player={enemies[i]}
                form={enemies[i].puuid ? forms[enemies[i].puuid!] : undefined}
                selected={enemies[i].puuid === opponent}
                onSelect={enemies[i].puuid ? () => setOpponent(enemies[i].puuid) : undefined}
              />
            )}
          </Fragment>
        ))}
      </div>
      {opp && me && (
        <section className="live-opponent">
          <h3>Lane opponent — {opp.riotId} ({opp.champion.name})</h3>
          <p>{formText(opp, oppForm)}</p>
          {versus === 'error' && <p className="muted">Matchup data unavailable</p>}
          {versus === null && <p className="muted">Not enough games for this matchup</p>}
          {versus && versus !== 'error' && (
            <p>{me.champion.name} vs {opp.champion.name}: {versus.winRate.toFixed(2)}% WR over {versus.games.toLocaleString('en-GB')} games</p>
          )}
          {lane && <button onClick={() => onOpenChampion(opp.champion.id, lane)}>{opp.champion.name} counters ↗</button>}
        </section>
      )}
    </section>
  );
}
