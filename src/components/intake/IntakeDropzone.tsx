'use client';

import { useState, type ChangeEvent, type DragEvent } from 'react';
import { upload } from '@vercel/blob/client';
import { Upload } from 'lucide-react';

import { canonicalTakeProblem, parseCanonicalTake } from '@/lib/album/parse-filename';
import { stripMp3Tags } from '@/lib/album/strip-mp3-tags';
import { formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const UPLOAD_ROUTE = '/api/owner/upload';

type IntakeState = 'rejected' | 'uploading' | 'uploaded' | 'failed';

type IntakeRow = {
  id: string;
  name: string;
  state: IntakeState;
  percentage: number;
  message: string | null;
};

const STATE_LABELS: Record<IntakeState, string> = {
  rejected: 'Bad name',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  failed: 'Failed',
};

export function IntakeDropzone({ access = 'public' }: { access?: 'public' | 'private' }) {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [dragging, setDragging] = useState(false);

  function updateRow(id: string, patch: Partial<IntakeRow>) {
    setRows(current => current.map(row => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function uploadFile(id: string, file: File) {
    try {
      const clean = stripMp3Tags(new Uint8Array(await file.arrayBuffer()));
      const audio = new File([new Uint8Array(clean)], file.name, { type: 'audio/mpeg' });
      await upload(`takes/${file.name}`, audio, {
        access,
        handleUploadUrl: UPLOAD_ROUTE,
        contentType: 'audio/mpeg',
        onUploadProgress: progress => updateRow(id, { percentage: progress.percentage }),
      });
      updateRow(id, { state: 'uploaded', percentage: 100 });
    } catch (error) {
      updateRow(id, { state: 'failed', message: await uploadErrorMessage(file, error) });
    }
  }

  function addFiles(files: readonly File[]) {
    const added: IntakeRow[] = [];
    const accepted: { id: string; file: File }[] = [];
    const letters = new Map<string, string>();
    for (const file of files) {
      const id = crypto.randomUUID();
      const take = parseCanonicalTake(file.name);
      if (take === null) {
        const problem = canonicalTakeProblem(file.name) ?? 'not a canonical take name';
        added.push({ id, name: file.name, state: 'rejected', percentage: 0, message: problem });
        continue;
      }
      const key = `${take.setId}-${take.trackNumber}-${take.letter}`;
      const earlier = letters.get(key);
      if (earlier !== undefined && earlier !== file.name) {
        added.push({
          id,
          name: file.name,
          state: 'rejected',
          percentage: 0,
          message: `uses the same set, track and letter as ${earlier}`,
        });
        continue;
      }
      letters.set(key, file.name);
      added.push({ id, name: file.name, state: 'uploading', percentage: 0, message: null });
      accepted.push({ id, file });
    }

    setRows(current => [...added, ...current]);
    for (const item of accepted) {
      void uploadFile(item.id, item.file);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  return (
    <div className='space-y-6'>
      <label
        onDragOver={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center',
          dragging ? 'border-primary bg-white/6' : 'border-white/15 hover:bg-white/4'
        )}
      >
        <Upload className='text-muted-foreground size-6' />
        <span className='text-sm'>Drop .mp3 takes here, or click to pick files</span>
        <input
          type='file'
          accept='.mp3,audio/mpeg'
          multiple
          onChange={onPick}
          className='sr-only'
          aria-label='Pick takes to upload'
        />
      </label>

      {rows.length > 0 ? (
        <ol className='bg-card/60 divide-y divide-white/6 rounded-2xl border border-white/8'>
          {rows.map(row => (
            <li key={row.id} className='space-y-2 px-4 py-3'>
              <div className='flex flex-wrap items-baseline justify-between gap-3'>
                <span className='min-w-0 font-mono text-sm break-all'>{row.name}</span>
                <span
                  className={cn(
                    'text-xs',
                    row.state === 'rejected' || row.state === 'failed'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  )}
                >
                  {STATE_LABELS[row.state]}
                  {row.state === 'uploading' ? ` ${formatPercent(row.percentage, true)}` : ''}
                </span>
              </div>
              {row.state === 'uploading' || row.state === 'uploaded' ? (
                <div className='h-1 rounded-full bg-white/15'>
                  <div
                    className='bg-primary h-full rounded-full'
                    style={{ width: `${row.percentage}%` }}
                  />
                </div>
              ) : null}
              {row.message === null ? null : (
                <p className='text-muted-foreground text-xs'>{row.message}</p>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

// The Blob client replaces the upload route's error with a generic one, so ask the route for its reason.
async function uploadErrorMessage(file: File, error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : 'Upload failed';
  if (!(error instanceof Error) || !/client token/i.test(error.message)) {
    return fallback;
  }

  try {
    const response = await fetch(UPLOAD_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname: `takes/${file.name}`, clientPayload: null, multipart: false },
      }),
    });
    const body: unknown = await response.json();
    if (
      !response.ok &&
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}
