// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';

const run = promisify(execFile);
const script = path.join(process.cwd(), 'scripts/preview-album.mjs');
let root: string;
const take = (id: string, set = 'v1', letter = id) => ({
  filename: `${set}-01-five-p1-take${letter}.mp3`,
  clipId: id,
  streamUrl: `https://cdn1.suno.ai/${id}.mp4`,
});
const catalogFile = () => path.join(root, '.tmp/album-preview-streams.json');
function record(name: string, data: unknown) {
  const file = path.join(root, `${name}.json`);
  writeFileSync(file, JSON.stringify(data));
  return run(process.execPath, [script, '--record', file], { cwd: root, timeout: 8000 });
}
const label = (html: string, filename: string) => {
  const id = createHash('sha256').update(filename).digest('hex').slice(0, 24);
  return html.match(new RegExp(`data-id="${id}"[^>]+data-label="Take ([A-Z]+)"`))?.[1];
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'clip-delivery-'));
  mkdirSync(path.join(root, 'album'), { recursive: true });
  mkdirSync(path.join(root, '.tmp'));
  writeFileSync(
    path.join(root, 'album/album.json'),
    JSON.stringify({
      title: 'Songs',
      sets: [{ id: 'v1' }, { id: 'v2' }],
      tracks: [
        { number: 1, title: 'Five', slug: 'five' },
        { number: 2, title: 'Pending', slug: 'pending' },
      ],
    })
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('merges concurrent arrivals, duplicate deliveries, and an ordinary re-export without replacing an earlier clip', async () => {
  const b = take('b');
  const saved = { ...b, operationId: 'original-operation', promptId: 'recorded-prompt' };
  writeFileSync(catalogFile(), JSON.stringify([saved]));
  const first = JSON.parse((await record('retry-b', b)).stdout);
  expect(first.online).toBe(1);
  expect(label(readFileSync(first.link, 'utf8'), b.filename)).toBe('B');
  await Promise.all([
    run(process.execPath, [script, '--streams-only'], { cwd: root }),
    record('a1', take('a')),
    record('a2', take('a')),
    record('c', take('c')),
  ]);
  const rows = JSON.parse(readFileSync(catalogFile(), 'utf8'));
  expect(rows).toHaveLength(3);
  expect(rows).toContainEqual(saved);
  const html = readFileSync(first.link, 'utf8');
  for (const id of ['a', 'b', 'c']) {
    expect(label(html, take(id).filename)).toBe(id.toUpperCase());
    expect(html).toContain(take(id).streamUrl);
  }
  expect(html).not.toContain('original-operation');
  const anotherSet = take('different', 'v2', 'a');
  await record('more', anotherSet);
  const changed = readFileSync(first.link, 'utf8');
  expect(label(changed, anotherSet.filename)).toBe('D');
  expect(label(changed, b.filename)).toBe('B');
  expect(changed).not.toContain('v2-01-five');
});

it('refuses conflicting IDs, URLs, or provenance as one atomic batch', async () => {
  const a = { ...take('a'), promptId: 'one' };
  const { link } = JSON.parse((await record('original', a)).stdout);
  const before = readFileSync(catalogFile(), 'utf8');
  const page = readFileSync(link, 'utf8');
  for (const conflict of [
    { ...a, promptId: 'wrong' },
    { ...take('c'), filename: a.filename },
    { ...a, filename: take('c').filename },
    { ...take('c'), streamUrl: a.streamUrl },
    { ...take('c'), filename: 'v1-02-foreign-p1-takec.mp3' },
  ]) {
    await expect(record('broken', [take('b'), conflict])).rejects.toThrow();
    expect(readFileSync(catalogFile(), 'utf8')).toBe(before);
    expect(readFileSync(link, 'utf8')).toBe(page);
  }
});

it('delivers a chat receipt even when rebuilding an old local player would fail', async () => {
  const a = take('a');
  writeFileSync(path.join(root, 'album/public-streams.json'), JSON.stringify([a]));
  writeFileSync(path.join(root, 'album/audio'), 'Orphaned media directory');
  writeFileSync(path.join(root, '.tmp/album-preview-catalog.json'), '{"names":[]}');
  const { link, online } = JSON.parse((await record('new', take('b'))).stdout);
  expect(online).toBe(2);
  expect(readFileSync(link, 'utf8')).toContain(a.streamUrl);
  expect(readFileSync(path.join(root, '.tmp/album-preview-catalog.json'), 'utf8')).toBe(
    '{"names":[]}'
  );
});
