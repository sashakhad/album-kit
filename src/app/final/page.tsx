import Link from 'next/link';
import { redirect } from 'next/navigation';

import { FinalPass, type FinalTrack } from '@/components/owner/FinalPass';
import { loadAlbumConfig } from '@/lib/album/album-config';
import { getListenConfig } from '@/lib/album/listen-store';
import type { AlbumTake, AlbumTrack } from '@/lib/album/types';
import { isOwner } from '@/lib/owner/auth';
import { opaqueAudioId } from '@/lib/votes/blind';
import { ownerJudgingView } from '@/lib/votes/owner-view';
import { countForTake } from '@/lib/votes/tally';

export const dynamic = 'force-dynamic';

export default async function FinalPage() {
  if (!(await isOwner())) redirect('/key?next=/final');
  const [config, listenConfig, view] = await Promise.all([
    loadAlbumConfig(),
    getListenConfig(),
    ownerJudgingView(),
  ]);
  const tracks: FinalTrack[] = config.tracks
    .filter(track => track.parked !== true)
    .map(track => {
      const displayed = view.version.tracks.find(
        item => item.number === track.number && item.kind === 'album'
      );
      const original = view.originalVersion.tracks.find(
        item => item.number === track.number && item.kind === 'album'
      );
      const selected = listenConfig.tracks.find(item => item.number === track.number);
      const mainToken = pinToken(selected?.listen, original, displayed, view.votes.currentRound);
      const vipToken = pinToken(selected?.vip, original, displayed, view.votes.currentRound);
      return {
        number: track.number,
        title: track.title,
        mainToken,
        vipToken,
        hasMain: selected?.listen !== undefined,
        hasVip: selected?.vip !== undefined,
        takes: (displayed?.takes ?? []).map(take => ({
          token: take.filename,
          label: `Take ${take.label}`,
          prompt: take.prompt ?? take.details?.style ?? null,
          audioUrl: take.audioUrl,
          score: countForTake(view.votes, track.number, take.versionSlug, take.voteLabel),
          listenerScore:
            view.votes.listenerTallies?.[track.number]?.[take.versionSlug]?.[take.voteLabel] ?? 0,
        })),
      };
    });

  return (
    <main className='mx-auto max-w-5xl space-y-8 px-6 py-12'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div className='space-y-2'>
          <p className='text-primary/80 text-xs tracking-[0.2em] uppercase'>
            Owner · round {view.votes.currentRound}
          </p>
          <h1 className='font-display text-4xl tracking-tight'>Final picks</h1>
          <p className='text-muted-foreground max-w-2xl text-sm leading-relaxed'>
            Play the takes, then choose one album pick per track. Your choice appears on Listen
            right away. You can change it any time. A VIP is optional.
          </p>
        </div>
        <Link
          href='/listen'
          className='rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/6'
        >
          Open Listen
        </Link>
      </div>
      <FinalPass tracks={tracks} round={view.votes.currentRound} />
    </main>
  );
}

function pinToken(
  pin: { set: string; take: string } | undefined,
  original: AlbumTrack | undefined,
  displayed: AlbumTrack | undefined,
  round: number
): string | null {
  if (pin === undefined) return null;
  const canonical: AlbumTake | undefined = original?.takes.find(
    take => take.versionSlug === pin.set && take.voteLabel === pin.take
  );
  if (canonical === undefined) return null;
  return (
    displayed?.takes.find(
      take =>
        take.filename === canonical.filename ||
        take.filename === opaqueAudioId(round, canonical.filename)
    )?.filename ?? null
  );
}
