import { formatNumberExact } from '@/lib/formatters';
import type { ProgressTrack } from '@/lib/rounds/progress';

export function TakeAvailability({
  message,
  tracks,
  pendingLabel,
}: {
  message: string;
  tracks: readonly ProgressTrack[];
  pendingLabel: string;
}) {
  return (
    <section className='max-w-2xl space-y-4' aria-live='polite'>
      {message.length === 0 ? null : (
        <p className='rounded-2xl border border-white/10 p-5 text-sm leading-relaxed'>{message}</p>
      )}
      {tracks.length === 0 ? null : (
        <ol className='bg-card/60 divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10'>
          {tracks.map(track => (
            <li
              key={track.trackNumber}
              className='flex min-h-14 items-center justify-between gap-4 px-4 py-3 text-sm'
            >
              <span className='min-w-0 break-words'>
                <span className='text-muted-foreground mr-3 font-mono text-xs'>
                  {String(track.trackNumber).padStart(2, '0')}
                </span>
                {track.title}
              </span>
              <span className='text-muted-foreground shrink-0 text-xs'>
                {track.expected > 0
                  ? `${formatNumberExact(track.ready)} of ${formatNumberExact(track.expected)} ready`
                  : pendingLabel}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
