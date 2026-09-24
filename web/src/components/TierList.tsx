import type { TierEntry, TierListResponse } from '@lol/shared';

function Rows({ entries, onOpen }: { entries: TierEntry[]; onOpen(id: string): void }) {
  if (entries.length === 0) return <p className="muted">No champions with enough games</p>;
  return (
    <ol className="counters">
      {entries.map(({ champion, winRate, games }) => (
        <li key={champion.id} className="counter-row">
          <div className="counter static">
            <img src={champion.icon} alt="" width={40} height={40} />
            <span className="name">{champion.name}</span>
            <span className="wr">{winRate.toFixed(2)}% WR</span>
            <span className="muted">{games.toLocaleString('en-GB')} games</span>
          </div>
          <button className="open" aria-label={`Open ${champion.name} page`} title={`Open ${champion.name} page`} onClick={() => onOpen(champion.id)}>
            ↗
          </button>
        </li>
      ))}
    </ol>
  );
}

export function TierList({ data, onOpen }: { data: TierListResponse; onOpen(id: string): void }) {
  return (
    <div className="results">
      <section className="best">
        <h2>Best win rates — {data.lane}</h2>
        <Rows entries={data.best} onOpen={onOpen} />
      </section>
      <section className="worst">
        <h2>Lowest win rates — {data.lane}</h2>
        <Rows entries={data.worst} onOpen={onOpen} />
      </section>
    </div>
  );
}
