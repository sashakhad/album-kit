'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Pause, Play } from 'lucide-react';

import { formatSignedScore } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export type FinalTrack = {
  number: number;
  title: string;
  hasMain: boolean;
  hasVip: boolean;
  mainToken: string | null;
  vipToken: string | null;
  takes: {
    token: string;
    label: string;
    prompt: string | null;
    audioUrl: string;
    score: number;
    listenerScore: number;
  }[];
};

type Selection = Pick<FinalTrack, 'hasMain' | 'hasVip' | 'mainToken' | 'vipToken'>;

export function FinalPass({ tracks, round }: { tracks: FinalTrack[]; round: number }) {
  const [selections, setSelections] = useState<Record<number, Selection>>(() =>
    Object.fromEntries(
      tracks.map(track => [
        track.number,
        {
          hasMain: track.hasMain,
          hasVip: track.hasVip,
          mainToken: track.mainToken,
          vipToken: track.vipToken,
        },
      ])
    )
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pickedCount = tracks.filter(track => selections[track.number]?.hasMain).length;

  async function save(trackNumber: number, slot: 'main' | 'vip', token: string | null) {
    if (pending !== null) return;
    setPending(`${trackNumber}-${slot}`);
    setError(null);
    try {
      const response = await fetch('/api/owner/listen-selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackNumber, slot, token, round }),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        setError(body.error ?? 'Could not save that pick. Try again.');
        return;
      }
      setSelections(current => ({
        ...current,
        [trackNumber]: {
          hasMain: slot === 'main' ? token !== null : (current[trackNumber]?.hasMain ?? false),
          hasVip: slot === 'vip' ? token !== null : (current[trackNumber]?.hasVip ?? false),
          mainToken: slot === 'main' ? token : (current[trackNumber]?.mainToken ?? null),
          vipToken: slot === 'vip' ? token : (current[trackNumber]?.vipToken ?? null),
        },
      }));
    } catch {
      setError('Could not save that pick. Try again.');
    } finally {
      setPending(null);
    }
  }

  function toggleAudio(token: string, url: string) {
    const audio = audioRef.current;
    if (audio === null) return;
    if (playing === token) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = url;
    setPlaying(token);
    void audio.play().catch(() => setPlaying(null));
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/4 px-4 py-3 text-sm'>
        <p>
          <strong>
            {pickedCount} of {tracks.length}
          </strong>{' '}
          tracks have an album pick
        </p>
        <Link
          href='/vote'
          className='text-muted-foreground hover:text-foreground underline underline-offset-4'
        >
          Back to voting
        </Link>
      </div>
      {error === null ? null : (
        <p
          role='alert'
          className='text-destructive border-destructive/30 rounded-lg border p-3 text-sm'
        >
          {error}
        </p>
      )}
      <ol className='space-y-5'>
        {tracks.map(track => {
          const selected = selections[track.number];
          return (
            <li key={track.number} className='bg-card/60 rounded-2xl border border-white/12 p-5'>
              <div className='flex flex-wrap items-baseline justify-between gap-2'>
                <h2 className='font-display text-2xl'>
                  <span className='text-muted-foreground mr-3 font-mono text-sm'>
                    {String(track.number).padStart(2, '0')}
                  </span>
                  {track.title}
                </h2>
                <span className='text-muted-foreground text-xs'>
                  {selected?.hasMain ? 'On Listen' : 'Needs an album pick'}
                </span>
              </div>
              {track.takes.length === 0 ? (
                <p className='text-muted-foreground mt-4 text-sm'>No takes in this round.</p>
              ) : (
                <ul className='mt-4 space-y-2'>
                  {track.takes.map(take => {
                    const main = selected?.mainToken === take.token;
                    const vip = selected?.vipToken === take.token;
                    return (
                      <li
                        key={take.token}
                        className='flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-3'
                      >
                        <button
                          type='button'
                          onClick={() => toggleAudio(take.token, take.audioUrl)}
                          aria-label={`${playing === take.token ? 'Pause' : 'Play'} ${take.label} of ${track.title}`}
                          className='bg-primary text-primary-foreground hover:bg-primary/90 flex size-10 shrink-0 items-center justify-center rounded-full'
                        >
                          {playing === take.token ? (
                            <Pause className='size-4 fill-current' />
                          ) : (
                            <Play className='size-4 fill-current' />
                          )}
                        </button>
                        <div className='min-w-40 flex-1'>
                          <p className='font-medium'>{take.label}</p>
                          <p className='text-muted-foreground text-xs'>
                            Your score {formatSignedScore(take.score)}
                            {take.listenerScore === 0
                              ? ''
                              : ` · listeners ${formatSignedScore(take.listenerScore)}`}
                          </p>
                          {take.prompt === null ? null : (
                            <p className='text-muted-foreground mt-2 max-w-2xl text-xs leading-relaxed whitespace-pre-line'>
                              {take.prompt}
                            </p>
                          )}
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          <button
                            type='button'
                            disabled={pending !== null || main}
                            onClick={() => void save(track.number, 'main', take.token)}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-xs font-medium disabled:cursor-default',
                              main
                                ? 'border-primary/40 bg-primary/12 text-primary'
                                : 'border-white/20 hover:bg-white/8'
                            )}
                          >
                            {main ? (
                              <>
                                <Check className='mr-1 inline size-3' />
                                Album pick
                              </>
                            ) : (
                              'Make album pick'
                            )}
                          </button>
                          <button
                            type='button'
                            disabled={pending !== null || vip}
                            onClick={() => void save(track.number, 'vip', take.token)}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-xs disabled:cursor-default',
                              vip
                                ? 'border-primary/40 bg-primary/12 text-primary'
                                : 'text-muted-foreground hover:text-foreground border-white/15 hover:bg-white/8'
                            )}
                          >
                            {vip ? 'VIP picked' : 'Make VIP'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {(selected?.hasMain || selected?.hasVip) && (
                <div className='text-muted-foreground mt-4 flex flex-wrap gap-4 text-xs'>
                  {selected.hasMain ? (
                    <button
                      type='button'
                      disabled={pending !== null}
                      onClick={() => void save(track.number, 'main', null)}
                      className='hover:text-foreground underline underline-offset-4'
                    >
                      Remove album pick{selected.mainToken === null ? ' from an earlier round' : ''}
                    </button>
                  ) : null}
                  {selected.hasVip ? (
                    <button
                      type='button'
                      disabled={pending !== null}
                      onClick={() => void save(track.number, 'vip', null)}
                      className='hover:text-foreground underline underline-offset-4'
                    >
                      Remove VIP{selected.vipToken === null ? ' from an earlier round' : ''}
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <audio ref={audioRef} preload='none' onEnded={() => setPlaying(null)} />
    </div>
  );
}
