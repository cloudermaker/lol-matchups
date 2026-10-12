import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Lane, LiveGameResponse, LivePlayer } from '@lol/shared';
import * as api from '../api';
import { LivePage, badges, formOrder, laneOpponent } from './LivePage';

vi.mock('../api');

const champ = (id: string) => ({ id, key: id.length * 10, name: id, icon: `${id}.png` });
const player = (puuid: string | null, c: string, lane: Lane | null, o: Partial<LivePlayer> = {}): LivePlayer => ({
  puuid, riotId: puuid ? `${puuid}#EUW` : null, anonymous: puuid === null, champion: champ(c), spells: [4, 14], lane,
  rank: { tier: 'GOLD', division: 'II', lp: 50 }, seasonWins: 30, seasonLosses: 20, mastery: 50_000, lookupFailed: false, ...o,
});
const game: LiveGameResponse = {
  queueId: 420, gameStartTime: 1, me: 'me', tier: 'gold_plus',
  allies: [player('me', 'Darius', 'top'), player('a2', 'LeeSin', 'jungle'), player('a3', 'Ahri', 'middle'), player('a4', 'Jinx', 'bottom'), player('a5', 'Lulu', 'support')],
  enemies: [player('e1', 'Garen', 'top', { mastery: 2_000 }), player('e2', 'Vi', 'jungle'), player('e3', 'Lux', 'middle'), player('e4', 'Ezreal', 'bottom'), player(null, 'Nami', 'support')],
};
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchLiveGame).mockResolvedValue(game);
  vi.mocked(api.fetchLiveForm).mockResolvedValue({ games: 10, wins: 7, streak: 'W4', kda: 3, champGames: 8, champWins: 6 });
  vi.mocked(api.fetchVersus).mockResolvedValue({ winRate: 52.3, games: 4000 });
});

describe('helpers', () => {
  it('finds the lane opponent', () => {
    expect(laneOpponent(game)).toBe('e1');
    expect(laneOpponent({ ...game, allies: game.allies.map((p) => ({ ...p, lane: null })) })).toBeNull();
  });

  it('orders forms: opponent, enemies, allies, no hidden players', () => {
    expect(formOrder(game, 'e3')).toEqual(['e3', 'e1', 'e2', 'e4', 'me', 'a2', 'a3', 'a4', 'a5']);
  });

  it('builds badges', () => {
    expect(badges(game.enemies[0], { games: 10, wins: 7, streak: 'W4', kda: 3, champGames: 8, champWins: 6 })).toEqual(['One-trick', 'Hot streak', 'First time']);
    expect(badges(game.allies[0], { games: 10, wins: 2, streak: 'L3', kda: 1, champGames: 2, champWins: 0 })).toEqual(['Cold streak']);
    expect(badges(game.allies[0])).toEqual([]);
  });
});

describe('LivePage', () => {
  it('shows all players and loads the lane opponent first', async () => {
    render(<LivePage riotId="Me#EUW" onOpenChampion={vi.fn()} />);
    await flush();
    expect(api.fetchLiveGame).toHaveBeenCalledWith('Me', 'EUW');
    expect(screen.getByText('Hidden player')).toBeInTheDocument();
    expect(screen.getAllByText(/GOLD II · 50 LP/)).toHaveLength(9);
    expect(vi.mocked(api.fetchLiveForm).mock.calls[0]).toEqual(['e1', champ('Garen').key]);
    expect(api.fetchLiveForm).toHaveBeenCalledTimes(9);
    expect(screen.getByRole('heading', { name: /Lane opponent — e1#EUW/ })).toBeInTheDocument();
    expect(screen.getByText(/Darius vs Garen: 52.30% WR over 4,000 games/)).toBeInTheDocument();
    expect(api.fetchVersus).toHaveBeenCalledWith('Darius', 'Garen', 'top', 'gold_plus');
  });

  it('switches the lane opponent on click', async () => {
    render(<LivePage riotId="Me#EUW" onOpenChampion={vi.fn()} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /e3#EUW/ }));
    await flush();
    expect(screen.getByRole('heading', { name: /Lane opponent — e3#EUW/ })).toBeInTheDocument();
  });

  it('shows Not in a game with Retry', async () => {
    vi.mocked(api.fetchLiveGame).mockRejectedValueOnce(new Error('Me#EUW is not in a game'));
    render(<LivePage riotId="Me#EUW" onOpenChampion={vi.fn()} />);
    await flush();
    expect(screen.getByText('Me#EUW is not in a game')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(api.fetchLiveGame).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Me#EUW is not in a game')).not.toBeInTheDocument();
  });

  it('marks a failed form', async () => {
    vi.mocked(api.fetchLiveForm).mockRejectedValue(new Error('busy'));
    render(<LivePage riotId="Me#EUW" onOpenChampion={vi.fn()} />);
    await flush();
    expect(screen.getAllByText('Form unavailable').length).toBeGreaterThan(0);
  });

  it('hides matchup numbers when lolalytics fails', async () => {
    vi.mocked(api.fetchVersus).mockRejectedValue(new Error('down'));
    render(<LivePage riotId="Me#EUW" onOpenChampion={vi.fn()} />);
    await flush();
    expect(screen.getByText('Matchup data unavailable')).toBeInTheDocument();
  });
});
