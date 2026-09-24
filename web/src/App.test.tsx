import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Lane, MatchupResponse, ProfileResponse, Tier } from '@lol/shared';
import { App } from './App';
import * as api from './api';

vi.mock('./api');

const champ = (id: string) => ({ id, key: id.length, name: id, icon: `${id}.png` });
const matchupFor = (id: string, lane: Lane = 'top', tier: Tier = 'platinum_plus'): MatchupResponse => ({
  champion: champ(id), lane, tier, build: null,
  counters: [champ('Aaa'), champ('Bbb')].map((c) => ({ champion: c, winRate: 45, games: 2000 })),
});

const profileFor = (riotId: string): ProfileResponse => ({
  riotId, rank: null, tier: 'gold_plus', games: 0, winRate: 0, mainLane: null, pool: [], advice: [], lolalyticsAvailable: true,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const laneButton = (lane: string) => screen.getByRole('button', { name: lane });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.fetchProfile).mockImplementation(async (name, tag) => profileFor(`${name}#${tag}`));
  vi.mocked(api.fetchChampions).mockResolvedValue(['Darius', 'Aaa', 'Bbb', 'LeeSin'].map(champ));
  vi.mocked(api.fetchMainLanes).mockResolvedValue({ Darius: 'top', LeeSin: 'jungle' });
  vi.mocked(api.fetchMatchup).mockImplementation(async (id, lane, tier) => matchupFor(id, lane, tier));
  vi.mocked(api.fetchTierList).mockImplementation(async (lane, tier) => ({
    lane, tier, best: [champ('Aaa')].map((c) => ({ champion: c, winRate: 55, games: 5000 })),
    worst: [champ('Bbb')].map((c) => ({ champion: c, winRate: 42, games: 3000 })),
  }));
  window.history.replaceState(null, '', '/');
});

describe('App', () => {
  it('loads the page from the URL', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=jungle');
    render(<App />);
    await flush();
    expect(api.fetchMatchup).toHaveBeenCalledWith('Darius', 'jungle', 'platinum_plus');
    expect(screen.getByText('Top 10 counters — Darius jungle')).toBeInTheDocument();
    expect(screen.getByLabelText('Champion')).toHaveValue('Darius');
  });

  it('searches and puts the page in the URL', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'darius' } });
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(window.location.search).toBe('?champ=Darius&lane=top');
    expect(screen.getByText('Top 10 counters — Darius top')).toBeInTheDocument();
  });

  it('switches the lane to the champion main lane when picked', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'LeeSin' } });
    expect(laneButton('jungle')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(api.fetchMatchup).toHaveBeenLastCalledWith('LeeSin', 'jungle', 'platinum_plus');
  });

  it('keeps the URL lane when opening a page directly', async () => {
    window.history.replaceState(null, '', '/?champ=LeeSin&lane=top');
    render(<App />);
    await flush();
    expect(laneButton('top')).toHaveAttribute('aria-pressed', 'true');
    expect(api.fetchMatchup).toHaveBeenCalledWith('LeeSin', 'top', 'platinum_plus');
  });

  it('counter cards are not clickable and there is no matchup panel', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    expect(screen.queryByRole('button', { name: /Aaa 45/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^vs /)).not.toBeInTheDocument();
  });

  it('opens a counter page in the same lane with its button, and Back returns', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Open Aaa page' }));
    await flush();
    expect(api.fetchMatchup).toHaveBeenLastCalledWith('Aaa', 'top', 'platinum_plus');
    expect(window.location.search).toBe('?champ=Aaa&lane=top');
    expect(screen.getByText('Top 10 counters — Aaa top')).toBeInTheDocument();
    expect(screen.getByLabelText('Champion')).toHaveValue('Aaa');

    await act(async () => { window.history.back(); });
    await flush();
    await flush();
    expect(screen.getByText('Top 10 counters — Darius top')).toBeInTheDocument();
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

    expect(screen.getByText('Top 10 counters — Bbb top')).toBeInTheDocument();
  });

  it('switches tier on the current page and keeps it in the URL', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    expect(screen.getByText('EUW · Platinum+')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Emerald+' }));
    await flush();
    expect(window.location.search).toBe('?champ=Darius&lane=top&tier=emerald_plus');
    expect(api.fetchMatchup).toHaveBeenLastCalledWith('Darius', 'top', 'emerald_plus');
    expect(screen.getByText('EUW · Emerald+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emerald+' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Open Aaa page' }));
    await flush();
    expect(window.location.search).toBe('?champ=Aaa&lane=top&tier=emerald_plus');
  });

  it('offers Gold+, Platinum+ and Emerald+ in labelled groups', async () => {
    render(<App />);
    await flush();
    const tiers = screen.getByRole('group', { name: 'Tier' });
    expect(Array.from(tiers.querySelectorAll('button'), (b) => b.textContent)).toEqual(['Gold+', 'Platinum+', 'Emerald+']);
    expect(screen.getByRole('group', { name: 'Lane' })).toBeInTheDocument();
    expect(screen.getByText('Tier', { selector: '.field-label' })).toBeInTheDocument();
    expect(screen.getByText('Lane', { selector: '.field-label' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gold+' }));
    await flush();
    expect(window.location.search).toBe('?tier=gold_plus');
    expect(api.fetchTierList).toHaveBeenLastCalledWith('top', 'gold_plus');
    expect(screen.getByText('EUW · Gold+')).toBeInTheDocument();
  });

  it('reads the tier from the URL on the homepage', async () => {
    window.history.replaceState(null, '', '/?lane=middle&tier=emerald_plus');
    render(<App />);
    await flush();
    expect(api.fetchTierList).toHaveBeenCalledWith('middle', 'emerald_plus');
  });

  it('links to the lolalytics build page for the current tier', async () => {
    window.history.replaceState(null, '', '/?champ=MonkeyKing&lane=jungle&tier=emerald_plus');
    render(<App />);
    await flush();
    expect(screen.getByRole('link', { name: /Runes & summoner spells on lolalytics/ })).toHaveAttribute(
      'href', 'https://lolalytics.com/lol/wukong/build/?lane=jungle&tier=emerald_plus&region=euw',
    );
  });

  it('still works when main lanes fail to load', async () => {
    vi.mocked(api.fetchMainLanes).mockRejectedValue(new Error('down'));
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'LeeSin' } });
    expect(laneButton('top')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('down')).not.toBeInTheDocument();
  });

  it('shows the app version', async () => {
    render(<App />);
    await flush();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });

  it('shows the lane homepage with best and lowest win rates', async () => {
    render(<App />);
    await flush();
    expect(api.fetchTierList).toHaveBeenCalledWith('top', 'platinum_plus');
    expect(screen.getByText('Best win rates — top')).toBeInTheDocument();
    expect(screen.getByText('Lowest win rates — top')).toBeInTheDocument();
    expect(screen.getByText('55.00% WR')).toBeInTheDocument();
    expect(screen.getByText('42.00% WR')).toBeInTheDocument();
  });

  it('switches the homepage lane with the lane buttons', async () => {
    render(<App />);
    await flush();
    fireEvent.click(laneButton('jungle'));
    await flush();
    expect(api.fetchTierList).toHaveBeenLastCalledWith('jungle', 'platinum_plus');
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
    expect(api.fetchMatchup).toHaveBeenLastCalledWith('Bbb', 'jungle', 'platinum_plus');
  });

  it('goes back to / from the title and clears the search box', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=middle');
    render(<App />);
    await flush();
    const title = screen.getByRole('link', { name: /LoL Matchups/ });
    expect(title).toHaveAttribute('href', '/');
    fireEvent.click(title);
    await flush();
    expect(window.location.pathname + window.location.search).toBe('/');
    expect(screen.getByText('Best win rates — top')).toBeInTheDocument();
    expect(screen.getByLabelText('Champion')).toHaveValue('');
    expect(screen.getByText('Search')).toBeDisabled();
  });

  it('keeps the chosen tier when going home from the title', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=middle&tier=gold_plus');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByRole('link', { name: /LoL Matchups/ }));
    await flush();
    expect(window.location.search).toBe('?tier=gold_plus');
  });

  it('enables Search as soon as text is typed and opens the first matching champion', async () => {
    render(<App />);
    await flush();
    expect(screen.getByText('Search')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'dar' } });
    expect(screen.getByText('Search')).toBeEnabled();
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(window.location.search).toBe('?champ=Darius&lane=top');
    expect(screen.getByLabelText('Champion')).toHaveValue('Darius');
  });

  it('searches with Enter', async () => {
    render(<App />);
    await flush();
    const input = screen.getByLabelText('Champion');
    fireEvent.change(input, { target: { value: 'darius' } });
    fireEvent.submit(input);
    await flush();
    expect(window.location.search).toBe('?champ=Darius&lane=top');
  });

  it('shows an error for an unknown champion', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(screen.getByText('Unknown champion: zzz')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('Search stays enabled on a champion page after the data loads', async () => {
    window.history.replaceState(null, '', '/?champ=Darius&lane=top');
    render(<App />);
    await flush();
    expect(screen.getByText('Search')).toBeEnabled();
  });

  it('opens a player page from a Riot ID', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Mr Noodle#EUW' } });
    fireEvent.click(screen.getByText('Find player'));
    await flush();
    expect(window.location.search).toBe('?player=Mr+Noodle%23EUW');
    expect(api.fetchProfile).toHaveBeenCalledWith('Mr Noodle', 'EUW');
    expect(screen.getByRole('heading', { name: 'Mr Noodle#EUW' })).toBeInTheDocument();
  });

  it('loads a player page from the URL with only the player search', async () => {
    window.history.replaceState(null, '', '/?player=Me%23EUW');
    render(<App />);
    await flush();
    expect(api.fetchProfile).toHaveBeenCalledWith('Me', 'EUW');
    expect(screen.getByLabelText('Player')).toHaveValue('Me#EUW');
    expect(screen.queryByLabelText('Champion')).not.toBeInTheDocument();
    expect(api.fetchTierList).not.toHaveBeenCalled();
  });

  it('searches another player from a player page', async () => {
    window.history.replaceState(null, '', '/?player=Me%23EUW');
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Other#EUW' } });
    fireEvent.click(screen.getByText('Find player'));
    await flush();
    expect(api.fetchProfile).toHaveBeenLastCalledWith('Other', 'EUW');
    expect(screen.getByRole('heading', { name: 'Other#EUW' })).toBeInTheDocument();
  });

  it('treats a Riot ID in the champion search as a champion name', async () => {
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Champion'), { target: { value: 'Name#EUW' } });
    fireEvent.click(screen.getByText('Search'));
    await flush();
    expect(screen.getByText('Unknown champion: Name#EUW')).toBeInTheDocument();
    expect(api.fetchProfile).not.toHaveBeenCalled();
  });

  it('hides lane and tier controls on a player page', async () => {
    window.history.replaceState(null, '', '/?player=Me%23EUW');
    render(<App />);
    await flush();
    expect(screen.queryByRole('group', { name: 'Tier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'top' })).not.toBeInTheDocument();
  });

  it('opens a champion from a player page with the profile tier', async () => {
    vi.mocked(api.fetchProfile).mockResolvedValue({
      ...profileFor('Me#EUW'), games: 3,
      pool: [{ champion: champ('Darius'), lane: 'jungle', games: 3, wins: 2, winRate: 67, kda: 2, you: null, opponents: null }],
    });
    window.history.replaceState(null, '', '/?player=Me%23EUW');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByLabelText('Open Darius page'));
    await flush();
    expect(api.fetchMatchup).toHaveBeenCalledWith('Darius', 'jungle', 'gold_plus');
  });

  it('finds a player without a tag and shows the real Riot ID in the URL', async () => {
    vi.mocked(api.fetchProfile).mockResolvedValue(profileFor('clöuder#EUR'));
    render(<App />);
    await flush();
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Clöuder' } });
    fireEvent.click(screen.getByText('Find player'));
    await flush();
    expect(api.fetchProfile).toHaveBeenCalledWith('Clöuder');
    expect(window.location.search).toBe(`?${new URLSearchParams({ player: 'clöuder#EUR' })}`);
    expect(screen.getByLabelText('Player')).toHaveValue('clöuder#EUR');
  });

  it('shows an error for an invalid Riot ID in the URL', async () => {
    window.history.replaceState(null, '', '/?player=Name%23');
    render(<App />);
    await flush();
    expect(screen.getByText('Invalid Riot ID: Name#')).toBeInTheDocument();
    expect(api.fetchProfile).not.toHaveBeenCalled();
  });

  it('lists a loaded player as recent on the homepage', async () => {
    vi.mocked(api.fetchProfile).mockResolvedValue(profileFor('Mr Noodle#EUW'));
    window.history.replaceState(null, '', '/?player=mr%20noodle%23euw');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByText('LoL Matchups'));
    await flush();
    expect(screen.getByRole('button', { name: 'Mr Noodle#EUW' })).toBeInTheDocument();
  });

  it('does not list a player whose profile failed', async () => {
    vi.mocked(api.fetchProfile).mockRejectedValue(new Error('No EUW account for Nobody#EUW'));
    window.history.replaceState(null, '', '/?player=Nobody%23EUW');
    render(<App />);
    await flush();
    fireEvent.click(screen.getByText('LoL Matchups'));
    await flush();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('shows the API error for an unknown Riot ID', async () => {
    vi.mocked(api.fetchProfile).mockRejectedValue(new Error('No EUW account for Nobody#EUW'));
    window.history.replaceState(null, '', '/?player=Nobody%23EUW');
    render(<App />);
    await flush();
    expect(screen.getByText('No EUW account for Nobody#EUW')).toBeInTheDocument();
  });
});
