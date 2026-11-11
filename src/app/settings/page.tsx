import { redirect } from 'next/navigation';

import { SettingsForm } from '@/components/owner/SettingsForm';
import { isOwner } from '@/lib/owner/auth';
import { loadSettings } from '@/lib/settings/store';
import { prisma } from '@/lib/prisma';
import { sunoCapabilitiesSchema } from '@/lib/rounds/preflight';
import { privateStoreReady } from '@/lib/album/blob-audio';
import { loadAlbumConfig } from '@/lib/album/album-config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  if (!(await isOwner())) redirect('/key?next=%2Fsettings');
  const [settings, latest, privateStorage, config] = await Promise.all([
    loadSettings(),
    prisma.generationRound.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { snapshot: true },
    }),
    privateStoreReady(),
    loadAlbumConfig(),
  ]);
  const snapshot = latest?.snapshot as
    { capabilities?: unknown; resolvedSunoModel?: string } | undefined;
  const capabilities = sunoCapabilitiesSchema.safeParse(snapshot?.capabilities);
  return (
    <main className='mx-auto max-w-4xl px-4 py-7 sm:px-6 sm:py-10'>
      <SettingsForm
        initial={settings}
        privateStorage={privateStorage}
        albumTitle={config.title}
        lastSunoCheck={
          capabilities.success
            ? {
                models: capabilities.data.availableModels,
                resolvedModel: snapshot?.resolvedSunoModel ?? null,
              }
            : null
        }
      />
    </main>
  );
}
