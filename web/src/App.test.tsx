import { render, screen, fireEvent, act } from '@testing-library/react';
import type { BuildResponse, MatchupResponse } from '@lol/shared';
import { App } from './App';
import * as api from './api';

vi.mock('./api');

const champ = (id: string) => ({ id, key: id.length, name: id, icon: `${id}.png` });
const item = (id: string) => ({ id, name: `Item ${id}`, icon: `${id}.png` });
const build = (id: string) => ({ early: [], core: [item(id)], boots: null, games: 100, winRate: 50 });
const matchupFor =(id: string, lane: 'top' | 'jungle' = 'top'): MatchupResponse => ({
  champion: champ(id), lane, build: null,
  counters: [champ('Aaa'), champ('Bbb')].map((c) => ({ champion: c, winRate: 45, games: 2000 })),
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  vi.mocked(api.fetchChampions).mockResolvedValue(['Darius', 'Aaa', 'Bbb'].map(champ));
  vi.mocked(api.fetchMatchup).mockImplementation(async (id, lane) => matchupFor(id, lane as 'top'));
  vi.mocked(api.fetchTierList).mockImplementation(async (lane) => ({
    lane, best: [champ('Aaa')].map((c) => ({ champion: c, winRate: 55, games: 5000 })),
    worst: [champ('Bbb')].map((c) => ({ champion: c, winRate: 42, games: 3000 })),
  }));
  window.history.replaceState(null, '', '/');
});

describe('App', () => {
  it('loads the page from the URL', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=jungle');
    render(<App />);
    await flush();
    expect(api.fetchMatchup).toHaveBeenCalledWith('Darius', 'jungle');
    expect(screen.getByText('Top 5 counters — Darius jungle')).toBeInTheDocument();
    expect(screen.getByLabelText('Champion')).toHaveValue('Darius');
  });

  it('searches and puts the page in the URL', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'darius' } });
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(window.location.search).toBe('?champ=Darius&lane=top');
    expect(screen.getByText('Top 5 counters — Darius top')).toBeInTheDocument();
  });

  it('clicking a counter shows the matchup panel and stays on the page', async () => {
    vi.mocked(api.fetchBuild).mockResolvedValue({ build: null });
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByText('Aaa'));
    await flush();
    expect(api.fetchBuild).toHaveBeenCalledWith('Darius', 'top', 'Aaa');
    expect(screen.getByText('vs Aaa')).toBeInTheDocument();
    expect(window.location.search).toBe('?champ=Darius&lane=top');
    expect(screen.getByText('Top 5 counters — Darius top')).toBeInTheDocument();
  });

  it('ignores a stale matchup build that resolves after a newer click', async () => {
    const a = deferred<BuildResponse>();
    const b = deferred<BuildResponse>();
    vi.mocked(api.fetchBuild).mockImplementation((_c, _l, vs) => (vs === 'Aaa' ? a.promise : b.promise));
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByText('Aaa'));
    fireEvent.click(screen.getByText('Bbb'));
    await act(async () => { b.resolve({ build: build('B') }); });
    await act(async () => { a.resolve({ build: build('A') }); });
    expect(screen.getByText('vs Bbb')).toBeInTheDocument();
    expect(screen.getByAltText('Item B')).toBeInTheDocument();
    expect(screen.queryByAltText('Item A')).not.toBeInTheDocument();
  });

  it('opens a counter page in the same lane with its button, and Back returns', async () => {
    vi.mocked(api.fetchBuild).mockResolvedValue({ build: null });
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByText('Bbb'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Open Aaa page' }));
    await flush();
    expect(api.fetchMatchup).toHaveBeenLastCalledWith('Aaa', 'top');
    expect(window.location.search).toBe('?champ=Aaa&lane=top');
    expect(screen.getByText('Top 5 counters — Aaa top')).toBeInTheDocument();
    expect(screen.getByLabelText('Champion')).toHaveValue('Aaa');
    expect(screen.queryByText(/^vs /)).not.toBeInTheDocument();

    await act(async () => { window.history.back(); });
    await flush();
    await flush();
    expect(screen.getByText('Top 5 counters — Darius top')).toBeInTheDocument();
  });

  it('ignores a stale result that resolves after a newer navigation', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    const a = deferred<MatchupResponse>();
    const b = deferred<MatchupResponse>();
    vi.mocked(api.fetchMatchup).mockImplementation((id) => (id === 'Aaa' ? a.promise : b.promise));

    fireEvent.click(screen.getByRole('button', { name: 'Open Aaa page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Bbb page' }));
    await act(async () => { b.resolve(matchupFor('Bbb')); });
    await act(async () => { a.resolve(matchupFor('Aaa')); });

    expect(screen.getByText('Top 5 counters — Bbb top')).toBeInTheDocument();
  });

  it('shows the app version', async () => {
    render(<App />);
    await flush();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });

  it('shows the lane homepage with best and lowest win rates', async () => {
    render(<App />);
    await flush();
    expect(api.fetchTierList).toHaveBeenCalledWith('top');
    expect(screen.getByText('Best win rates — top')).toBeInTheDocument();
    expect(screen.getByText('Lowest win rates — top')).toBeInTheDocument();
    expect(screen.getByText('55.00% WR')).toBeInTheDocument();
    expect(screen.getByText('42.00% WR')).toBeInTheDocument();
  });

  it('switches the homepage lane with the lane buttons', async () => {
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'jungle' }));
    await flush();
    expect(api.fetchTierList).toHaveBeenLastCalledWith('jungle');
    expect(window.location.search).toBe('?lane=jungle');
    expect(screen.getByText('Best win rates — jungle')).toBeInTheDocument();
  });

  it('opens a champion page from the homepage in that lane', async () => {
    window.history.replaceState(null, '', '/?lane=jungle');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Open Bbb page' }));
    await flush();
    expect(window.location.search).toBe('?champ=Bbb&lane=jungle');
    expect(api.fetchMatchup).toHaveBeenLastCalledWith('Bbb', 'jungle');
  });

  it('goes back to the homepage from the title', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=middle');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('link', { name: /LoL Matchups/ }));
    await flush();
    expect(window.location.search).toBe('?lane=middle');
    expect(screen.getByText('Best win rates — middle')).toBeInTheDocument();
  });
});
