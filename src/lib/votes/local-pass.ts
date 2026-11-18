export type LocalBallot = {
  pass: number;
  selected: string | null;
  votes: Record<string, number>;
  retired: string[];
};

export type LocalBallotStore = {
  albums: Record<string, LocalBallot>;
};

export function emptyLocalBallot(): LocalBallot {
  return { pass: 1, selected: null, votes: {}, retired: [] };
}

function copyVotes(value: unknown): Record<string, number> {
  const votes: Record<string, number> = {};
  if (typeof value !== 'object' || value === null) return votes;
  for (const [filename, score] of Object.entries(value)) {
    if (typeof score === 'number' && Number.isFinite(score)) votes[filename] = score;
  }
  return votes;
}

function copyNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !names.includes(item)) names.push(item);
  }
  return names;
}

function ballotFrom(value: unknown): LocalBallot | null {
  if (typeof value !== 'object' || value === null || !('votes' in value)) return null;
  const record = value as Record<string, unknown>;
  const pass = typeof record.pass === 'number' && record.pass >= 1 ? Math.floor(record.pass) : 1;
  const selected = typeof record.selected === 'string' ? record.selected : null;
  return {
    pass,
    selected,
    votes: copyVotes(record.votes),
    retired: copyNames(record.retired),
  };
}

/** One file holds every album tried in this checkout. A different album starts at pass 1. */
export function readLocalStore(raw: unknown, albumKey: string): LocalBallotStore {
  if (typeof raw === 'object' && raw !== null && 'albums' in raw) {
    const albums: Record<string, LocalBallot> = {};
    const source = (raw as { albums?: unknown }).albums;
    if (typeof source === 'object' && source !== null) {
      for (const [key, value] of Object.entries(source)) {
        const ballot = ballotFrom(value);
        if (ballot !== null) albums[key] = ballot;
      }
    }
    return { albums };
  }
  const legacy = ballotFrom(raw);
  if (legacy === null) return { albums: {} };
  return { albums: { [albumKey]: legacy } };
}

export function applyLocalVote(
  ballot: LocalBallot,
  filename: string,
  vote: -1 | 1 | undefined,
  select = true
): LocalBallot {
  if (ballot.retired.includes(filename)) return ballot;
  const votes = { ...ballot.votes };
  if (vote !== undefined) votes[filename] = (votes[filename] ?? 0) + vote;
  return { ...ballot, selected: select ? filename : ballot.selected, votes };
}

/**
 * The next pass drops negative scores. Positive scores carry forward.
 * Zero and missing scores stay. Retired takes stay out.
 */
export function advanceLocalPass(ballot: LocalBallot): LocalBallot {
  const votes: Record<string, number> = {};
  const retired = [...ballot.retired];
  for (const [filename, score] of Object.entries(ballot.votes)) {
    if (score < 0) {
      if (!retired.includes(filename)) retired.push(filename);
      continue;
    }
    votes[filename] = score;
  }
  const selected =
    ballot.selected !== null && retired.includes(ballot.selected) ? null : ballot.selected;
  return { pass: ballot.pass + 1, selected, votes, retired };
}
