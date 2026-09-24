import type { Lane, PoolEntry, ProfileResponse, StatLine } from '@lol/shared';

interface Props { data: ProfileResponse; onOpen(id: string, lane: Lane): void }

const METRICS: { key: keyof StatLine; label: string; digits: number; lowerIsBetter?: boolean }[] = [
  { key: 'csPerMin', label: 'CS/min', digits: 1 },
  { key: 'deaths', label: 'Deaths', digits: 1, lowerIsBetter: true },
  { key: 'visionPerMin', label: 'Vision/min', digits: 2 },
  { key: 'damagePerMin', label: 'Dmg/min', digits: 0 },
  { key: 'goldPerMin', label: 'Gold/min', digits: 0 },
];
const THRESHOLD = 0.1;

// better/worse only beyond 10% from your opponents
export function compare(you: number, them: number, lowerIsBetter = false): 'better' | 'worse' | 'even' {
  if (them === 0) return 'even';
  const diff = (you - them) / them;
  if (Math.abs(diff) <= THRESHOLD) return 'even';
  return diff > 0 !== lowerIsBetter ? 'better' : 'worse';
}

export function PlayerPage({ data, onOpen }: Props) {
  const summary = [
    data.rank ? `${data.rank.tier} ${data.rank.division} · ${data.rank.lp} LP` : 'Unranked',
    `${data.games} ranked games analysed`,
    data.games > 0 ? `${data.winRate}% WR` : null,
    data.mainLane ? `main ${data.mainLane}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="player">
      <h2>{data.riotId}</h2>
      <p className="muted">{summary}</p>
      {data.games === 0 ? (
        <>
          <p>No ranked Solo/Duo games found for {data.riotId}.</p>
          <p className="muted">Not your account? Check the tag after # — your full Riot ID is shown in the League client.</p>
        </>
      ) : (
        <>
          {!data.lolalyticsAvailable && <p className="muted">lolalytics unavailable: counter tags and build advice skipped</p>}
          {data.advice.length > 0 && (
            <section>
              <h3>Advice</h3>
              <ul className="advice">{data.advice.map((a) => <li key={a.text} className={`advice-${a.kind}`}>{a.text}</li>)}</ul>
            </section>
          )}
          <section>
            <h3>Champion pool</h3>
            <PoolTable pool={data.pool} onOpen={onOpen} />
          </section>
        </>
      )}
    </div>
  );
}

function PoolTable({ pool, onOpen }: { pool: PoolEntry[]; onOpen: Props['onOpen'] }) {
  return (
    <table className="pool">
      <thead>
        <tr>
          <th>Champion</th><th>Lane</th><th>Games</th><th>W-L</th><th>WR</th><th>KDA</th>
          {METRICS.map((m) => <th key={m.key}>{m.label}<br /><small>you / opp</small></th>)}
        </tr>
      </thead>
      <tbody>
        {pool.map(({ champion, lane, games, wins, winRate, kda, you, opponents }) => (
          <tr key={`${champion.id}:${lane}`} className={you ? undefined : 'few'}>
            <td>
              <img src={champion.icon} alt="" width={24} height={24} /> {champion.name}{' '}
              <button className="open" aria-label={`Open ${champion.name} page`} onClick={() => onOpen(champion.id, lane)}>↗</button>
            </td>
            <td>{lane}</td><td>{games}</td><td>{wins}-{games - wins}</td><td>{winRate}%</td><td>{kda.toFixed(2)}</td>
            {you && opponents
              ? METRICS.map((m) => (
                <td key={m.key} className={compare(you[m.key], opponents[m.key], m.lowerIsBetter)}>
                  {you[m.key].toFixed(m.digits)} / {opponents[m.key].toFixed(m.digits)}
                </td>
              ))
              : <td colSpan={METRICS.length} className="muted">too few games</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
