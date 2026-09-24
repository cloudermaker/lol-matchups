import type { RiotMatch, RiotParticipant } from '../../src/riot/types';

export function participant(o: Partial<RiotParticipant> = {}): RiotParticipant {
  return {
    puuid: 'other', championId: 1, teamId: 100, teamPosition: 'TOP', win: false,
    kills: 0, deaths: 0, assists: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0, visionScore: 0,
    totalDamageDealtToChampions: 0, goldEarned: 0,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, gameEndedInEarlySurrender: false,
    ...o,
  };
}

export function match(id: string, participants: RiotParticipant[], gameDuration = 1800): RiotMatch {
  return { metadata: { matchId: id }, info: { gameDuration, queueId: 420, participants } };
}

interface LaneGame { champ: number; opp: number; lane?: string; win?: boolean; me?: Partial<RiotParticipant>; them?: Partial<RiotParticipant>; duration?: number }

// "me" against one lane opponent
export function laneGame(id: string, o: LaneGame): RiotMatch {
  const lane = o.lane ?? 'TOP';
  const win = o.win ?? true;
  return match(id, [
    participant({ puuid: 'me', championId: o.champ, teamId: 100, teamPosition: lane, win, ...o.me }),
    participant({ puuid: 'opp', championId: o.opp, teamId: 200, teamPosition: lane, win: !win, ...o.them }),
  ], o.duration);
}
