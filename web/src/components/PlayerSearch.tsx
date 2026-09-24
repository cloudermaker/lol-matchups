import { useState } from 'react';
import { parseRiotId } from '../riotId';

interface Props { recent: string[]; onSearch(riotId: string): void; initial?: string }

export function PlayerSearch({ recent, onSearch, initial = '' }: Props) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    setError(null);
    // no tag: the server tries EUW, then EUR
    if (!value.includes('#')) return onSearch(value);
    const riotId = parseRiotId(value);
    if (!riotId) return setError(`Invalid Riot ID: ${value}`);
    onSearch(`${riotId.gameName}#${riotId.tagLine}`);
  }

  return (
    <section className="player-search">
      <h2>Find a player</h2>
      <form className="field-row" onSubmit={submit}>
        <input
          aria-label="Player"
          placeholder="Name#TAG (tries EUW, then EUR)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!text.trim()}>Find player</button>
      </form>
      {error && <p className="error">{error}</p>}
      {recent.length > 0 && (
        <div className="recent">
          <span className="field-label">Recent</span>
          {recent.map((id) => <button key={id} onClick={() => onSearch(id)}>{id}</button>)}
        </div>
      )}
    </section>
  );
}
