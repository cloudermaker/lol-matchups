import type { Build, Item } from '@lol/shared';

const Items = ({ items }: { items: Item[] }) => (
  <div className="items">
    {items.map((i, n) => <img key={`${i.id}-${n}`} src={i.icon} alt={i.name} title={i.name} width={36} height={36} />)}
  </div>
);

export function BuildPanel({ title, build }: { title: string; build: Build | null }) {
  return (
    <section className="build">
      <h2>{title}</h2>
      {!build ? (
        <p className="muted">Not enough data for this matchup</p>
      ) : (
        <>
          <p className="muted">{build.winRate.toFixed(2)}% WR · {build.games.toLocaleString('en-GB')} games</p>
          <h3>Early items</h3><Items items={build.early} />
          <h3>Core items</h3><Items items={build.core} />
          <h3>Boots</h3>{build.boots ? <Items items={[build.boots]} /> : <p className="muted">No data</p>}
        </>
      )}
    </section>
  );
}
