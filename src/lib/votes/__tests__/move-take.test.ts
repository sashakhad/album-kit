import { beforeEach, describe, expect, it } from 'vitest';

import {
  moveTake,
  type MoveTakeBlob,
  type MoveTakeDb,
  type MoveTakeTx,
} from '@/lib/votes/move-take';

type TakeKey = { versionSlug: string; trackNumber: number; takeLabel: string };
type VoteRow = TakeKey & { visitorId: string; round: number; value: number };
type DownloadRow = TakeKey & { visitorId: string; round: number };
type SightingRow = { versionSlug: string; filename: string };
type Tables = {
  votes: VoteRow[];
  downloads: DownloadRow[];
  sightings: SightingRow[];
  parked: TakeKey[];
};

function matches(row: TakeKey, where: TakeKey): boolean {
  return (
    row.versionSlug === where.versionSlug &&
    row.trackNumber === where.trackNumber &&
    row.takeLabel === where.takeLabel
  );
}

function sameKey(left: TakeKey, right: TakeKey): boolean {
  return matches(left, right);
}

function keyTable<T extends TakeKey>(rows: T[], unique: (row: T) => string) {
  return {
    async count(args: { where: TakeKey }) {
      return rows.filter(row => matches(row, args.where)).length;
    },
    async deleteMany(args: { where: TakeKey }) {
      const before = rows.length;
      const kept = rows.filter(row => !matches(row, args.where));
      rows.splice(0, rows.length, ...kept);
      return { count: before - rows.length };
    },
    async updateMany(args: { where: TakeKey; data: TakeKey }) {
      let count = 0;
      for (const row of rows) {
        if (!matches(row, args.where)) {
          continue;
        }
        Object.assign(row, args.data);
        count += 1;
      }
      const seen = new Set<string>();
      for (const row of rows) {
        const key = unique(row);
        if (seen.has(key)) {
          throw new Error(`Unique constraint failed on ${key}`);
        }
        seen.add(key);
      }
      return { count };
    },
  };
}

function txFor(tables: Tables): MoveTakeTx {
  return {
    vote: keyTable(
      tables.votes,
      row => `${row.visitorId}|${row.trackNumber}|${row.versionSlug}|${row.takeLabel}|${row.round}`
    ),
    download: keyTable(
      tables.downloads,
      row => `${row.visitorId}|${row.trackNumber}|${row.versionSlug}|${row.takeLabel}`
    ),
    takeSighting: {
      async updateMany(args) {
        let count = 0;
        for (const row of tables.sightings) {
          if (row.filename === args.where.filename) {
            row.filename = args.data.filename;
            count += 1;
          }
        }
        return { count };
      },
    },
    parkedTake: keyTable(
      tables.parked,
      row => `${row.versionSlug}|${row.trackNumber}|${row.takeLabel}`
    ),
  };
}

function fakeDb(tables: Tables, options: { failTransaction?: boolean } = {}): MoveTakeDb {
  return {
    ...txFor(tables),
    async $transaction(fn) {
      const draft: Tables = structuredClone(tables);
      const result = await fn(txFor(draft));
      if (options.failTransaction === true) {
        throw new Error('database went away');
      }
      tables.votes.splice(0, tables.votes.length, ...draft.votes);
      tables.downloads.splice(0, tables.downloads.length, ...draft.downloads);
      tables.sightings.splice(0, tables.sightings.length, ...draft.sightings);
      tables.parked.splice(0, tables.parked.length, ...draft.parked);
      return result;
    },
  };
}

function fakeBlob(initial: string[]) {
  const files = new Set(initial.map(name => `takes/${name}`));
  const removed: string[] = [];
  const blob: MoveTakeBlob = {
    async find(pathname) {
      return files.has(pathname) ? { url: `https://store.test/${pathname}` } : null;
    },
    async copy(fromUrl, toPathname) {
      const fromPathname = fromUrl.replace('https://store.test/', '');
      if (!files.has(fromPathname)) {
        throw new Error('copy source missing');
      }
      files.add(toPathname);
    },
    async remove(urlOrPathname) {
      const pathname = urlOrPathname.replace('https://store.test/', '');
      removed.push(pathname);
      files.delete(pathname);
    },
  };
  return { blob, files, removed };
}

const FROM = 'v1-03-track-three-p2-taked.mp3';
const TO = 'v1-12-track-twelve-p1-takea.mp3';
const FROM_KEY: TakeKey = { versionSlug: 'v1', trackNumber: 3, takeLabel: 'D' };
const TO_KEY: TakeKey = { versionSlug: 'v1', trackNumber: 12, takeLabel: 'A' };

let tables: Tables;

beforeEach(() => {
  tables = {
    votes: [
      { ...FROM_KEY, visitorId: 'owner', round: 1, value: 2 },
      { ...FROM_KEY, visitorId: 'owner', round: 2, value: 3 },
      {
        versionSlug: 'v1',
        trackNumber: 3,
        takeLabel: 'A',
        visitorId: 'owner',
        round: 1,
        value: -1,
      },
    ],
    downloads: [{ ...FROM_KEY, visitorId: 'owner', round: 2 }],
    sightings: [{ versionSlug: 'v1', filename: FROM }],
    parked: [{ ...FROM_KEY }],
  };
});

describe('moveTake', () => {
  it('rejects names that are not canonical, and moving a file onto itself', async () => {
    const { blob } = fakeBlob([FROM]);
    const db = fakeDb(tables);

    expect(await moveTake({ db, blob }, { from: 'track-three.mp3', to: TO })).toEqual({
      status: 400,
      body: { error: 'from and to must be canonical take filenames' },
    });
    expect(
      (await moveTake({ db, blob }, { from: FROM, to: 'v1-12-Bad-p1-takea.mp3' })).status
    ).toBe(400);
    expect(await moveTake({ db, blob }, { from: FROM, to: FROM })).toEqual({
      status: 400,
      body: { error: 'from and to are the same file' },
    });
  });

  it('returns 404 when the source file is missing', async () => {
    const { blob } = fakeBlob([]);

    expect(await moveTake({ db: fakeDb(tables), blob }, { from: FROM, to: TO })).toEqual({
      status: 404,
      body: { error: 'source file not found' },
    });
  });

  it('returns 409 when the destination file exists', async () => {
    const { blob, removed } = fakeBlob([FROM, TO]);

    expect(await moveTake({ db: fakeDb(tables), blob }, { from: FROM, to: TO })).toEqual({
      status: 409,
      body: { error: 'destination file exists' },
    });
    expect(removed).toEqual([]);
  });

  it('returns 409 with the count when the destination already has votes', async () => {
    tables.votes.push({ ...TO_KEY, visitorId: 'owner', round: 1, value: -1 });
    tables.votes.push({ ...TO_KEY, visitorId: 'owner', round: 2, value: 1 });
    const { blob, files } = fakeBlob([FROM]);

    expect(await moveTake({ db: fakeDb(tables), blob }, { from: FROM, to: TO })).toEqual({
      status: 409,
      body: { error: 'destination has votes', votes: 2 },
    });
    expect(files.has(`takes/${TO}`)).toBe(false);
  });

  it('promotes a take: moves its rows, copies the file and deletes the source', async () => {
    const { blob, files, removed } = fakeBlob([FROM]);

    const result = await moveTake({ db: fakeDb(tables), blob }, { from: FROM, to: TO });

    expect(result).toEqual({
      status: 200,
      body: {
        from: FROM,
        to: TO,
        votesMoved: 2,
        downloadsMoved: 1,
        sightingsMoved: 1,
        parkedMoved: 1,
        deleted: { votes: 0, downloads: 0 },
      },
    });
    expect(files.has(`takes/${TO}`)).toBe(true);
    expect(files.has(`takes/${FROM}`)).toBe(false);
    expect(removed).toEqual([`takes/${FROM}`]);
    expect(tables.votes.filter(row => sameKey(row, TO_KEY)).map(row => row.value)).toEqual([2, 3]);
    expect(tables.votes.filter(row => sameKey(row, FROM_KEY))).toEqual([]);
    expect(tables.votes.some(row => row.takeLabel === 'A' && row.trackNumber === 3)).toBe(true);
    expect(tables.downloads).toEqual([{ ...TO_KEY, visitorId: 'owner', round: 2 }]);
    expect(tables.sightings).toEqual([{ versionSlug: 'v1', filename: TO }]);
    expect(tables.parked).toEqual([TO_KEY]);
  });

  it('keeps the source file when asked', async () => {
    const { blob, files, removed } = fakeBlob([FROM]);

    const result = await moveTake(
      { db: fakeDb(tables), blob },
      { from: FROM, to: TO, keepSource: true }
    );

    expect(result.status).toBe(200);
    expect(files.has(`takes/${FROM}`)).toBe(true);
    expect(files.has(`takes/${TO}`)).toBe(true);
    expect(removed).toEqual([]);
  });

  it('replaces the destination rows and counts what it deleted', async () => {
    tables.votes.push({ ...TO_KEY, visitorId: 'owner', round: 1, value: -1 });
    tables.downloads.push({ ...TO_KEY, visitorId: 'owner', round: 1 });
    const { blob } = fakeBlob([FROM]);

    const result = await moveTake(
      { db: fakeDb(tables), blob },
      { from: FROM, to: TO, replace: true }
    );

    expect(result).toEqual({
      status: 200,
      body: {
        from: FROM,
        to: TO,
        votesMoved: 2,
        downloadsMoved: 1,
        sightingsMoved: 1,
        parkedMoved: 1,
        deleted: { votes: 1, downloads: 1 },
      },
    });
    expect(tables.votes.filter(row => sameKey(row, TO_KEY)).map(row => row.value)).toEqual([2, 3]);
  });

  it('keeps an already parked destination parked', async () => {
    tables.parked.push({ ...TO_KEY });
    const { blob } = fakeBlob([FROM]);

    const result = await moveTake({ db: fakeDb(tables), blob }, { from: FROM, to: TO });

    expect(result.status).toBe(200);
    expect(tables.parked).toEqual([TO_KEY]);
  });

  it('deletes the copied file and leaves the rows alone when the transaction fails', async () => {
    const { blob, files, removed } = fakeBlob([FROM]);
    const before = structuredClone(tables);

    const result = await moveTake(
      { db: fakeDb(tables, { failTransaction: true }), blob },
      { from: FROM, to: TO }
    );

    expect(result).toEqual({ status: 500, body: { error: 'move failed' } });
    expect(removed).toEqual([`takes/${TO}`]);
    expect(files.has(`takes/${TO}`)).toBe(false);
    expect(files.has(`takes/${FROM}`)).toBe(true);
    expect(tables).toEqual(before);
  });

  it('renames a take in place when only the slug changes', async () => {
    const renamed = 'v1-03-track-three-new-name-p2-taked.mp3';
    const { blob, files, removed } = fakeBlob([FROM]);
    const before = structuredClone(tables);

    const result = await moveTake({ db: fakeDb(tables), blob }, { from: FROM, to: renamed });

    expect(result).toEqual({
      status: 200,
      body: {
        from: FROM,
        to: renamed,
        votesMoved: 0,
        downloadsMoved: 0,
        sightingsMoved: 1,
        parkedMoved: 0,
        deleted: { votes: 0, downloads: 0 },
      },
    });
    expect(tables.votes).toEqual(before.votes);
    expect(tables.downloads).toEqual(before.downloads);
    expect(tables.parked).toEqual(before.parked);
    expect(tables.sightings).toEqual([{ versionSlug: 'v1', filename: renamed }]);
    expect(files.has(`takes/${renamed}`)).toBe(true);
    expect(removed).toEqual([`takes/${FROM}`]);
  });

  it('ignores the replace flag on an in-place rename', async () => {
    const renamed = 'v1-03-track-three-new-name-p2-taked.mp3';
    const { blob } = fakeBlob([FROM]);

    const result = await moveTake(
      { db: fakeDb(tables), blob },
      { from: FROM, to: renamed, replace: true, keepSource: true }
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ votesMoved: 0, deleted: { votes: 0, downloads: 0 } });
    expect(tables.votes.filter(row => sameKey(row, FROM_KEY))).toHaveLength(2);
  });
});
