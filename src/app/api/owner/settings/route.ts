import { NextResponse } from 'next/server';

import { requireOwner } from '@/lib/owner/auth';
import {
  exportPreset,
  importPreset,
  presetSettings,
  resolveSettings,
  settingsPatchSchema,
} from '@/lib/settings/schema';
import { loadStoredSettings, saveSettingsPatch } from '@/lib/settings/store';
import { privateStoreReady } from '@/lib/album/blob-audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const stored = await loadStoredSettings();
  return NextResponse.json({
    stored,
    resolved: resolveSettings(stored),
    portablePreset: exportPreset(resolveSettings(stored)),
  });
}

export async function PATCH(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('patch' in body)) {
    return NextResponse.json({ error: 'Expected a settings patch' }, { status: 400 });
  }
  const parsed = settingsPatchSchema.safeParse(body.patch);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const patch =
    parsed.data.preset === undefined
      ? parsed.data
      : { ...presetSettings(parsed.data.preset), ...parsed.data };
  if (patch.visibility === 'private' && !(await privateStoreReady())) {
    return NextResponse.json(
      {
        error:
          'Private publication needs a private Blob store. Connect one and migrate any existing public takes first.',
      },
      { status: 409 }
    );
  }
  const target = 'target' in body && body.target === 'defaults' ? 'defaults' : 'overrides';
  const stored = await saveSettingsPatch(patch, target);
  return NextResponse.json({ stored, resolved: resolveSettings(stored) });
}

export async function PUT(request: Request) {
  const denied = await requireOwner(request);
  if (denied !== null) return denied;
  const raw: unknown = await request.json().catch(() => null);
  try {
    const imported = importPreset(raw);
    const stored = await saveSettingsPatch(imported);
    return NextResponse.json({ stored, resolved: resolveSettings(stored) });
  } catch {
    return NextResponse.json({ error: 'Invalid or unsupported preset' }, { status: 400 });
  }
}
