// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const stored = vi.hoisted(() => ({
  rows: [] as Array<{ filename: string; clipId: string; streamUrl: string | null }>,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    takeProvenance: { findMany: async () => stored.rows },
    blindOrder: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: { filenames: string[] } }) => create,
    },
  },
}));
vi.mock('@/lib/owner/auth', () => ({ albumKey: () => 'test-key' }));
import { stageHostedApp } from '../../../../scripts/hosted-app.mjs';
import { listSets } from '../load-album';
import { loadStreamCatalog } from '../stream-catalog';
import { blindVersion } from '@/lib/votes/blind';

const roots: string[] = [];
const filenameA = 'v1-01-overcast-p1-takea.mp3';
const filenameB = 'v1-01-overcast-p1-takeb.mp3';
function entry(filename: string, clipId: string) {
  return { filename, clipId, streamUrl: `https://cdn1.suno.ai/${clipId}.mp4` };
}

afterEach(async () => {
  stored.rows = [];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('stages exact public takes with the kit app and plays them in the signed-out blind view without importing local votes', async () => {
  const kit = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), 'local-to-hosted-'));
  roots.push(root);
  await mkdir(path.join(root, 'album/tracks'), { recursive: true });
  await mkdir(path.join(root, '.tmp'));
  await mkdir(path.join(root, 'src/app'), { recursive: true });
  await writeFile(path.join(root, 'src/app/page.tsx'), 'unrelated website');
  await writeFile(
    path.join(root, 'album/album.json'),
    JSON.stringify({
      title: 'Overcast',
      artist: 'Fixture',
      genre: 'house',
      rule: '',
      sets: [{ id: 'v1', name: 'First' }],
      tracks: [
        { number: 1, title: 'Overcast', slug: 'overcast' },
        { number: 2, title: 'Parked', slug: 'parked', parked: true },
      ],
    })
  );
  const a = entry(filenameA, 'alpha');
  const b = entry(filenameB, 'bravo');
  const votes = '{"votes":{"alpha":7}}';
  await writeFile(path.join(root, '.tmp/album-preview-ballot.json'), votes);
  await writeFile(path.join(root, 'album/tracks/01-overcast.md'), '## p1\nPrivate until reveal');
  await writeFile(
    path.join(root, '.tmp/album-preview-streams.json'),
    JSON.stringify([
      { ...a, workspace: 'private-note', score: 7 },
      b,
      a,
      {
        ...entry('v1-01-overcast-p1-takec.mp3', 'unused'),
        streamUrl: 'https://example.test/private',
      },
      { ...entry('v1-01-overcast-p1-taked.mp3', 'wrong-id'), streamUrl: a.streamUrl },
      entry('v1-02-parked-p1-takea.mp3', 'parked'),
      entry('v2-01-overcast-p1-takea.mp3', 'wrong-set'),
      entry('v1-01-stale-p1-takea.mp3', 'wrong-track'),
    ])
  );
  const stage = await stageHostedApp(root, kit);
  roots.push(stage);
  expect(await readFile(path.join(stage, 'src/app/page.tsx'), 'utf8')).toBe(
    await readFile(path.join(kit, 'src/app/page.tsx'), 'utf8')
  );
  expect(JSON.parse(await readFile(path.join(stage, 'album/public-streams.json'), 'utf8'))).toEqual(
    [a, b]
  );
  expect(await readFile(path.join(root, '.tmp/album-preview-ballot.json'), 'utf8')).toBe(votes);
  await expect(readFile(path.join(stage, '.tmp/album-preview-ballot.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });

  vi.spyOn(process, 'cwd').mockReturnValue(stage);
  vi.stubEnv('DATABASE_URL', 'postgresql://unused.test/fixture');
  vi.stubEnv('BLOB_STORE_ID', '');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
  const version = (await listSets())[0]!;
  const blind = await blindVersion(version, 1);
  const takes = blind.tracks[0]!.takes;
  expect(takes.map(take => take.audioUrl).sort()).toEqual([a.streamUrl, b.streamUrl]);
  expect(JSON.stringify(takes)).not.toContain(filenameA);
  expect(JSON.stringify(takes)).not.toContain('Private until reveal');

  const hosted = entry(filenameA, 'already-registered');
  stored.rows = [
    hosted,
    { filename: filenameB, clipId: 'different-registered-id', streamUrl: null },
  ];
  expect(await loadStreamCatalog()).toEqual([hosted]);
  stored.rows = [{ filename: filenameB, clipId: b.clipId, streamUrl: null }];
  expect(await loadStreamCatalog()).toEqual([a, b]);

  await writeFile(path.join(root, '.tmp/album-preview-streams.json'), JSON.stringify([a]));
  const updated = await stageHostedApp(root, kit);
  roots.push(updated);
  expect(
    JSON.parse(await readFile(path.join(updated, 'album/public-streams.json'), 'utf8'))
  ).toEqual([a]);
});
