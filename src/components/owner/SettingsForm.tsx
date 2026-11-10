'use client';

import { useState } from 'react';

import { exportPreset, type AlbumSettingsValue } from '@/lib/settings/schema';
import { InviteControls } from '@/components/owner/InviteControls';
import { OwnerKeyControls } from '@/components/owner/OwnerKeyControls';
import { ShareControls } from '@/components/owner/ShareControls';

export function SettingsForm({
  initial,
  privateStorage,
  albumKeyValue,
  lastSunoCheck,
}: {
  initial: AlbumSettingsValue;
  privateStorage: boolean;
  albumKeyValue: string;
  lastSunoCheck: { models: string[]; checkedAt: string; resolvedModel: string | null } | null;
}) {
  const [settings, setSettings] = useState(initial);
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);

  function change<K extends keyof AlbumSettingsValue>(key: K, value: AlbumSettingsValue[K]) {
    setSettings(previous => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/owner/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: settings }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.error === 'string' ? result.error : 'Settings could not be saved.'
        );
      setSettings(result.resolved);
      setNotice('Saved. New rounds use these settings; existing rounds keep their snapshot.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function importSettings() {
    setNotice('');
    try {
      const response = await fetch('/api/owner/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: importText,
      });
      const result = await response.json();
      if (!response.ok) throw new Error('The preset is invalid or uses another version.');
      setSettings(result.resolved);
      setNotice(
        'Preset imported. Publication is unset and listener voting is off; no spending was authorized.'
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Preset import failed.');
    }
  }

  function downloadPreset() {
    const json = JSON.stringify(exportPreset(settings), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'album-preset.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>Settings</h1>
        <p className='text-muted-foreground text-sm'>
          These choices apply to future rounds. The album and its takes stay in place.
        </p>
      </header>
      <section className='grid gap-5 rounded-2xl border border-white/10 p-5 sm:grid-cols-2'>
        <Field label='Preset'>
          <select
            value={settings.preset}
            onChange={e => {
              const preset = e.target.value as AlbumSettingsValue['preset'];
              change('preset', preset);
              if (preset === 'small-test')
                setSettings(p => ({
                  ...p,
                  preset,
                  promptVariations: 2,
                  generationsPerPrompt: 1,
                  promptWriter: 'grok-bot',
                }));
              if (preset === 'quick-start')
                setSettings(p => ({
                  ...p,
                  preset,
                  promptVariations: 5,
                  generationsPerPrompt: 1,
                  promptWriter: 'grok-bot',
                }));
              if (preset === 'studio')
                setSettings(p => ({ ...p, preset, promptVariations: 5, promptWriter: 'cursor' }));
            }}
            className={inputClass}
          >
            <option value='quick-start'>Quick start</option>
            <option value='studio'>Studio</option>
            <option value='small-test'>Small test</option>
            <option value='imported'>Imported</option>
          </select>
        </Field>
        <Field label='Suno model'>
          <input
            value={settings.sunoModel}
            onChange={e => change('sunoModel', e.target.value)}
            className={inputClass}
            list='suno-models'
          />
          <datalist id='suno-models'>
            <option value='auto' />
            {lastSunoCheck?.models.map(model => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <small className='text-muted-foreground'>
            Auto resolves against your connected Suno account before each round.{' '}
            {lastSunoCheck === null
              ? 'No account model list has been saved yet.'
              : `Last checked ${lastSunoCheck.checkedAt.slice(0, 16).replace('T', ' ')} UTC; resolved ${lastSunoCheck.resolvedModel ?? 'unavailable'}. Refresh in chat before a round.`}
          </small>
        </Field>
        <Field label='Prompt writer'>
          <select
            value={settings.promptWriter}
            onChange={e =>
              change('promptWriter', e.target.value as AlbumSettingsValue['promptWriter'])
            }
            className={inputClass}
          >
            <option value='grok-bot'>Grok Bot · model undisclosed</option>
            <option value='cursor'>Cursor · requires verified handoff</option>
          </select>
          <small className='text-muted-foreground'>
            Cursor execution and model identity must be verified before a round begins.
          </small>
        </Field>
        <Field label='Listening details'>
          <select
            value={settings.listeningDetails}
            onChange={e =>
              change('listeningDetails', e.target.value as AlbumSettingsValue['listeningDetails'])
            }
            className={inputClass}
          >
            <option value='visible'>Visible</option>
            <option value='reveal-after-vote'>Reveal after voting</option>
            <option value='keep-hidden'>Keep hidden</option>
          </select>
        </Field>
        <Field label='Prompt variations per track'>
          <input
            type='number'
            min='1'
            max='20'
            value={settings.promptVariations}
            onChange={e => change('promptVariations', Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label='Generations per prompt'>
          <input
            type='number'
            min='1'
            max='10'
            value={settings.generationsPerPrompt}
            onChange={e => change('generationsPerPrompt', Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label='Mood'>
          <input
            value={settings.mood}
            onChange={e => change('mood', e.target.value)}
            className={inputClass}
            placeholder='Use the album brief'
          />
        </Field>
        <Field label='Vocals'>
          <select
            value={settings.vocals}
            onChange={e => change('vocals', e.target.value as AlbumSettingsValue['vocals'])}
            className={inputClass}
          >
            <option value='instrumental'>Instrumental</option>
            <option value='sung'>Sung vocals</option>
            <option value='chops'>Vocal chops</option>
          </select>
        </Field>
        <Field label='Musical constraints'>
          <textarea
            value={settings.musicalConstraints}
            onChange={e => change('musicalConstraints', e.target.value)}
            className={inputClass}
            rows={3}
            placeholder='Optional'
          />
        </Field>
        <Field label='Album site visibility'>
          <select
            value={settings.visibility}
            onChange={e => change('visibility', e.target.value as AlbumSettingsValue['visibility'])}
            className={inputClass}
          >
            <option value='unset'>Not chosen</option>
            <option value='public'>Public listening page</option>
            <option value='private' disabled={!privateStorage}>
              Private album
            </option>
          </select>
          <small className='text-muted-foreground'>
            {privateStorage
              ? 'Public lets anyone open the home page and Listen, which plays pinned takes. Private lets you and people with an invitation open those pages. Neither choice lets other people vote, upload, or change Settings.'
              : 'Public lets anyone open the home page and Listen, which plays pinned takes. Private needs a private Blob store. Existing public takes must be migrated before selection.'}
          </small>
        </Field>
        <Field label='Who can vote'>
          <select
            value={settings.listenerVoting ? 'listeners' : 'owner'}
            onChange={event => change('listenerVoting', event.target.value === 'listeners')}
            className={inputClass}
          >
            <option value='owner'>Only you</option>
            <option value='listeners'>You and listeners</option>
          </select>
          <small className='text-muted-foreground'>
            Off by default. Listener scores are stored on their own ballots and never change your
            scores, your picks, or the next round. Listeners always hear shuffled labels, even when
            your own listening details are visible. They cannot pin, move takes, open Studio, or
            change Settings. On a public album any visitor can vote. On a private album only someone
            with an invitation can.
          </small>
        </Field>
      </section>
      <section className='space-y-4 rounded-2xl border border-white/10 p-5'>
        <h2 className='text-xl font-medium'>Round limits</h2>
        <p className='text-muted-foreground text-sm'>
          Limits constrain estimates; saving them does not authorize spending.
        </p>
        <div className='grid gap-5 sm:grid-cols-3'>
          <Field label='Generation credits'>
            <NullableNumber
              value={settings.generationCreditLimit}
              onChange={value => change('generationCreditLimit', value)}
            />
          </Field>
          <Field label='Downloads'>
            <NullableNumber
              value={settings.downloadLimit}
              onChange={value => change('downloadLimit', value)}
            />
          </Field>
          <Field label='External USD'>
            <NullableNumber
              value={settings.externalSpendLimitUsd}
              onChange={value => change('externalSpendLimitUsd', value)}
            />
          </Field>
        </div>
      </section>
      <section className='space-y-2 rounded-2xl border border-white/10 p-5'>
        <h2 className='text-xl font-medium'>Connections</h2>
        <p className='text-muted-foreground text-sm'>
          Grok Bot and Suno account capabilities are checked in chat before a round. The site cannot
          inspect those sessions.{' '}
          {lastSunoCheck === null
            ? 'No Suno capability snapshot yet.'
            : `Last known Suno models: ${lastSunoCheck.models.join(', ')}.`}{' '}
          A Cursor project is optional.
        </p>
      </section>
      <ShareControls visibility={settings.visibility} listenerVoting={settings.listenerVoting} />
      {settings.visibility === 'private' && privateStorage ? (
        <InviteControls listenerVoting={settings.listenerVoting} />
      ) : null}
      <OwnerKeyControls albumKeyValue={albumKeyValue} />
      <p className='text-muted-foreground text-sm'>
        For Cursor,{' '}
        <a className='underline' href='/api/owner/handoff' download='cursor-handoff.json'>
          download a credential-free project handoff
        </a>
        . Open the same repository in Cursor and verify its actual model records before using
        comparisons.
      </p>
      <div className='flex items-center gap-4'>
        <button
          type='button'
          disabled={saving}
          onClick={() => void save()}
          className='bg-primary text-primary-foreground rounded-full px-5 py-2 text-sm font-medium disabled:opacity-50'
        >
          Save settings
        </button>
        <p role='status' className='text-sm'>
          {notice}
        </p>
      </div>
      <section className='space-y-3 border-t border-white/10 pt-6'>
        <h2 className='text-xl font-medium'>Portable preset</h2>
        <p className='text-muted-foreground text-sm'>
          Exports omit album content, account details, credentials, publication choice and
          approvals.
        </p>
        <button
          type='button'
          onClick={downloadPreset}
          className='rounded-full border border-white/15 px-4 py-2 text-sm'
        >
          Export preset
        </button>
        <Field label='Import preset JSON'>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            className={inputClass}
            rows={4}
          />
        </Field>
        <button
          type='button'
          onClick={() => void importSettings()}
          className='rounded-full border border-white/15 px-4 py-2 text-sm'
        >
          Import preset
        </button>
      </section>
    </div>
  );
}

const inputClass = 'w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-2 text-sm font-medium'>
      {label}
      {children}
    </label>
  );
}
function NullableNumber({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type='number'
      min='0'
      step='any'
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={inputClass}
      placeholder='No limit set'
    />
  );
}
