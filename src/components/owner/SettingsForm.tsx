'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Circle, Upload } from 'lucide-react';

import { ChangePasswordForm } from '@/components/owner/ChangePasswordForm';
import { InviteControls } from '@/components/owner/InviteControls';
import { OwnerKeyControls } from '@/components/owner/OwnerKeyControls';
import { ShareControls } from '@/components/owner/ShareControls';
import { Button } from '@/components/ui/button';
import {
  exportPreset,
  importPreset,
  presetSettings,
  settingsChanges,
  settingsSchema,
  type AlbumSettingsValue,
} from '@/lib/settings/schema';

const inputClass =
  'min-h-11 w-full rounded-lg border border-white/15 bg-background px-3 py-2 text-base sm:text-sm';
const muted = 'text-muted-foreground text-sm leading-relaxed';
const visibilityLabels = { unset: 'Only you', public: 'Public', private: 'Private' };
const presetLabels = {
  'quick-start': 'Quick start',
  'small-test': 'Small test',
  studio: 'Studio',
  imported: 'Imported preset',
};

type Props = {
  albumTitle: string;
  initial: AlbumSettingsValue;
  privateStorage: boolean;
  lastSunoCheck: { models: string[]; resolvedModel: string | null } | null;
};

export function SettingsForm({ albumTitle, initial, privateStorage, lastSunoCheck }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [presetNotice, setPresetNotice] = useState('');
  const [customSunoModel, setCustomSunoModel] = useState(false);
  const patch = settingsChanges(saved, draft);
  const dirty = Object.keys(patch).length > 0;
  const sharingDirty = patch.visibility !== undefined || patch.listenerVoting !== undefined;
  const models = [...new Set([...(lastSunoCheck?.models ?? []), draft.sunoModel])].filter(
    model => model !== 'auto' && model.trim().length > 0
  );

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change<K extends keyof AlbumSettingsValue>(key: K, value: AlbumSettingsValue[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/owner/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Your owner session ended. Enter your owner password and try again.'
            : typeof result?.error === 'string'
              ? result.error
              : 'Couldn’t save changes. Check your choices and try again.'
        );
      }
      const parsed = settingsSchema.safeParse(result?.resolved);
      if (!parsed.success)
        throw new Error('Couldn’t confirm the saved settings. Reload to check them.');
      const next = parsed.data;
      setSaved(next);
      setDraft(next);
      setPresetNotice('');
      setCustomSunoModel(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t save changes. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function loadPreset(file: File) {
    setPresetNotice('');
    try {
      const imported = importPreset(JSON.parse(await file.text()));
      setDraft(previous => ({
        ...previous,
        ...imported,
        visibility: previous.visibility,
        listenerVoting: previous.listenerVoting,
      }));
      setPresetNotice('Preset loaded. Save changes to apply it.');
    } catch {
      setPresetNotice('Couldn’t read this preset. Choose an exported album preset JSON file.');
    }
  }

  function downloadPreset() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportPreset(saved), null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'album-preset.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className='min-w-0 space-y-5'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='min-w-0 space-y-2'>
          <p className='text-muted-foreground text-sm break-words'>{albumTitle}</p>
          <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>Album settings</h1>
          <p className={muted}>Saved online for this album. Grok Bot uses these same settings.</p>
        </div>
        <Link
          href='/intake'
          className='inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm hover:bg-white/6'
        >
          <Upload aria-hidden='true' className='size-4' />
          Upload takes
        </Link>
      </header>

      <form onSubmit={save} className='space-y-5'>
        <div className='bg-background/95 sticky top-0 z-30 space-y-2 rounded-xl border border-white/12 p-2.5 shadow-lg shadow-black/15 backdrop-blur sm:px-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p role='status' className='flex items-center gap-2 text-sm'>
              {dirty ? (
                <Circle aria-hidden='true' className='size-2 fill-current text-amber-300' />
              ) : (
                <Check aria-hidden='true' className='text-muted-foreground size-4' />
              )}
              {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Up to date'}
            </p>
            <div className='flex flex-wrap items-center justify-end gap-1.5'>
              {dirty ? (
                <Button
                  type='button'
                  variant='ghost'
                  className='min-h-11'
                  disabled={saving}
                  onClick={() => {
                    setDraft(saved);
                    setError('');
                    setPresetNotice('');
                    setCustomSunoModel(false);
                  }}
                >
                  Discard
                </Button>
              ) : null}
              <Button type='submit' className='min-h-11' disabled={saving || !dirty}>
                Save changes
              </Button>
            </div>
          </div>
          {error.length > 0 ? (
            <p role='alert' className='text-destructive px-1 text-sm'>
              {error}
            </p>
          ) : null}
        </div>

        <fieldset disabled={saving} className='min-w-0 space-y-5'>
          <Section
            title='Sharing'
            description='Choose who can open the album and compare takes.'
            badge={visibilityLabels[saved.visibility]}
          >
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                label='Album access'
                hint={
                  privateStorage
                    ? 'Private albums require a listener invitation.'
                    : 'Ask Grok Bot to connect private audio storage to enable invitations.'
                }
              >
                <select
                  value={draft.visibility}
                  onChange={e =>
                    change('visibility', e.target.value as AlbumSettingsValue['visibility'])
                  }
                  className={inputClass}
                >
                  <option value='unset'>Only you</option>
                  <option value='public'>Public · anyone can listen</option>
                  <option value='private' disabled={!privateStorage}>
                    Private · by invitation
                  </option>
                </select>
              </Field>
              <Field
                label='Who can vote'
                hint='Allow listeners to preview current takes and score them on a separate ballot.'
              >
                <select
                  value={draft.listenerVoting ? 'listeners' : 'owner'}
                  onChange={e => change('listenerVoting', e.target.value === 'listeners')}
                  className={inputClass}
                >
                  <option value='owner'>Only you</option>
                  <option value='listeners'>You and listeners</option>
                </select>
              </Field>
            </div>
            {sharingDirty ? (
              <p className='rounded-xl border border-white/8 bg-white/3 p-4 text-sm'>
                Save your sharing changes to get the right listener link.
              </p>
            ) : saved.visibility === 'public' ? (
              <ShareControls listenerVoting={saved.listenerVoting} />
            ) : saved.visibility === 'private' && privateStorage ? (
              <InviteControls listenerVoting={saved.listenerVoting} />
            ) : (
              <p className={muted}>
                {saved.visibility === 'unset'
                  ? 'The album is visible to you. Choose Public or Private and save to share it.'
                  : 'Connect private audio storage before creating invitations.'}
              </p>
            )}
          </Section>

          <Section
            title='Listening'
            description='Decide when prompts, writers, and Suno models are visible.'
          >
            <div className='max-w-md space-y-4'>
              <Field label='Take details' hint='Affects Listen and Compare as soon as you save.'>
                <select
                  value={draft.listeningDetails}
                  onChange={e =>
                    change(
                      'listeningDetails',
                      e.target.value as AlbumSettingsValue['listeningDetails']
                    )
                  }
                  className={inputClass}
                >
                  <option value='visible'>Show details</option>
                  <option value='reveal-after-vote'>Reveal after voting</option>
                  <option value='keep-hidden'>Keep details hidden</option>
                </select>
              </Field>
              <label className='flex min-h-11 items-center gap-3 text-sm'>
                <input
                  type='checkbox'
                  checked={draft.maskPromptModels}
                  onChange={event => change('maskPromptModels', event.target.checked)}
                  className='accent-primary size-5'
                />
                Mask prompt writer models on listening and Compare takes
              </label>
              <p className='text-muted-foreground text-xs'>
                Models show by default when take details are visible. Blind modes still hide details
                until their reveal point.
              </p>
            </div>
          </Section>

          <Section
            title='Generation'
            description='Saved defaults for future rounds. Review each round’s cost before any music is generated.'
          >
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                label='Preset'
                hint={
                  draft.preset === 'studio'
                    ? 'Studio needs a connected Cursor project.'
                    : draft.preset === 'small-test'
                      ? 'Two prompts for a small trial.'
                      : 'Pick a starting point, then adjust the counts below.'
                }
              >
                <select
                  value={draft.preset}
                  onChange={e =>
                    setDraft(previous => ({
                      ...previous,
                      ...presetSettings(e.target.value as AlbumSettingsValue['preset']),
                    }))
                  }
                  className={inputClass}
                >
                  {Object.entries(presetLabels)
                    .filter(([value]) => value !== 'imported' || draft.preset === 'imported')
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label='Suno model'
                hint={
                  lastSunoCheck?.resolvedModel
                    ? `Last used: ${lastSunoCheck.resolvedModel}. Grok Bot checks availability before each round.`
                    : 'Available models come from your Suno account check before each round.'
                }
              >
                <select
                  value={customSunoModel ? '__custom__' : draft.sunoModel}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setCustomSunoModel(true);
                      change('sunoModel', '');
                    } else {
                      setCustomSunoModel(false);
                      change('sunoModel', e.target.value);
                    }
                  }}
                  className={inputClass}
                >
                  <option value='auto'>Account quality default</option>
                  {models.map(model => (
                    <option key={model} value={model}>
                      {model}
                      {lastSunoCheck?.models.includes(model)
                        ? ''
                        : ' (saved; availability unverified)'}
                    </option>
                  ))}
                  <option value='__custom__'>Request another model ID…</option>
                </select>
              </Field>
              {customSunoModel ? (
                <Field
                  label='Requested Suno model ID'
                  hint='This is a request. Grok Bot must confirm it appears on your connected account and recheck its cost before a round.'
                >
                  <input
                    value={draft.sunoModel}
                    maxLength={120}
                    required
                    onChange={e => change('sunoModel', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              ) : null}
              <Field label='Prompts per track'>
                <input
                  type='number'
                  min='1'
                  max='20'
                  required
                  value={draft.promptVariations || ''}
                  onChange={e => change('promptVariations', Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label='Generations per prompt'>
                <input
                  type='number'
                  min='1'
                  max='10'
                  required
                  value={draft.generationsPerPrompt || ''}
                  onChange={e => change('generationsPerPrompt', Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
            </div>
            <p className={muted}>
              Downloading a song from Suno uses Suno download credits, which are limited per month.
              The site can play review takes without downloading, by streaming each take’s public
              MP4 from Suno. Making review takes public is the better choice. Only final picks get
              downloaded. You can switch songs back to private on Suno later. A take that’s private
              on Suno stops playing on the site, so the best time is after picks are final, and only
              for takes that are no longer needed for listening. Final picks are stored as real
              files.
            </p>
            <Field
              label='Review takes on Suno'
              hint={
                draft.reviewTakes === 'private'
                  ? 'Each review take is downloaded and uses Suno download credits.'
                  : 'Recommended. Review takes stay public on Suno and play from their MP4.'
              }
            >
              <select
                value={draft.reviewTakes}
                onChange={e =>
                  change('reviewTakes', e.target.value as AlbumSettingsValue['reviewTakes'])
                }
                className={inputClass}
              >
                <option value='public'>Make review takes public on Suno (recommended)</option>
                <option value='private'>
                  Keep them private and download takes (uses download credits)
                </option>
              </select>
            </Field>
          </Section>

          <Disclosure
            title='Advanced music settings'
            description='Prompt writer model, sound, limits, and presets'
          >
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                label='Prompt writer'
                hint={
                  draft.promptWriter === 'cursor'
                    ? 'Grok Bot will check the connected Cursor project before starting.'
                    : 'Grok Bot chooses its own model.'
                }
              >
                <select
                  value={draft.promptWriter}
                  onChange={e =>
                    change('promptWriter', e.target.value as AlbumSettingsValue['promptWriter'])
                  }
                  className={inputClass}
                >
                  <option value='grok-bot'>Grok Bot</option>
                  <option value='cursor'>Cursor · connected project required</option>
                </select>
              </Field>
              {draft.promptWriter === 'cursor' ? (
                <Field
                  label='Requested Cursor model'
                  hint='Auto is preselected. You can request a model here; its actual provider and model are verified from the Cursor runtime record for each prompt.'
                >
                  <input
                    value={draft.promptWriterModel}
                    maxLength={120}
                    required
                    onChange={e => change('promptWriterModel', e.target.value)}
                    className={inputClass}
                    placeholder='auto'
                  />
                </Field>
              ) : null}
              <Field label='Vocals'>
                <select
                  value={draft.vocals}
                  onChange={e => change('vocals', e.target.value as AlbumSettingsValue['vocals'])}
                  className={inputClass}
                >
                  <option value='instrumental'>Instrumental</option>
                  <option value='sung'>Sung vocals</option>
                  <option value='chops'>Vocal chops</option>
                </select>
              </Field>
              <Field label='Mood'>
                <input
                  value={draft.mood}
                  maxLength={200}
                  onChange={e => change('mood', e.target.value)}
                  className={inputClass}
                  placeholder='Use the album brief'
                />
              </Field>
              <Field label='Musical constraints'>
                <textarea
                  value={draft.musicalConstraints}
                  maxLength={2000}
                  onChange={e => change('musicalConstraints', e.target.value)}
                  className={inputClass}
                  rows={2}
                  placeholder='Optional'
                />
              </Field>
            </div>
            {draft.promptWriter === 'cursor' ? (
              <a
                href='/api/owner/handoff'
                download='cursor-handoff.json'
                className='inline-flex min-h-11 items-center text-sm underline underline-offset-4'
              >
                Download Cursor project handoff
              </a>
            ) : null}
            <div className='space-y-3 border-t border-white/10 pt-4'>
              <h3 className='font-medium'>Round limits</h3>
              <p className={muted}>
                Grok Bot still asks you to approve each round’s cost. Downloading a song from Suno
                uses Suno download credits, which are limited per month.
                {draft.reviewTakes === 'private'
                  ? ' This round downloads every review take.'
                  : ' Public review takes stream instead, so only a final pick is downloaded.'}
              </p>
              <div className='grid gap-4 sm:grid-cols-3'>
                <LimitField
                  label='Generation credits'
                  value={draft.generationCreditLimit}
                  onChange={value => change('generationCreditLimit', value)}
                />
                <LimitField
                  label='Final downloads'
                  value={draft.downloadLimit}
                  onChange={value => change('downloadLimit', value)}
                />
                <LimitField
                  label='External spend (USD)'
                  value={draft.externalSpendLimitUsd}
                  onChange={value => change('externalSpendLimitUsd', value)}
                  step='any'
                />
              </div>
            </div>
            <div className='space-y-3 border-t border-white/10 pt-4'>
              <h3 className='font-medium'>Portable preset</h3>
              <p className={muted}>
                Move your music settings between albums. Presets contain no keys, sharing settings,
                or spending approvals.
              </p>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  className='min-h-11'
                  onClick={downloadPreset}
                >
                  Export saved preset
                </Button>
                <label className='focus-within:ring-ring inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-white/15 px-3 text-sm focus-within:ring-2 hover:bg-white/6'>
                  Import preset
                  <input
                    type='file'
                    accept='.json,application/json'
                    className='sr-only'
                    onChange={event => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file !== undefined) void loadPreset(file);
                    }}
                  />
                </label>
              </div>
              {presetNotice.length > 0 ? (
                <p role='status' className={muted}>
                  {presetNotice}
                </p>
              ) : null}
            </div>
          </Disclosure>
        </fieldset>
      </form>

      <Disclosure
        title='Owner access'
        description='Change your password or sign in on another device'
      >
        <ChangePasswordForm />
        <OwnerKeyControls />
      </Disclosure>
    </div>
  );
}

function Section({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className='bg-card/45 space-y-4 rounded-2xl border border-white/10 p-4 sm:p-6'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='space-y-1'>
          <h2 className='text-lg font-semibold tracking-tight'>{title}</h2>
          <p className={muted}>{description}</p>
        </div>
        {badge === undefined ? null : (
          <span className='text-muted-foreground rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs'>
            Live: {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Disclosure({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className='group bg-card/45 rounded-2xl border border-white/10'
      onToggle={event => setExpanded(event.currentTarget.open)}
    >
      <summary className='flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 sm:px-6 [&::-webkit-details-marker]:hidden'>
        <span className='space-y-1'>
          <span className='block font-medium'>{title}</span>
          <span className='text-muted-foreground block text-sm'>{description}</span>
        </span>
        <ChevronDown
          aria-hidden='true'
          className='text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180'
        />
      </summary>
      {expanded ? (
        <div className='space-y-5 border-t border-white/10 p-4 sm:p-6'>{children}</div>
      ) : null}
    </details>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className='min-w-0 space-y-1.5'>
      <label className='flex flex-col gap-2 text-sm font-medium'>
        {label}
        {children}
      </label>
      {hint === undefined ? null : (
        <p className='text-muted-foreground text-xs leading-relaxed'>{hint}</p>
      )}
    </div>
  );
}

function LimitField({
  label,
  value,
  onChange,
  step = '1',
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type='number'
        min='0'
        step={step}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={inputClass}
        placeholder='No limit'
      />
    </Field>
  );
}
