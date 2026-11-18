import { createRoot } from 'react-dom/client';

import { ListenMain } from '@/components/album/ListenMain';
import { SiteHeader } from '@/components/album/SiteHeader';
import type { ListenShellPayload } from '@/preview/payload';

const dataNode = document.getElementById('album-data');
const rootNode = document.getElementById('album-root');

function showFailure(message: string) {
  if (rootNode === null) {
    return;
  }
  rootNode.textContent = message;
}

if (dataNode === null || rootNode === null) {
  showFailure('This album player is missing its data.');
} else {
  try {
    const payload = JSON.parse(dataNode.textContent ?? '') as ListenShellPayload;
    document.title = payload.title;
    createRoot(rootNode).render(
      <>
        <SiteHeader albumTitle={payload.title} showVote={false} showSettings={false} />
        <ListenMain
          title={payload.title}
          artist={payload.artist}
          blurb={payload.blurb}
          version={payload.version}
        />
      </>
    );
  } catch {
    showFailure('This album player could not read its data.');
  }
}
