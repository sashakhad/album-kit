import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkKit } from './check-kit.mjs';

// Use committed kit files, even when the owner's checkout is old, modified, or just a data folder.
export async function verifiedScaffold(
  albumRoot,
  ref = 'main',
  request = fetch,
  recordedSite = null
) {
  const kitSource = 'https://github.com/sashakhad/album-kit';
  // An exact commit already verified for this project's last direct deploy can
  // be read from its Git object store again without a network round trip.
  const previouslyVerified =
    /^[a-f0-9]{40}$/.test(ref) &&
    recordedSite?.kitSource === kitSource &&
    recordedSite?.deployedKitRevision === ref &&
    recordedSite?.deploy === 'direct' &&
    /^prj_[\w-]+$/.test(recordedSite?.projectId ?? '');
  const revision = previouslyVerified
    ? ref
    : (await checkKit({ root: albumRoot, ref, request })).currentRevision;
  if (!revision) throw new Error('Could not verify the selected revision of sashakhad/album-kit.');
  const temp = await mkdtemp(path.join(tmpdir(), 'album-kit-scaffold-'));
  const directory = path.join(temp, 'kit');
  const archive = path.join(temp, 'kit.tar');
  try {
    await mkdir(directory);
    let local = false;
    for (const cwd of new Set([fileURLToPath(new URL('../', import.meta.url)), albumRoot])) {
      try {
        execFileSync(
          'git',
          ['--no-replace-objects', 'archive', '--format=tar', '--output', archive, revision],
          { cwd, stdio: 'ignore' }
        );
        local = true;
        break;
      } catch {
        /* A portable album may have no Git objects. */
      }
    }
    if (!local) {
      const response = await request(
        'https://codeload.github.com/sashakhad/album-kit/tar.gz/' + revision,
        {
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(60000),
        }
      );
      if (!response.ok) throw new Error('Could not download the verified Album Kit revision.');
      await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
    }
    execFileSync(
      'tar',
      local
        ? ['-xf', archive, '-C', directory]
        : ['-xzf', archive, '--strip-components=1', '-C', directory]
    );
    const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (pkg.name !== 'album-kit' || !pkg.dependencies?.next)
      throw new Error('The selected source does not contain the Album Kit app.');
    await Promise.all(
      [
        'src/app/listen/[[...parts]]/page.tsx',
        'src/app/vote/[[...parts]]/page.tsx',
        'src/app/api/votes/route.ts',
      ].map(file => access(path.join(directory, file)))
    );
    return {
      directory,
      revision,
      kitSource,
      cleanup: () => rm(temp, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}
