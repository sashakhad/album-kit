'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';

import {
  audioUrlForTrack,
  collectPlayableIndexes,
  findTakeOnTrack,
  isAbortError,
  isOnAlbumShortlist,
  isParkedTake,
  nextPlayableIndex,
  nextVariation,
  previousPlayableIndex,
  previousVariation,
  takeForTrack,
  trackKey,
} from '@/lib/album/playback';
import { indexForTrackNumber, listenHref, voteHref } from '@/lib/album/play-path';
import { slugifyTrackTitle } from '@/lib/album/slug';
import type { AlbumTake, AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { DownloadButton } from '@/components/album/DownloadButton';
import { PassControls } from '@/components/album/PassControls';
import { VoteButton } from '@/components/album/VoteButton';
import { choiceForTake, countForTake, takeCountsForTrack } from '@/lib/votes/tally';
import { EMPTY_VOTE_SNAPSHOT, type VoteSnapshot } from '@/lib/votes/types';
import { formatDuration, formatNumberExact, formatSignedScore } from '@/lib/formatters';
import { cn } from '@/lib/utils';

type PlaybackMode = 'album' | 'variations';
export type PlayerSurface = 'vote' | 'listen';

export function AlbumPlayer({
  version,
  votes = EMPTY_VOTE_SNAPSHOT,
  initialTrackNumber,
  initialTrackTitle,
  initialTakeLabel,
  surface,
  awaitingReveal = false,
  voter = 'owner',
}: {
  version: AlbumVersion;
  votes?: VoteSnapshot;
  initialTrackNumber?: number;
  initialTrackTitle?: string;
  initialTakeLabel?: string;
  surface?: PlayerSurface;
  awaitingReveal?: boolean;
  voter?: 'owner' | 'listener';
}) {
  const router = useRouter();
  const revealRefreshRequested = useRef(false);
  const playerSurface: PlayerSurface = surface ?? 'vote';
  const audioRef = useRef<HTMLAudioElement>(null);
  const playableIndexes = useMemo(() => collectPlayableIndexes(version.tracks), [version.tracks]);
  const startIndex = useMemo(() => {
    if (initialTrackTitle !== undefined) {
      const byTitle = version.tracks.findIndex(
        track => slugifyTrackTitle(track.title) === slugifyTrackTitle(initialTrackTitle)
      );
      const titled = byTitle < 0 ? null : version.tracks[byTitle];
      if (titled !== undefined && titled !== null && titled.audioUrl !== null) {
        return byTitle;
      }
    }
    if (initialTrackNumber !== undefined) {
      const index = indexForTrackNumber(version.tracks, initialTrackNumber);
      if (index !== null) {
        return index;
      }
    }
    return playableIndexes[0] ?? 0;
  }, [initialTrackNumber, initialTrackTitle, playableIndexes, version.tracks]);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('album');
  const [preferredTakeLabel] = useState(initialTakeLabel ?? 'A');
  const [selectedTakeByTrack, setSelectedTakeByTrack] = useState<Record<string, string>>(() => {
    if (initialTakeLabel === undefined) {
      return {};
    }
    const track = version.tracks[startIndex];
    if (track === undefined || findTakeOnTrack(track, initialTakeLabel) === null) {
      return {};
    }
    return { [trackKey(track)]: initialTakeLabel };
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [voteSnapshot, setVoteSnapshot] = useState(votes);

  useEffect(() => {
    if (!awaitingReveal || revealRefreshRequested.current) return;
    const takes = version.tracks.flatMap(track =>
      track.takes.map(take => ({
        track: track.number,
        version: take.versionSlug,
        label: take.voteLabel,
      }))
    );
    if (
      takes.length === 0 ||
      !takes.every(take =>
        (voteSnapshot.mine[take.track] ?? []).some(
          vote => vote.versionSlug === take.version && vote.takeLabel === take.label
        )
      )
    )
      return;
    revealRefreshRequested.current = true;
    router.refresh();
  }, [awaitingReveal, router, version.tracks, voteSnapshot]);

  const currentIndexRef = useRef(currentIndex);
  const selectedTakeByTrackRef = useRef(selectedTakeByTrack);
  const preferredTakeLabelRef = useRef(preferredTakeLabel);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    selectedTakeByTrackRef.current = selectedTakeByTrack;
    preferredTakeLabelRef.current = preferredTakeLabel;
  }, [currentIndex, preferredTakeLabel, selectedTakeByTrack]);

  const currentTrack = version.tracks[currentIndex] ?? version.tracks[0] ?? null;
  const currentTake =
    currentTrack === null
      ? null
      : takeForTrack(currentTrack, selectedTakeByTrack, preferredTakeLabel);
  const currentAudioUrl =
    currentTrack === null
      ? null
      : audioUrlForTrack(currentTrack, selectedTakeByTrack, preferredTakeLabel);
  const hasAudio = playableIndexes.length > 0;
  const hasVariations = version.tracks.some(track => track.takes.length > 1);

  useEffect(() => {
    if (currentTrack === null || currentTake === null) {
      return;
    }
    const nextPath =
      playerSurface === 'vote'
        ? voteHref({
            title: currentTrack.title,
            versionSlug: currentTake.versionSlug,
            takeLabel: currentTake.voteLabel,
          })
        : listenHref({ title: currentTrack.title });
    document.title =
      playerSurface === 'vote'
        ? `${currentTrack.title} · ${currentTake.label} · ${version.title}`
        : `${currentTrack.title} · ${version.title}`;
    if (window.location.pathname === nextPath) {
      return;
    }
    const section = playerSurface === 'vote' ? voteHref() : listenHref();
    const onSection =
      window.location.pathname === section || window.location.pathname.startsWith(`${section}/`);
    if (!onSection) {
      return;
    }
    window.history.replaceState(window.history.state, '', nextPath);
  }, [currentTake, currentTrack, playerSurface, version.title]);

  const playSource = useCallback((url: string) => {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }

    const nextSrc = new URL(url, window.location.href).href;
    if (audio.src !== nextSrc) {
      audio.src = url;
    }

    void audio.play().catch((error: unknown) => {
      if (isAbortError(error) || audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        return;
      }
      setIsPlaying(false);
    });
  }, []);

  const playIndex = useCallback(
    (index: number, takeLabel?: string) => {
      const track = version.tracks[index];
      if (track === undefined) {
        return;
      }
      if (takeLabel === undefined && track.audioUrl === null) {
        return;
      }

      let nextSelected = selectedTakeByTrackRef.current;
      if (takeLabel !== undefined) {
        nextSelected = {
          ...nextSelected,
          [trackKey(track)]: takeLabel,
        };
        selectedTakeByTrackRef.current = nextSelected;
        setSelectedTakeByTrack(nextSelected);
      }

      const url = audioUrlForTrack(track, nextSelected, preferredTakeLabelRef.current);
      if (url === null) {
        return;
      }

      setCurrentIndex(index);
      setCurrentTime(0);
      setIsPlaying(true);
      playSource(url);
    },
    [playSource, version.tracks]
  );

  const playNextTrack = useCallback(
    (wrap: boolean) => {
      const next = nextPlayableIndex(playableIndexes, currentIndexRef.current, wrap);
      if (next === null) {
        setIsPlaying(false);
        return;
      }
      playIndex(next);
    },
    [playIndex, playableIndexes]
  );

  const playPreviousTrack = useCallback(() => {
    const previous = previousPlayableIndex(playableIndexes, currentIndexRef.current);
    if (previous === null) {
      return;
    }
    playIndex(previous);
  }, [playIndex, playableIndexes]);

  const playNextVariation = useCallback(
    (wrap: boolean) => {
      const track = version.tracks[currentIndexRef.current];
      if (track === undefined) {
        return;
      }

      const selected = takeForTrack(
        track,
        selectedTakeByTrackRef.current,
        preferredTakeLabelRef.current
      );
      const next = nextVariation(track.takes, selected, wrap);
      if (next === null) {
        setIsPlaying(false);
        return;
      }
      playIndex(currentIndexRef.current, next.label);
    },
    [playIndex, version.tracks]
  );

  const playPreviousVariation = useCallback(() => {
    const track = version.tracks[currentIndexRef.current];
    if (track === undefined) {
      return;
    }

    const selected = takeForTrack(
      track,
      selectedTakeByTrackRef.current,
      preferredTakeLabelRef.current
    );
    const previous = previousVariation(track.takes, selected);
    if (previous === null) {
      return;
    }
    playIndex(currentIndexRef.current, previous.label);
  }, [playIndex, version.tracks]);

  const playNext = useCallback(
    (wrap: boolean) => {
      if (playbackMode === 'variations') {
        playNextVariation(wrap);
        return;
      }
      playNextTrack(wrap);
    },
    [playNextTrack, playNextVariation, playbackMode]
  );

  const playPrevious = useCallback(() => {
    if (playbackMode === 'variations') {
      playPreviousVariation();
      return;
    }
    playPreviousTrack();
  }, [playPreviousTrack, playPreviousVariation, playbackMode]);

  const togglePlay = useCallback(() => {
    if (!hasAudio) {
      return;
    }
    if (currentAudioUrl === null) {
      const first = playableIndexes[0];
      if (first !== undefined) {
        playIndex(first);
      }
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
      audioRef.current?.pause();
      return;
    }
    setIsPlaying(true);
    playSource(currentAudioUrl);
  }, [currentAudioUrl, hasAudio, isPlaying, playIndex, playSource, playableIndexes]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null || currentAudioUrl === null) {
      return;
    }

    if (!isPlaying) {
      audio.pause();
      return;
    }

    const url = currentAudioUrl;

    function playWhenReady() {
      playSource(url);
    }

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      playWhenReady();
    }
    audio.addEventListener('canplay', playWhenReady);
    return () => {
      audio.removeEventListener('canplay', playWhenReady);
    };
  }, [currentAudioUrl, isPlaying, playSource]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        playNext(true);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        playPrevious();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [playNext, playPrevious, togglePlay]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || currentTrack === null) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: version.author.length > 0 ? version.author : version.title,
      album: version.title,
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext(true));

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [currentTrack, isPlaying, playNext, playPrevious, version.author, version.title]);

  function handleSeek(seconds: number) {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }

  return (
    <section className='grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]'>
      <div className='space-y-6'>
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>{version.title}</p>
          <p className='text-primary/80 text-xs tracking-[0.2em] uppercase'>Now playing</p>
          <h1 className='font-display text-4xl leading-tight tracking-tight'>
            {currentTrack?.title ?? version.title}
          </h1>
          {currentTrack !== null ? (
            <p className='text-muted-foreground font-mono text-sm'>
              {padTrackNumber(currentTrack.number)}
              {currentTrack.kind === 'bonus' ? ' · bonus' : ''}
              {isParkedTake(currentTrack, currentTake) ? ' · possible rename' : ''}
              {playerSurface !== 'listen' &&
              currentTake !== null &&
              (currentTrack.takes.length > 0 || isParkedTake(currentTrack, currentTake))
                ? currentTake.label === currentTake.voteLabel
                  ? ` · take ${currentTake.label}`
                  : ` · ${currentTake.label}`
                : ''}
            </p>
          ) : null}
        </div>

        {hasVariations && playerSurface !== 'listen' ? (
          <PlaybackModeControl mode={playbackMode} onChange={setPlaybackMode} />
        ) : null}

        {playerSurface === 'vote' ? (
          <div className='space-y-3'>
            {voter === 'owner' ? (
              <PassControls currentRound={voteSnapshot.currentRound} />
            ) : (
              <p className='text-primary/80 text-xs tracking-[0.2em] uppercase'>
                Round {voteSnapshot.currentRound}
              </p>
            )}
            {currentTrack !== null ? <ParkedCount track={currentTrack} /> : null}
          </div>
        ) : null}

        {playbackMode === 'variations' && currentTrack !== null ? (
          currentTrack.takes.length > 1 ? (
            <div className='space-y-2'>
              <TakeSwitcher
                labels={currentTrack.takes.map(take => take.label)}
                selectedLabel={currentTake?.label ?? null}
                legend='Start at'
                onSelect={label => playIndex(currentIndex, label)}
              />
              <p className='text-muted-foreground text-xs'>
                Plays every variation of this song in order. Next stays on this song.
              </p>
            </div>
          ) : (
            <p className='text-muted-foreground text-xs'>This song has one available variation.</p>
          )
        ) : null}

        <div className='space-y-4'>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            disabled={!hasAudio}
            onSeek={handleSeek}
          />
          <div className='text-muted-foreground flex justify-between font-mono text-xs'>
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex items-center gap-2'>
              <IconButton
                label={playbackMode === 'variations' ? 'Previous variation' : 'Previous track'}
                onClick={playPrevious}
                disabled={!hasAudio}
              >
                <SkipBack className='size-5 fill-current' />
              </IconButton>
              <button
                type='button'
                onClick={togglePlay}
                disabled={!hasAudio}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className='bg-primary text-primary-foreground hover:bg-primary/90 flex size-16 items-center justify-center rounded-full disabled:opacity-40'
              >
                {isPlaying ? (
                  <Pause className='size-7 fill-current' />
                ) : (
                  <Play className='size-7 fill-current pl-0.5' />
                )}
              </button>
              <IconButton
                label={playbackMode === 'variations' ? 'Next variation' : 'Next track'}
                onClick={() => playNext(true)}
                disabled={!hasAudio}
              >
                <SkipForward className='size-5 fill-current' />
              </IconButton>
            </div>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Volume2 className='size-4' />
              <span className='sr-only'>Volume</span>
              <input
                type='range'
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={event => setVolume(Number(event.target.value))}
                className='accent-primary w-24'
              />
            </label>
          </div>
        </div>

        {!hasAudio ? <EmptyAudioHint surface={playerSurface} voter={voter} /> : null}
      </div>

      <div className='space-y-6 lg:row-span-2'>
        <ol className='bg-card/60 divide-y divide-white/6 rounded-2xl border border-white/8'>
          {version.tracks.map((track, index) => {
            if (!isOnAlbumShortlist(track)) {
              return null;
            }
            const selectedTake = takeForTrack(track, selectedTakeByTrack, preferredTakeLabel);
            const currentOnShortlist = index === currentIndex && !isParkedTake(track, selectedTake);
            return (
              <li key={`${track.kind}-${track.number}-${track.title}`}>
                <TrackRow
                  track={track}
                  isCurrent={currentOnShortlist}
                  isPlaying={isPlaying && currentOnShortlist}
                  selectedTake={isParkedTake(track, selectedTake) ? null : selectedTake}
                  takeCounts={takeCountsForTrack(voteSnapshot, track)}
                  votes={voteSnapshot}
                  versionSlug={version.slug}
                  showVotes={playerSurface !== 'listen'}
                  showTakes={playerSurface !== 'listen'}
                  voter={voter}
                  onVoteSnapshot={setVoteSnapshot}
                  onSelect={() => {
                    const selected = takeForTrack(track, selectedTakeByTrack, preferredTakeLabel);
                    if (isParkedTake(track, selected)) {
                      playIndex(index, track.takes[0]?.label);
                      return;
                    }
                    playIndex(index);
                  }}
                  onSelectTake={label => playIndex(index, label)}
                />
              </li>
            );
          })}
        </ol>
        {playerSurface === 'vote' ? (
          <PossibleRenames
            tracks={version.tracks}
            currentTrack={currentTrack}
            currentTake={currentTake}
            isPlaying={isPlaying}
            votes={voteSnapshot}
            voter={voter}
            onVoteSnapshot={setVoteSnapshot}
            onPlay={(index, label) => playIndex(index, label)}
          />
        ) : null}
      </div>

      {currentTrack?.prompt !== null && currentTrack?.prompt !== undefined ? (
        <details className='bg-card/70 rounded-2xl border border-white/8'>
          <summary className='text-primary/80 cursor-pointer px-5 py-3 text-xs tracking-[0.2em] uppercase'>
            Prompt
          </summary>
          <p className='text-foreground/85 px-5 pb-5 text-sm leading-relaxed whitespace-pre-line'>
            {currentTrack.prompt.replace(/\*\*/g, '')}
          </p>
        </details>
      ) : null}

      {playerSurface === 'vote' && currentTake?.details !== undefined ? (
        <details className='bg-card/70 rounded-2xl border border-white/8'>
          <summary className='text-primary/80 cursor-pointer px-5 py-3 text-xs tracking-[0.2em] uppercase'>
            Take details
          </summary>
          <div className='space-y-2 px-5 pb-5 text-sm'>
            <p>{currentTake.details.writer}</p>
            <p>{currentTake.details.sunoModel}</p>
            <p className='whitespace-pre-line'>{currentTake.details.style}</p>
          </div>
        </details>
      ) : null}

      {currentAudioUrl !== null ? (
        <audio
          ref={audioRef}
          src={currentAudioUrl}
          preload='auto'
          playsInline
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
          onDurationChange={event => setDuration(event.currentTarget.duration)}
          onEnded={() => playNext(false)}
        />
      ) : null}
    </section>
  );
}

function PlaybackModeControl({
  mode,
  onChange,
}: {
  mode: PlaybackMode;
  onChange: (mode: PlaybackMode) => void;
}) {
  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground text-xs tracking-[0.2em] uppercase'>Playback mode</p>
      <div className='inline-flex rounded-full border border-white/15 p-1'>
        <button
          type='button'
          onClick={() => onChange('album')}
          aria-pressed={mode === 'album'}
          className={cn(
            'rounded-full px-3 py-1 text-xs',
            mode === 'album'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Album
        </button>
        <button
          type='button'
          onClick={() => onChange('variations')}
          aria-pressed={mode === 'variations'}
          className={cn(
            'rounded-full px-3 py-1 text-xs',
            mode === 'variations'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Variations
        </button>
      </div>
    </div>
  );
}

function PossibleRenames({
  tracks,
  currentTrack,
  currentTake,
  isPlaying,
  votes,
  voter,
  onVoteSnapshot,
  onPlay,
}: {
  tracks: AlbumTrack[];
  currentTrack: AlbumTrack | null;
  currentTake: AlbumTake | null;
  isPlaying: boolean;
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  onVoteSnapshot: (snapshot: VoteSnapshot) => void;
  onPlay: (index: number, label: string) => void;
}) {
  const entries: { track: AlbumTrack; index: number; take: AlbumTake }[] = [];
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (track === undefined) {
      continue;
    }
    for (const take of track.parkedTakes ?? []) {
      entries.push({ track, index, take });
    }
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className='space-y-3'>
      <div className='space-y-1 px-1'>
        <p className='text-primary/80 text-xs tracking-[0.2em] uppercase'>Possible renames</p>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          Off the shortlist. Play them here if one needs its own title.
        </p>
      </div>
      <ol className='bg-card/60 divide-y divide-white/6 rounded-2xl border border-white/8'>
        {entries.map(entry => {
          const isCurrent =
            currentTrack !== null &&
            currentTake !== null &&
            entry.track.number === currentTrack.number &&
            entry.take.label === currentTake.label;
          return (
            <li key={`${entry.track.number}-${entry.take.versionSlug}-${entry.take.voteLabel}`}>
              <ParkedTakeRow
                track={entry.track}
                take={entry.take}
                isCurrent={isCurrent}
                isPlaying={isPlaying && isCurrent}
                votes={votes}
                voter={voter}
                onVoteSnapshot={onVoteSnapshot}
                onPlay={() => onPlay(entry.index, entry.take.label)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ParkedTakeRow({
  track,
  take,
  isCurrent,
  isPlaying,
  votes,
  voter,
  onVoteSnapshot,
  onPlay,
}: {
  track: AlbumTrack;
  take: AlbumTake;
  isCurrent: boolean;
  isPlaying: boolean;
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  onVoteSnapshot: (snapshot: VoteSnapshot) => void;
  onPlay: () => void;
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4',
        isCurrent && 'bg-white/6'
      )}
    >
      <button
        type='button'
        onClick={onPlay}
        aria-current={isCurrent ? true : undefined}
        className='hover:text-foreground flex min-w-0 flex-1 items-center gap-3 text-left'
      >
        <span className='text-muted-foreground flex w-8 shrink-0 items-center font-mono text-xs'>
          {isPlaying ? (
            <Play className='fill-primary text-primary size-3' />
          ) : (
            padTrackNumber(track.number)
          )}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm'>{track.title}</span>
          <span className='text-muted-foreground font-mono text-xs'>{take.label}</span>
        </span>
      </button>
      <div className='flex shrink-0 items-center gap-1'>
        {voter === 'owner' ? (
          <DownloadButton
            key={`save-parked-${track.number}-${take.versionSlug}-${take.voteLabel}`}
            trackNumber={track.number}
            versionSlug={take.versionSlug}
            takeLabel={take.voteLabel}
            trackTitle={track.title}
            audioUrl={take.audioUrl}
            votes={votes}
            onSnapshot={onVoteSnapshot}
          />
        ) : null}
        <ListenerScore
          votes={votes}
          voter={voter}
          trackNumber={track.number}
          versionSlug={take.versionSlug}
          takeLabel={take.voteLabel}
        />
        <VoteButton
          key={`vote-parked-${track.number}-${take.versionSlug}-${take.voteLabel}`}
          trackNumber={track.number}
          versionSlug={take.versionSlug}
          takeLabel={take.voteLabel}
          trackTitle={track.title}
          initialCount={countForTake(votes, track.number, take.versionSlug, take.voteLabel)}
          initialValue={choiceForTake(votes, track.number, take.versionSlug, take.voteLabel)}
          onSnapshot={onVoteSnapshot}
        />
      </div>
    </div>
  );
}

function ListenerScore({
  votes,
  voter,
  trackNumber,
  versionSlug,
  takeLabel,
}: {
  votes: VoteSnapshot;
  voter: 'owner' | 'listener';
  trackNumber: number;
  versionSlug: string;
  takeLabel: string;
}) {
  if (voter !== 'owner' || votes.listenerTallies === undefined) {
    return null;
  }
  const count = votes.listenerTallies[trackNumber]?.[versionSlug]?.[takeLabel] ?? 0;
  if (count === 0) {
    return null;
  }
  const label = formatSignedScore(count);
  return (
    <span
      className='text-muted-foreground w-14 text-right font-mono text-[10px] leading-tight'
      aria-label={`Listener score ${label}, separate from your score`}
    >
      listeners
      <br />
      {label}
    </span>
  );
}

function ParkedCount({ track }: { track: AlbumTrack }) {
  const parked = track.parkedTakes ?? [];
  if (parked.length === 0) {
    return null;
  }

  return (
    <p className='text-muted-foreground text-xs leading-relaxed'>
      {parked.length === 1
        ? '1 take parked under Possible renames.'
        : `${formatNumberExact(parked.length)} takes parked under Possible renames.`}
    </p>
  );
}

function TrackRow({
  track,
  isCurrent,
  isPlaying,
  selectedTake,
  takeCounts,
  votes,
  versionSlug,
  showVotes,
  showTakes,
  voter,
  onSelect,
  onSelectTake,
  onVoteSnapshot,
}: {
  track: AlbumTrack;
  isCurrent: boolean;
  isPlaying: boolean;
  selectedTake: AlbumTake | null;
  takeCounts: Record<string, number>;
  votes: VoteSnapshot;
  versionSlug: string;
  showVotes: boolean;
  showTakes: boolean;
  voter: 'owner' | 'listener';
  onSelect: () => void;
  onSelectTake: (label: string) => void;
  onVoteSnapshot: (snapshot: VoteSnapshot) => void;
}) {
  const ready = track.audioUrl !== null;
  const takeLabel = selectedTake?.voteLabel ?? track.takes[0]?.voteLabel ?? 'A';
  const voteVersionSlug = selectedTake?.versionSlug ?? versionSlug;
  const canVote = showVotes && ready && track.kind === 'album' && selectedTake !== null;
  const showTakePills = showTakes && track.takes.length > 0;

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4',
        ready ? '' : 'opacity-40',
        isCurrent && 'bg-white/6'
      )}
    >
      <div className='min-w-0 flex-1'>
        <button
          type='button'
          onClick={onSelect}
          disabled={!ready}
          aria-current={isCurrent ? true : undefined}
          className={cn(
            'flex w-full items-center gap-3 text-left',
            ready ? 'hover:text-foreground' : 'cursor-not-allowed'
          )}
        >
          <span className='text-muted-foreground flex w-8 shrink-0 items-center font-mono text-xs'>
            {isPlaying ? (
              <Play className='fill-primary text-primary size-3' />
            ) : (
              padTrackNumber(track.number)
            )}
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm'>{track.title}</span>
            {track.kind === 'bonus' ? (
              <span className='text-muted-foreground text-xs'>Bonus</span>
            ) : null}
          </span>
        </button>
        {showTakePills ? (
          <div className='mt-1.5 pl-11 sm:hidden'>
            <TakeSwitcher
              labels={track.takes.map(take => take.label)}
              selectedLabel={selectedTake?.label ?? null}
              counts={takeCounts}
              onSelect={onSelectTake}
              compact
            />
          </div>
        ) : null}
      </div>
      {showTakePills ? (
        <div className='hidden sm:block'>
          <TakeSwitcher
            labels={track.takes.map(take => take.label)}
            selectedLabel={selectedTake?.label ?? null}
            counts={takeCounts}
            onSelect={onSelectTake}
            compact
          />
        </div>
      ) : null}
      {canVote && selectedTake !== null ? (
        <div className='flex shrink-0 items-center gap-1'>
          {voter === 'owner' ? (
            <DownloadButton
              key={`save-${track.number}-${voteVersionSlug}-${takeLabel}`}
              trackNumber={track.number}
              versionSlug={voteVersionSlug}
              takeLabel={takeLabel}
              trackTitle={track.title}
              audioUrl={selectedTake.audioUrl}
              votes={votes}
              onSnapshot={onVoteSnapshot}
            />
          ) : null}
          <ListenerScore
            votes={votes}
            voter={voter}
            trackNumber={track.number}
            versionSlug={voteVersionSlug}
            takeLabel={takeLabel}
          />
          <VoteButton
            key={`${track.number}-${voteVersionSlug}-${takeLabel}`}
            trackNumber={track.number}
            versionSlug={voteVersionSlug}
            takeLabel={takeLabel}
            trackTitle={track.title}
            initialCount={countForTake(votes, track.number, voteVersionSlug, takeLabel)}
            initialValue={choiceForTake(votes, track.number, voteVersionSlug, takeLabel)}
            onSnapshot={onVoteSnapshot}
          />
        </div>
      ) : null}
      {!ready ? <span className='text-muted-foreground text-xs'>Waiting</span> : null}
    </div>
  );
}

function TakeSwitcher({
  labels,
  selectedLabel,
  onSelect,
  compact = false,
  legend,
  counts,
}: {
  labels: string[];
  selectedLabel: string | null;
  onSelect: (label: string) => void;
  compact?: boolean;
  legend?: string;
  counts?: Record<string, number>;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1', compact ? '' : 'pt-1')}>
      {legend === undefined ? null : (
        <p className='text-muted-foreground mr-2 text-xs tracking-[0.2em] uppercase'>{legend}</p>
      )}
      {labels.map(label => {
        const selected = label === selectedLabel;
        const count = counts?.[label] ?? 0;
        return (
          <button
            key={label}
            type='button'
            onClick={() => onSelect(label)}
            aria-pressed={selected}
            aria-label={legend === undefined ? `Take ${label}` : `${legend} ${label}`}
            className={cn(
              'rounded-full border font-mono text-xs',
              compact ? 'min-w-7 px-1.5 py-1' : 'min-w-8 px-2.5 py-1',
              selected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground hover:text-foreground border-white/15 hover:border-white/30'
            )}
          >
            <span className='block leading-none'>{label}</span>
            {count !== 0 ? (
              <span className='mt-0.5 block text-[10px] leading-none'>
                {formatSignedScore(count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SeekBar({
  currentTime,
  duration,
  disabled,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  disabled: boolean;
  onSeek: (seconds: number) => void;
}) {
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  function seekFromClientX(target: HTMLDivElement, clientX: number) {
    if (disabled || duration <= 0) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  return (
    <div
      role='slider'
      tabIndex={disabled ? -1 : 0}
      aria-label='Seek'
      aria-disabled={disabled}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.floor(duration))}
      aria-valuenow={Math.floor(currentTime)}
      aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
      className={cn('group relative h-8', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromClientX(event.currentTarget, event.clientX);
      }}
      onPointerMove={event => {
        if (event.buttons === 0) {
          return;
        }
        seekFromClientX(event.currentTarget, event.clientX);
      }}
      onKeyDown={event => {
        if (disabled) {
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          onSeek(Math.min(duration, currentTime + 5));
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          onSeek(Math.max(0, currentTime - 5));
        }
      }}
    >
      <div className='absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15'>
        <div className='bg-primary h-full rounded-full' style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function EmptyAudioHint({
  surface,
  voter,
}: {
  surface: PlayerSurface;
  voter: 'owner' | 'listener';
}) {
  return (
    <div className='text-muted-foreground rounded-2xl border border-dashed border-white/15 p-5 text-sm leading-relaxed'>
      {surface === 'vote' && voter === 'listener' ? (
        <p>No takes in this round yet.</p>
      ) : surface === 'vote' ? (
        <p>
          No takes yet. Upload them on{' '}
          <Link href='/intake' className='text-foreground underline-offset-2 hover:underline'>
            Intake
          </Link>{' '}
          or with <code className='text-foreground'>pnpm takes:upload</code>, named like{' '}
          <code className='text-foreground'>v1-01-track-one-p1-takea.mp3</code>.
        </p>
      ) : (
        <p>Nothing here yet.</p>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className='flex size-11 items-center justify-center rounded-full hover:bg-white/6 disabled:opacity-40'
    >
      {children}
    </button>
  );
}

function padTrackNumber(number: number): string {
  return String(number).padStart(2, '0');
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
