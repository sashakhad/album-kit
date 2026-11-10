export type VoteDelta = 1 | -1;

export type VoteChoice = {
  versionSlug: string;
  takeLabel: string;
  value: number;
  round: number;
};

export type DownloadChoice = {
  versionSlug: string;
  takeLabel: string;
  round: number;
};

export type TakeTallies = Record<string, number>;
export type VersionTakeTallies = Record<string, TakeTallies>;
export type TrackTallies = Record<number, VersionTakeTallies>;

export type VoteSnapshot = {
  tallies: TrackTallies;
  mine: Record<number, VoteChoice[]>;
  downloads: Record<number, DownloadChoice[]>;
  versionTotals: Record<string, number>;
  currentRound: number;
  listenerTallies?: TrackTallies;
};

export const EMPTY_VOTE_SNAPSHOT: VoteSnapshot = {
  tallies: {},
  mine: {},
  downloads: {},
  versionTotals: {},
  currentRound: 1,
};

export function isTakeLabel(value: string): boolean {
  return /^[A-Z]{1,2}$/.test(value);
}
