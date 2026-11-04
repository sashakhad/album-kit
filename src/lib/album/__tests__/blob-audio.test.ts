import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const headMock = vi.fn();

vi.mock('@vercel/blob', () => ({
  list: (options: unknown) => listMock(options),
  head: (pathname: string) => headMock(pathname),
}));

import {
  canUseBlob,
  findLetterConflict,
  letterConflictMessage,
  listBlobTakeFilenames,
  resolveBlobAudioUrl,
} from '../blob-audio';

describe('blob audio', () => {
  beforeEach(() => {
    listMock.mockReset();
    headMock.mockReset();
    vi.stubEnv('BLOB_STORE_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('pages through takes/ and keeps audio filenames', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test');
    listMock
      .mockResolvedValueOnce({
        blobs: [
          { pathname: 'takes/v1-01-track-one-p1-takea.mp3' },
          { pathname: 'takes/notes.txt' },
        ],
        hasMore: true,
        cursor: 'next-page',
      })
      .mockResolvedValueOnce({
        blobs: [{ pathname: 'takes/v1-01-track-one-p1-takeb.mp3' }],
        hasMore: false,
      });

    expect(await listBlobTakeFilenames()).toEqual([
      'v1-01-track-one-p1-takea.mp3',
      'v1-01-track-one-p1-takeb.mp3',
    ]);
    expect(listMock).toHaveBeenNthCalledWith(1, { prefix: 'takes/' });
    expect(listMock).toHaveBeenNthCalledWith(2, { prefix: 'takes/', cursor: 'next-page' });
  });

  it('skips Blob when no token is set', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

    expect(canUseBlob()).toBe(false);
    expect(await listBlobTakeFilenames()).toEqual([]);
    expect(await resolveBlobAudioUrl({ filename: 'v1-01-track-one-p1-takea.mp3' })).toBeNull();
    expect(listMock).not.toHaveBeenCalled();
    expect(headMock).not.toHaveBeenCalled();
  });

  it('resolves a take url from its takes/ pathname', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test');
    headMock.mockResolvedValueOnce({
      url: 'https://store.example/takes/v1-01-track-one-p1-takea.mp3',
    });

    expect(await resolveBlobAudioUrl({ filename: 'v1-01-track-one-p1-takea.mp3' })).toBe(
      'https://store.example/takes/v1-01-track-one-p1-takea.mp3'
    );
    expect(headMock).toHaveBeenCalledWith('takes/v1-01-track-one-p1-takea.mp3');
  });

  it('finds another file that already uses the letter', async () => {
    listMock
      .mockResolvedValueOnce({
        blobs: [{ pathname: 'takes/v1-07-track-seven-p1-takea.mp3' }],
        hasMore: true,
        cursor: 'page-2',
      })
      .mockResolvedValueOnce({
        blobs: [{ pathname: 'takes/v1-07-track-seven-p2-takee.mp3' }],
        hasMore: false,
      });

    const take = { setId: 'v1', trackNumber: 7, letter: 'E' };
    expect(await findLetterConflict(take, 'v1-07-track-seven-p3-takee.mp3')).toBe(
      'v1-07-track-seven-p2-takee.mp3'
    );
    expect(listMock).toHaveBeenNthCalledWith(1, { prefix: 'takes/v1-07-' });
    expect(listMock).toHaveBeenNthCalledWith(2, { prefix: 'takes/v1-07-', cursor: 'page-2' });
    expect(letterConflictMessage(take, 'v1-07-track-seven-p2-takee.mp3')).toBe(
      'Take E of track 07 in set v1 already exists as v1-07-track-seven-p2-takee.mp3. Letters are never reused, so give this file the next free letter.'
    );
  });

  it('ignores the same filename and other letters', async () => {
    listMock.mockResolvedValue({
      blobs: [
        { pathname: 'takes/v1-07-track-seven-p3-takee.mp3' },
        { pathname: 'takes/v1-07-track-seven-p1-takeaa.mp3' },
      ],
      hasMore: false,
    });

    const take = { setId: 'v1', trackNumber: 7, letter: 'E' };
    expect(await findLetterConflict(take, 'v1-07-track-seven-p3-takee.mp3')).toBeNull();
    expect(
      await findLetterConflict({ ...take, letter: 'A' }, 'v1-07-track-seven-p4-takea.mp3')
    ).toBeNull();
  });

  it('returns null when the take is missing', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test');
    headMock.mockRejectedValueOnce(new Error('not found'));

    expect(await resolveBlobAudioUrl({ filename: 'v1-01-track-one-p1-takea.mp3' })).toBeNull();
    expect(await resolveBlobAudioUrl({ filename: '../escape.mp3' })).toBeNull();
  });
});
