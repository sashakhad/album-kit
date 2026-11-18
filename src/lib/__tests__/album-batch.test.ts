// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  completionChoices,
  completionQuestion,
  completionStatus,
  failOperation,
  noteClips,
  offerCard,
  openAlternateBatch,
  openSongBatch,
  readLedger,
  replyToBatch,
  waiveRemaining,
} from '../../../scripts/album-batch.mjs';

const album = {
  title: 'Porch',
  sets: [{ id: 'v1' }],
  tracks: [{ number: 1, title: 'Porch Light', slug: 'porch-light' }],
};
const ballot = {
  albums: {
    porch: { pass: 2, selected: 'v1-01-porch-light-p1-takea.mp3', votes: { take: 1 }, retired: [] },
  },
};
const stream = (clipId: string) => ({
  filename: `v1-01-porch-light-p1-${clipId}.mp3`,
  clipId,
  streamUrl: `https://cdn1.suno.ai/${clipId}.mp4`,
});

function readyBatch() {
  let ledger = readLedger({ estimates: { credits: 10 } });
  ledger = openSongBatch(ledger, album, {
    id: 'songs-1',
    trackNumbers: [1],
    operationIds: ['op-a', 'op-b'],
  });
  ledger = noteClips(ledger, { batchId: 'songs-1', operationId: 'op-a', clipIds: ['clipA'] });
  ledger = noteClips(ledger, { batchId: 'songs-1', operationId: 'op-b', clipIds: ['clipB'] });
  return ledger;
}

describe('completion card', () => {
  it('keeps a partial album on the local player and withholds hosting', () => {
    let ledger = readLedger({ estimates: { credits: 10 } });
    ledger = openSongBatch(ledger, album, {
      id: 'songs-1',
      trackNumbers: [1],
      operationIds: ['op-a', 'op-b'],
    });
    ledger = noteClips(ledger, { batchId: 'songs-1', operationId: 'op-a', clipIds: ['clipA'] });
    const status = completionStatus(ledger, [stream('clipA')]);
    expect(status).toMatchObject({
      phase: 'partial',
      hosting: false,
      card: null,
      pendingOperationIds: ['op-b'],
    });
    expect(ledger.estimates).toEqual({ credits: 10 });
  });

  it('offers the two choices once, then hides the card on resume', () => {
    const streams = [stream('clipA'), stream('clipB')];
    const opened = readyBatch();
    expect(completionStatus(opened, streams)).toMatchObject({
      phase: 'ready',
      hosting: false,
      card: {
        question: completionQuestion,
        choices: completionChoices,
        allowCustom: true,
      },
    });
    const offered = offerCard(opened, streams, 'songs-1');
    expect(completionStatus(offered, streams)).toMatchObject({
      phase: 'offered',
      card: null,
      alreadyOffered: true,
      hosting: false,
    });
    expect(offerCard(offered, streams, 'songs-1')).toBe(offered);
    const shared = replyToBatch(offered, album, streams, { batchId: 'songs-1', choice: 'share' });
    expect(completionStatus(shared.ledger, streams)).toMatchObject({
      phase: 'recorded',
      card: null,
      hosting: true,
      reply: { choice: 'share' },
    });
    expect(shared.album).toEqual(album);
  });

  it('keeps a failed take from closing the batch until the owner finishes with fewer', () => {
    const streams = [stream('clipA')];
    let ledger = openSongBatch(readLedger({}), album, {
      id: 'songs-1',
      trackNumbers: [1],
      operationIds: ['op-a', 'op-b'],
    });
    ledger = noteClips(ledger, { batchId: 'songs-1', operationId: 'op-a', clipIds: ['clipA'] });
    ledger = failOperation(ledger, { batchId: 'songs-1', operationId: 'op-b' });
    expect(completionStatus(ledger, streams).phase).toBe('partial');
    expect(() => offerCard(ledger, streams, 'songs-1')).toThrow(/pending/i);
    ledger = waiveRemaining(ledger, streams, 'songs-1');
    expect(completionStatus(ledger, streams).phase).toBe('ready');
  });

  it('appends new songs without a second copy and leaves the pass and scores untouched', () => {
    const streams = [stream('clipA'), stream('clipB')];
    const offered = offerCard(readyBatch(), streams, 'songs-1');
    const first = replyToBatch(offered, album, streams, {
      batchId: 'songs-1',
      choice: 'add',
      titles: ['Night Window'],
    });
    expect(first.appended).toEqual([{ number: 2, title: 'Night Window', slug: 'night-window' }]);
    expect(first.album.tracks[0]).toEqual(album.tracks[0]);
    expect(first.album.sets).toEqual(album.sets);
    const second = replyToBatch(first.ledger, first.album, streams, {
      batchId: 'songs-1',
      choice: 'add',
      titles: ['Night Window'],
    });
    expect(second.appended).toEqual([]);
    expect(second.album.tracks).toHaveLength(2);
    const repaired = replyToBatch(first.ledger, album, streams, {
      batchId: 'songs-1',
      choice: 'add',
      titles: ['Night Window'],
    });
    expect(repaired.appended).toEqual(first.appended);
    expect(repaired.album.tracks.map((track: { slug: string }) => track.slug)).toEqual([
      'porch-light',
      'night-window',
    ]);
    expect(() =>
      replyToBatch(first.ledger, first.album, streams, {
        batchId: 'songs-1',
        choice: 'share',
      })
    ).toThrow(/already has a reply/i);
    expect(ballot.albums.porch).toEqual({
      pass: 2,
      selected: 'v1-01-porch-light-p1-takea.mp3',
      votes: { take: 1 },
      retired: [],
    });
  });

  it('treats /more as alternate takes and rejects a bare yes', () => {
    const streams = [stream('clipM')];
    const more = openAlternateBatch(readLedger({}), album, {
      id: 'more-1',
      trackNumber: 1,
      operationIds: ['op-m'],
    });
    const noted = noteClips(more, { batchId: 'more-1', operationId: 'op-m', clipIds: ['clipM'] });
    expect(completionStatus(noted, streams)).toMatchObject({
      phase: 'empty',
      card: null,
      hosting: false,
    });
    expect(() => offerCard(noted, streams, 'more-1')).toThrow(/alternate takes/i);
    const songs = offerCard(readyBatch(), [stream('clipA'), stream('clipB')], 'songs-1');
    expect(() =>
      replyToBatch(songs, album, [stream('clipA'), stream('clipB')], {
        batchId: 'songs-1',
        choice: 'custom',
        text: 'yes',
      })
    ).toThrow(/bare yes/i);
    const custom = replyToBatch(songs, album, [stream('clipA'), stream('clipB')], {
      batchId: 'songs-1',
      choice: 'custom',
      text: 'just listening',
    });
    expect(custom.album).toEqual(album);
    expect(completionStatus(custom.ledger, [stream('clipA'), stream('clipB')])).toMatchObject({
      phase: 'recorded',
      hosting: false,
      reply: { choice: 'custom', text: 'just listening' },
    });
  });
});

describe('album batch command', () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('prints a partial batch from a folder and does not touch the ballot', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'album-batch-'));
    roots.push(root);
    await mkdir(path.join(root, 'album'), { recursive: true });
    await mkdir(path.join(root, '.tmp'), { recursive: true });
    await writeFile(path.join(root, 'album', 'album.json'), JSON.stringify(album));
    const ballotFile = path.join(root, '.tmp', 'album-preview-ballot.json');
    const ballotText = `${JSON.stringify(ballot, null, 2)}\n`;
    await writeFile(ballotFile, ballotText);
    await writeFile(
      path.join(root, '.tmp', 'album-preview-streams.json'),
      JSON.stringify([stream('clipA')])
    );
    const script = fileURLToPath(new URL('../../../scripts/album-batch.mjs', import.meta.url));
    const open = spawnSync(
      process.execPath,
      [
        script,
        'open',
        '--id',
        'songs-1',
        '--track',
        '1',
        '--operation',
        'op-a',
        '--operation',
        'op-b',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(open.status).toBe(0);
    const clips = spawnSync(
      process.execPath,
      [script, 'clips', '--id', 'songs-1', '--operation', 'op-a', '--clip', 'clipA'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(clips.status).toBe(0);
    const status = JSON.parse(clips.stdout) as { phase: string; hosting: boolean; card: null };
    expect(status).toMatchObject({ phase: 'partial', hosting: false, card: null });
    expect(clips.stdout).not.toMatch(/vercel|share:album/i);
    expect(await readFile(ballotFile, 'utf8')).toBe(ballotText);
    expect(
      JSON.parse(await readFile(path.join(root, 'album', 'album.json'), 'utf8')).tracks
    ).toEqual(album.tracks);
  });
});
