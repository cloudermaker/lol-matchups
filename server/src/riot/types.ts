export interface RiotAccount { puuid: string; gameName: string; tagLine: string }
export interface RiotLeagueEntry { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }
export interface RiotParticipant {
  puuid: string; championId: number; teamId: number; teamPosition: string; win: boolean;
  kills: number; deaths: number; assists: number;
  totalMinionsKilled: number; neutralMinionsKilled: number; visionScore: number;
  totalDamageDealtToChampions: number; goldEarned: number;
  item0: number; item1: number; item2: number; item3: number; item4: number; item5: number;
  gameEndedInEarlySurrender: boolean;
}
// gameDuration is in seconds
export interface RiotMatch { metadata: { matchId: string }; info: { gameDuration: number; queueId: number; participants: RiotParticipant[] } }
// puuid is empty for hidden players and bots
export interface RiotSpectatorParticipant { puuid: string | null; teamId: number; championId: number; spell1Id: number; spell2Id: number; riotId?: string; bot?: boolean }
export interface RiotActiveGame { gameId: number; mapId: number; gameQueueConfigId: number; gameStartTime: number; participants: RiotSpectatorParticipant[] }
