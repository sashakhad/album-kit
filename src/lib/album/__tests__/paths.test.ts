import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  blobPathnameFor,
  isAlbumSlug,
  isSafeAudioFilename,
  localAudioDir,
  resolveAudioCandidates,
  resolveAudioFile,
} from '../paths';

describe('isAlbumSlug', () => {
  it('allows lowercase folder names', () => {
    expect(isAlbumSlug('v1')).toBe(true);
    expect(isAlbumSlug('set-one')).toBe(true);
    expect(isAlbumSlug('../secret')).toBe(false);
    expect(isAlbumSlug('SET')).toBe(false);
  });
});

describe('resolveAudioFile', () => {
  it('stays inside the album audio folder', () => {
    const albumRoot = '/tmp/album';
    const resolved = resolveAudioFile({
      albumRoot,
      filename: 'v1-01-track-one-p1-takea.mp3',
    });

    expect(resolved).toBe(path.resolve(albumRoot, 'audio', 'v1-01-track-one-p1-takea.mp3'));
    expect(resolveAudioFile({ albumRoot, filename: '../album.json' })).toBeNull();
    expect(resolveAudioFile({ albumRoot, filename: '../secret.mp3' })).toBeNull();
  });

  it('rejects non-audio names', () => {
    expect(isSafeAudioFilename('notes.md')).toBe(false);
    expect(isSafeAudioFilename('v1-01-track-one-p1-takea.mp3')).toBe(true);
    expect(isSafeAudioFilename('audio/v1-01-track-one-p1-takea.mp3')).toBe(false);
  });

  it('builds a blob pathname for a safe take file', () => {
    expect(blobPathnameFor('v1-01-track-one-p1-takea.mp3')).toBe(
      'takes/v1-01-track-one-p1-takea.mp3'
    );
    expect(blobPathnameFor('../secret.mp3')).toBeNull();
    expect(blobPathnameFor('notes.md')).toBeNull();
  });

  it('has one local candidate in album/audio', () => {
    const albumRoot = '/tmp/album';
    expect(localAudioDir(albumRoot)).toBe(path.join(albumRoot, 'audio'));
    expect(resolveAudioCandidates({ albumRoot, filename: 'v1-01-track-one-p1-takea.mp3' })).toEqual(
      [path.resolve(albumRoot, 'audio', 'v1-01-track-one-p1-takea.mp3')]
    );
  });
});
