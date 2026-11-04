import { parseCanonicalTake, type CanonicalTake } from '@/lib/album/parse-filename';

type TakeKey = {
  versionSlug: string;
  trackNumber: number;
  takeLabel: string;
};

type BatchResult = {
  count: number;
};

export type MoveTakeTx = {
  vote: {
    count(args: { where: TakeKey }): PromiseLike<number>;
    deleteMany(args: { where: TakeKey }): PromiseLike<BatchResult>;
    updateMany(args: { where: TakeKey; data: TakeKey }): PromiseLike<BatchResult>;
  };
  download: {
    deleteMany(args: { where: TakeKey }): PromiseLike<BatchResult>;
    updateMany(args: { where: TakeKey; data: TakeKey }): PromiseLike<BatchResult>;
  };
  takeSighting: {
    updateMany(args: {
      where: { filename: string };
      data: { filename: string };
    }): PromiseLike<BatchResult>;
  };
  parkedTake: {
    count(args: { where: TakeKey }): PromiseLike<number>;
    deleteMany(args: { where: TakeKey }): PromiseLike<BatchResult>;
    updateMany(args: { where: TakeKey; data: TakeKey }): PromiseLike<BatchResult>;
  };
};

export type MoveTakeDb = MoveTakeTx & {
  $transaction<T>(fn: (tx: MoveTakeTx) => Promise<T>): Promise<T>;
};

export type MoveTakeBlob = {
  find(pathname: string): Promise<{ url: string } | null>;
  copy(fromUrl: string, toPathname: string): Promise<void>;
  remove(urlOrPathname: string): Promise<void>;
};

export type MoveTakeRequest = {
  from: string;
  to: string;
  keepSource?: boolean;
  replace?: boolean;
};

export type MoveTakeCounts = {
  votesMoved: number;
  downloadsMoved: number;
  sightingsMoved: number;
  parkedMoved: number;
  deleted: { votes: number; downloads: number };
};

export type MoveTakeSuccess = MoveTakeCounts & {
  from: string;
  to: string;
};

export type MoveTakeResult =
  | { status: 200; body: MoveTakeSuccess }
  | { status: 400 | 404 | 409 | 500; body: { error: string; votes?: number } };

type TakeFile = {
  filename: string;
  take: CanonicalTake;
};

export function takePathname(filename: string): string {
  return `takes/${filename}`;
}

export async function moveTake(
  deps: { db: MoveTakeDb; blob: MoveTakeBlob },
  request: MoveTakeRequest
): Promise<MoveTakeResult> {
  const fromTake = parseCanonicalTake(request.from);
  const toTake = parseCanonicalTake(request.to);
  if (fromTake === null || toTake === null) {
    return { status: 400, body: { error: 'from and to must be canonical take filenames' } };
  }
  if (request.from === request.to) {
    return { status: 400, body: { error: 'from and to are the same file' } };
  }

  const from: TakeFile = { filename: request.from, take: fromTake };
  const to: TakeFile = { filename: request.to, take: toTake };
  const replace = request.replace === true;

  const source = await deps.blob.find(takePathname(from.filename));
  if (source === null) {
    return { status: 404, body: { error: 'source file not found' } };
  }
  if ((await deps.blob.find(takePathname(to.filename))) !== null) {
    return { status: 409, body: { error: 'destination file exists' } };
  }

  if (!isSameTake(from.take, to.take)) {
    const votes = await deps.db.vote.count({ where: takeKey(to.take) });
    if (votes > 0 && !replace) {
      return { status: 409, body: { error: 'destination has votes', votes } };
    }
  }

  await deps.blob.copy(source.url, takePathname(to.filename));

  let counts: MoveTakeCounts;
  try {
    counts = await moveTakeRows(deps.db, { from, to, replace });
  } catch (error) {
    console.error('Moving take rows failed', error);
    await deps.blob.remove(takePathname(to.filename));
    return { status: 500, body: { error: 'move failed' } };
  }

  if (request.keepSource !== true) {
    await deps.blob.remove(source.url);
  }

  return { status: 200, body: { from: from.filename, to: to.filename, ...counts } };
}

export async function moveTakeRows(
  db: MoveTakeDb,
  args: { from: TakeFile; to: TakeFile; replace: boolean }
): Promise<MoveTakeCounts> {
  return db.$transaction(async tx => {
    if (isSameTake(args.from.take, args.to.take)) {
      const sightings = await tx.takeSighting.updateMany({
        where: { filename: args.from.filename },
        data: { filename: args.to.filename },
      });
      return {
        votesMoved: 0,
        downloadsMoved: 0,
        sightingsMoved: sightings.count,
        parkedMoved: 0,
        deleted: { votes: 0, downloads: 0 },
      };
    }

    const source = takeKey(args.from.take);
    const destination = takeKey(args.to.take);
    const deleted = { votes: 0, downloads: 0 };
    if (args.replace) {
      deleted.votes = (await tx.vote.deleteMany({ where: destination })).count;
      deleted.downloads = (await tx.download.deleteMany({ where: destination })).count;
    }

    const votes = await tx.vote.updateMany({ where: source, data: destination });
    const downloads = await tx.download.updateMany({ where: source, data: destination });
    const sightings = await tx.takeSighting.updateMany({
      where: { filename: args.from.filename },
      data: { filename: args.to.filename },
    });
    const parkedMoved = await moveParkedRow(tx, source, destination);

    return {
      votesMoved: votes.count,
      downloadsMoved: downloads.count,
      sightingsMoved: sightings.count,
      parkedMoved,
      deleted,
    };
  });
}

async function moveParkedRow(tx: MoveTakeTx, source: TakeKey, destination: TakeKey) {
  if ((await tx.parkedTake.count({ where: source })) === 0) {
    return 0;
  }
  // ParkedTake is unique per take, so an already parked destination keeps its row.
  if ((await tx.parkedTake.count({ where: destination })) > 0) {
    return (await tx.parkedTake.deleteMany({ where: source })).count;
  }
  return (await tx.parkedTake.updateMany({ where: source, data: destination })).count;
}

function takeKey(take: CanonicalTake): TakeKey {
  return { versionSlug: take.setId, trackNumber: take.trackNumber, takeLabel: take.letter };
}

function isSameTake(left: CanonicalTake, right: CanonicalTake): boolean {
  return (
    left.setId === right.setId &&
    left.trackNumber === right.trackNumber &&
    left.letter === right.letter
  );
}
