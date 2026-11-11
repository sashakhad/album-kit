'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  LoaderCircle,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';

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
import { rankListenTakes } from '@/lib/album/listen';
import { slugifyTrackTitle } from '@/lib/album/slug';
import type { AlbumTake, AlbumTrack, AlbumVersion } from '@/lib/album/types';
import { DownloadButton } from '@/components/album/DownloadButton';
import { ListenChoiceControls, type ListenChoice } from '@/components/album/ListenChoiceControls';
import { PassControls } from '@/components/album/PassControls';
import { VoteButton } from '@/components/album/VoteButton';
import { choiceForTake, countForTake, takeCountsForTrack } from '@/lib/votes/tally';
import { EMPTY_VOTE_SNAPSHOT, type VoteSnapshot } from '@/lib/votes/types';
import {
  formatDuration,
  formatNumberExact,
  formatSignedScore,
  formatCompactScore,
} from '@/lib/formatters';
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
  showListenerScores = true,
  listenChoices,
}: {
  version: AlbumVersion;
  votes?: VoteSnapshot;
  initialTrackNumber?: number;
  initialTrackTitle?: string;
  initialTakeLabel?: string;
  surface?: PlayerSurface;
  awaitingReveal?: boolean;
  voter?: 'owner' | 'listener';
  showListenerScores?: boolean;
  listenChoices?: Record<number, ListenChoice>;
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
    const selected: Record<string, string> = {};
    if (listenChoices !== undefined) {
      for (const track of version.tracks) {
        const choice = listenChoices[track.number];
        const take = choice?.manual
          ? track.takes.find(take => take.filename === choice.token)
          : rankListenTakes(track.takes, takeCountsForTrack(votes, track)).winners[0];
        if (take !== undefined) selected[trackKey(track)] = take.label;
      }
    }
    const track = version.tracks[startIndex];
    if (
      initialTakeLabel !== undefined &&
      track !== undefined &&
      findTakeOnTrack(track, initialTakeLabel) !== null
    ) {
      selected[trackKey(track)] = initialTakeLabel;
    }
    return selected;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [showMini, setShowMini] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || controlsRef.current === null) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry !== undefined)
        setShowMini(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(controlsRef.current);
    return () => observer.disconnect();
  }, []);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [voteSnapshot, setVoteSnapshot] = useState(votes);
  const displayedVotes = useMemo(() => {
    if (showListenerScores) return voteSnapshot;
    const visible = { ...voteSnapshot };
    delete visible.listenerTallies;
    return visible;
  }, [showListenerScores, voteSnapshot]);

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
  const currentPrompt =
    currentTake?.prompt ?? currentTake?.details?.style ?? currentTrack?.prompt ?? null;

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
        : currentTrack.listenSlug === undefined
          ? listenHref({ title: currentTrack.title })
          : `/listen/${currentTrack.listenSlug}`;
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

    setPlaybackError(null);
    setIsLoading(true);
    if (audio.error) audio.load();
    void audio
      .play()
      .then(() => {
        if (audio.src === nextSrc) setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || audio.src !== nextSrc) return;
        setIsPlaying(false);
        setIsLoading(false);
        setPlaybackError('Could not play this track. Try again.');
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
      setDuration(0);
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
      setIsLoading(false);
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
      if (
        isTypingTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest('button, a, summary, [role=slider]') !== null)
      ) {
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

  const PlayerHeading = playerSurface === 'listen' ? 'h2' : 'h1';
  const playLabel = isPlaying ? 'Pause' : playerSurface === 'listen' ? 'Play album' : 'Play';
  return (
    <section className='grid min-w-0 gap-8 pb-24 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:pb-0'>
      <div className='min-w-0 space-y-5'>
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs tracking-widest uppercase'>
            {hasAudio ? 'Now playing' : 'Coming soon'}
          </p>
          <PlayerHeading className='font-display text-3xl leading-tight tracking-tight break-words sm:text-4xl'>
            {currentTrack?.title ?? version.title}
          </PlayerHeading>
          {currentTrack !== null ? (
            <p className='text-muted-foreground text-sm'>
              {padTrackNumber(currentTrack.number)}
              {playerSurface === 'vote' && currentTake !== null
                ? ` · Take ${currentTake.label}`
                : ''}
              {currentTrack.status === 'preview' ? ' · Preview' : ''}
              {isParkedTake(currentTrack, currentTake) ? ' · Possible rename' : ''}
            </p>
          ) : null}
        </div>

        <div ref={controlsRef} data-player-controls className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
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
              aria-label={playLabel}
              className='bg-primary text-primary-foreground hover:bg-primary/90 flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium disabled:opacity-40'
            >
              {isLoading ? (
                <LoaderCircle className='size-5 animate-spin' />
              ) : isPlaying ? (
                <Pause className='size-5 fill-current' />
              ) : (
                <Play className='size-5 fill-current' />
              )}
              {playLabel}
            </button>
            <IconButton
              label={playbackMode === 'variations' ? 'Next variation' : 'Next track'}
              onClick={() => playNext(true)}
              disabled={!hasAudio}
            >
              <SkipForward className='size-5 fill-current' />
            </IconButton>
          </div>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            disabled={!hasAudio || duration <= 0}
            onSeek={handleSeek}
          />
          <div className='text-muted-foreground flex items-center justify-between gap-3 text-xs'>
            <span className='shrink-0 font-mono tabular-nums'>
              {formatDuration(currentTime)} / {duration > 0 ? formatDuration(duration) : '—:—'}
            </span>
            <label className='flex min-h-11 items-center gap-2'>
              <Volume2 className='size-4' />
              <span className='sr-only'>Volume</span>
              <input
                type='range'
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={event => setVolume(Number(event.target.value))}
                className='accent-primary h-11 w-24 max-w-full'
              />
            </label>
          </div>
          <div className='min-h-6 text-sm' aria-live='polite'>
            {playbackError !== null ? (
              <p role='alert' className='text-destructive'>
                {playbackError}{' '}
                <button
                  type='button'
                  className='inline-flex min-h-11 items-center underline'
                  onClick={togglePlay}
                >
                  Retry
                </button>
              </p>
            ) : (
              <p className='text-muted-foreground'>
                {!hasAudio
                  ? 'No audio yet'
                  : isLoading
                    ? 'Loading audio…'
                    : isPlaying
                      ? 'Playing'
                      : currentTime > 0
                        ? 'Paused'
                        : 'Ready to play'}
              </p>
            )}
          </div>
        </div>

        {currentPrompt !== null ? (
          <details className='group rounded-xl border border-white/12 bg-white/3' data-prompt>
            <summary className='flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden'>
              <span>Prompt{currentTake === null ? '' : ` · Take ${currentTake.label}`}</span>
              <ChevronDown className='size-4 transition-transform group-open:rotate-180' />
            </summary>
            <div className='space-y-3 px-4 pb-4'>
              <p className='text-sm leading-relaxed whitespace-pre-line'>{currentPrompt}</p>
              {currentTake?.details === undefined ? null : (
                <p className='text-muted-foreground text-xs leading-relaxed'>
                  {currentTake.details.writer} · Suno {currentTake.details.sunoModel}
                </p>
              )}
            </div>
          </details>
        ) : null}

        {hasVariations && playerSurface === 'vote' ? (
          <PlaybackModeControl mode={playbackMode} onChange={setPlaybackMode} />
        ) : null}
        {playbackMode === 'variations' && currentTrack !== null ? (
          <p className='text-muted-foreground text-xs'>
            Plays each take of this track in order. Next stays on this track.
          </p>
        ) : null}
        {playerSurface === 'vote' && voter === 'owner' ? (
          <details className='border-t border-white/10 pt-2'>
            <summary className='text-muted-foreground flex min-h-11 cursor-pointer items-center text-sm'>
              Round {voteSnapshot.currentRound} · Manage round
            </summary>
            <PassControls currentRound={voteSnapshot.currentRound} />
            {currentTrack === null ? null : <ParkedCount track={currentTrack} />}
          </details>
        ) : null}
        {!hasAudio ? <EmptyAudioHint surface={playerSurface} voter={voter} /> : null}
      </div>

      <div className='min-w-0 space-y-6'>
        <div className='flex items-baseline justify-between px-1'>
          <h2 className='text-sm font-medium'>
            {playerSurface === 'listen' ? 'Tracks' : 'Choose a take'}
          </h2>
          <span className='text-muted-foreground text-xs'>
            {playableIndexes.length} ready to play
          </span>
        </div>
        <ol className='bg-card/60 divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10'>
          {version.tracks.map((track, index) => {
            const choice = listenChoices?.[track.number];
            if (!isOnAlbumShortlist(track) && !choice?.manual && !choice?.hasBonus) return null;
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
                  votes={displayedVotes}
                  versionSlug={version.slug}
                  showVotes={playerSurface !== 'listen'}
                  showTakes={playerSurface !== 'listen'}
                  listenChoice={choice}
                  voter={voter}
                  onVoteSnapshot={setVoteSnapshot}
                  onSelect={() => {
                    const selected = takeForTrack(track, selectedTakeByTrack, preferredTakeLabel);
                    playIndex(
                      index,
                      isParkedTake(track, selected) ? track.takes[0]?.label : undefined
                    );
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
            votes={displayedVotes}
            voter={voter}
            onVoteSnapshot={setVoteSnapshot}
            onPlay={(index, label) => playIndex(index, label)}
          />
        ) : null}
      </div>

      {showMini && hasAudio ? (
        <div
          className='bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t border-white/15 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden'
          data-mini-player
        >
          <div className='mx-auto flex max-w-3xl items-center gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-medium'>{currentTrack?.title}</p>
              <p className='text-muted-foreground text-xs'>
                {playbackError !== null
                  ? 'Playback unavailable'
                  : isLoading
                    ? 'Loading…'
                    : `${formatDuration(currentTime)} / ${duration > 0 ? formatDuration(duration) : '—:—'}`}
              </p>
            </div>
            <IconButton
              label={isPlaying ? 'Pause playback' : 'Resume playback'}
              onClick={togglePlay}
              disabled={!hasAudio}
            >
              {isLoading ? (
                <LoaderCircle className='size-5 animate-spin' />
              ) : isPlaying ? (
                <Pause className='size-5 fill-current' />
              ) : (
                <Play className='size-5 fill-current' />
              )}
            </IconButton>
            <IconButton label='Skip to next' onClick={() => playNext(true)} disabled={!hasAudio}>
              <SkipForward className='size-5 fill-current' />
            </IconButton>
          </div>
        </div>
      ) : null}
      {currentAudioUrl !== null ? (
        <audio
          ref={audioRef}
          src={currentAudioUrl}
          preload='metadata'
          playsInline
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
          onDurationChange={event =>
            setDuration(
              Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0
            )
          }
          onPlaying={() => {
            setIsLoading(false);
            setPlaybackError(null);
          }}
          onWaiting={() => {
            if (isPlaying) setIsLoading(true);
          }}
          onError={() => {
            setIsPlaying(false);
            setIsLoading(false);
            setPlaybackError('Could not load this track. Try again.');
          }}
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
      <div className='inline-flex max-w-full rounded-xl border border-white/15 p-1'>
        <button
          type='button'
          onClick={() => onChange('album')}
          aria-pressed={mode === 'album'}
          className={cn(
            'min-h-11 rounded-lg px-3 text-sm',
            mode === 'album'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Play album
        </button>
        <button
          type='button'
          onClick={() => onChange('variations')}
          aria-pressed={mode === 'variations'}
          className={cn(
            'min-h-11 rounded-lg px-3 text-sm',
            mode === 'variations'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Compare this track
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
        'flex w-full flex-wrap items-center gap-3 px-4 py-3',
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
            displayLabel={take.label}
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
          displayLabel={take.label}
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
  const label = formatSignedScore(count);
  return (
    <span
      className='text-muted-foreground w-12 shrink-0 text-right text-[10px] leading-tight tabular-nums'
      aria-label={`Listener score ${label}, separate from your score`}
    >
      listeners
      <br />
      {formatCompactScore(count)}
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
  listenChoice,
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
  listenChoice: ListenChoice | undefined;
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
  const ranking = listenChoice === undefined ? null : rankListenTakes(track.takes, takeCounts);

  return (
    <div data-track-row className={cn('@container min-w-0 px-4 py-4', isCurrent && 'bg-white/6')}>
      <div className='flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2'>
        <button
          type='button'
          onClick={onSelect}
          disabled={!ready}
          aria-current={isCurrent ? true : undefined}
          className='flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default'
        >
          <span className='text-muted-foreground flex w-6 shrink-0 items-center font-mono text-xs'>
            {isPlaying ? (
              <Play className='fill-primary text-primary size-3' />
            ) : (
              padTrackNumber(track.number)
            )}
          </span>
          <span className='min-w-0 flex-1'>
            <span className={cn('block text-sm break-words', !ready && 'text-muted-foreground')}>
              {track.title}
            </span>
            {track.status === 'preview' ? (
              <span className='text-muted-foreground text-xs'>Preview</span>
            ) : null}
            {track.kind === 'bonus' ? (
              <span className='text-muted-foreground text-xs'>Bonus</span>
            ) : null}
          </span>
        </button>
        {!ready ? (
          <span className='text-muted-foreground text-xs'>
            {listenChoice?.manual || listenChoice?.hasBonus
              ? 'No takes in this round'
              : 'Coming soon'}
          </span>
        ) : track.compareHref === undefined ? null : (
          <Link
            href={track.compareHref}
            className='text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-xs underline underline-offset-4'
          >
            Compare takes
          </Link>
        )}
      </div>
      {showTakePills || canVote ? (
        <div className='mt-2 flex flex-col items-start gap-3 @min-[26rem]:flex-row @min-[26rem]:items-end @min-[26rem]:justify-between'>
          {showTakePills ? (
            <TakeSwitcher
              labels={(ranking?.ordered ?? track.takes).map(take => take.label)}
              selectedLabel={selectedTake?.label ?? null}
              counts={takeCounts}
              onSelect={onSelectTake}
              compact
            />
          ) : null}
          {canVote && selectedTake !== null ? (
            <div className='flex shrink-0 items-end gap-1 self-end'>
              {voter === 'owner' ? (
                <DownloadButton
                  key={`save-${track.number}-${voteVersionSlug}-${takeLabel}`}
                  trackNumber={track.number}
                  versionSlug={voteVersionSlug}
                  takeLabel={takeLabel}
                  displayLabel={selectedTake.label}
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
                displayLabel={selectedTake.label}
                trackTitle={track.title}
                initialCount={countForTake(votes, track.number, voteVersionSlug, takeLabel)}
                initialValue={choiceForTake(votes, track.number, voteVersionSlug, takeLabel)}
                onSnapshot={onVoteSnapshot}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {listenChoice !== undefined &&
      ranking !== null &&
      (ready || listenChoice.manual || listenChoice.hasBonus) ? (
        <ListenChoiceControls
          key={track.takes[0]?.filename ?? track.title}
          track={track}
          selectedTake={selectedTake}
          winners={ranking.winners}
          initialChoice={listenChoice}
          round={votes.currentRound}
        />
      ) : null}
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
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', compact ? '' : 'pt-1')}>
      {legend === undefined ? null : (
        <p className='text-muted-foreground w-full text-xs'>{legend}</p>
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
            title={
              counts === undefined
                ? `Take ${label}`
                : `Take ${label}, score ${formatSignedScore(count)}`
            }
            data-take-button
            className={cn(
              'grid h-11 shrink-0 items-center rounded-lg border text-sm transition-colors',
              counts === undefined ? 'w-11 grid-cols-1' : 'w-24 grid-cols-[2rem_1fr]',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border-white/15 hover:border-white/35'
            )}
          >
            <span className='font-medium'>{label}</span>
            {counts === undefined ? null : (
              <span
                aria-label={`Score ${formatSignedScore(count)}`}
                className={cn(
                  'border-l px-1 font-mono text-xs tabular-nums',
                  selected ? 'border-black/15' : 'border-white/15',
                  count === 0 && 'opacity-50'
                )}
              >
                {formatCompactScore(count)}
              </span>
            )}
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
      className={cn('group relative h-11', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
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
          No takes to compare yet. Ask Grok Bot to make a round, or{' '}
          <Link
            href='/intake'
            className='text-foreground inline-flex min-h-11 items-center underline underline-offset-4'
          >
            upload takes
          </Link>{' '}
          you already have.
        </p>
      ) : (
        <p>Music is on the way. Tracks will appear here as they become available.</p>
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
      className='flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/6 disabled:opacity-40'
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
