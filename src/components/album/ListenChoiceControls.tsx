'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { AlbumTake, AlbumTrack } from '@/lib/album/types';

export type ListenChoice = {
  manual: boolean;
  token: string | null;
  hasBonus: boolean;
};

export function ListenChoiceControls({
  track,
  selectedTake,
  winners,
  initialChoice,
  round,
}: {
  track: AlbumTrack;
  selectedTake: AlbumTake | null;
  winners: readonly AlbumTake[];
  initialChoice: ListenChoice;
  round: number;
}) {
  const [choice, setChoice] = useState(initialChoice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const manualTake = track.takes.find(take => take.filename === choice.token);
  const current = choice.manual
    ? manualTake === undefined
      ? 'Saved take'
      : `Take ${manualTake.label}`
    : winners.map(take => `Take ${take.label}`).join(', ');
  const selectedIsManual =
    choice.manual && selectedTake !== null && selectedTake.filename === choice.token;
  const selectedLeads =
    !choice.manual && winners.some(take => take.filename === selectedTake?.filename);
  const action =
    selectedLeads && winners.length > 1
      ? `Use only Take ${selectedTake?.label}`
      : `${selectedLeads ? 'Keep' : 'Use'} Take ${selectedTake?.label} on Listen`;

  async function save(slot: 'main' | 'vip', token: string | null) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/owner/listen-selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackNumber: track.number, slot, token, round }),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        setError(body.error ?? 'Couldn’t update Listen. Try again.');
        return;
      }
      setChoice(previous =>
        slot === 'main'
          ? { ...previous, manual: token !== null, token }
          : { ...previous, hasBonus: false }
      );
    } catch {
      setError('Couldn’t update Listen. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='mt-3 space-y-2 border-t border-white/8 pt-2.5'>
      <div className='grid min-w-0 items-center gap-x-3 gap-y-1 @min-[28rem]:grid-cols-[minmax(0,1fr)_auto]'>
        <p
          role='status'
          title={current}
          className='text-muted-foreground min-w-0 truncate text-xs leading-relaxed'
        >
          {current.length === 0 ? (
            'Preview on Listen'
          ) : (
            <>
              <span className='text-foreground font-medium'>On Listen</span> · {current}
              {choice.manual || winners.length < 2 ? '' : ' (tied)'}
            </>
          )}
        </p>
        <div className='flex flex-wrap items-center gap-1'>
          {choice.manual ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='text-muted-foreground min-h-11'
              disabled={saving}
              aria-label={`Follow scores for ${track.title}`}
              onClick={() => void save('main', null)}
            >
              Follow scores
            </Button>
          ) : null}
          {selectedTake === null || selectedIsManual ? null : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='min-h-11'
              disabled={saving}
              aria-label={`${action} for ${track.title}`}
              onClick={() => void save('main', selectedTake.filename)}
            >
              {action}
            </Button>
          )}
        </div>
      </div>
      {choice.hasBonus ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='text-muted-foreground min-h-11'
          disabled={saving}
          onClick={() => void save('vip', null)}
        >
          Remove saved bonus
        </Button>
      ) : null}
      {saving ? (
        <p className='text-muted-foreground text-xs' role='status'>
          Saving…
        </p>
      ) : null}
      {error.length > 0 ? (
        <p role='alert' className='text-destructive text-xs'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
