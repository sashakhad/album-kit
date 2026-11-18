import { createReadStream, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import {
  advanceLocalPass,
  applyLocalVote,
  emptyLocalBallot,
  readLocalStore,
} from '../src/lib/votes/local-pass.ts';

export async function servePreview({ output, catalogPath, albumKey }) {
  const ballotPath = path.join(path.dirname(output), 'album-preview-ballot.json');
  let store = { albums: {} };
  try {
    store = readLocalStore(JSON.parse(readFileSync(ballotPath, 'utf8')), albumKey);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let ballot = store.albums[albumKey] ?? emptyLocalBallot();

  const ballotView = names => ({
    pass: ballot.pass,
    selected: names.find(([, filename]) => filename === ballot.selected)?.[0] ?? null,
    votes: Object.fromEntries(
      names.flatMap(([id, filename]) =>
        Object.hasOwn(ballot.votes, filename) ? [[id, ballot.votes[filename]]] : []
      )
    ),
    retired: names.flatMap(([id, filename]) => (ballot.retired.includes(filename) ? [id] : [])),
  });

  const persist = next => {
    ballot = next;
    store = { albums: { ...store.albums, [albumKey]: next } };
    const pending = `${ballotPath}.${process.pid}.new`;
    writeFileSync(pending, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
    renameSync(pending, ballotPath);
  };

  const server = createServer(async (request, response) => {
    const host = `127.0.0.1:${server.address().port}`;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body = '') => response.writeHead(status).end(body);
    const json = (status, value) => {
      response.setHeader('Content-Type', 'application/json');
      send(status, JSON.stringify(value));
    };

    try {
      if (request.headers.host !== host) return send(403);
      const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
      if (catalog.albumKey !== albumKey) return send(410);
      if (request.url === '/ballot') {
        if (request.method === 'GET') return json(200, ballotView(catalog.names));
        if (request.method !== 'PUT') return send(405);
        if (
          request.headers.origin !== `http://${host}` ||
          request.headers['content-type'] !== 'application/json'
        )
          return send(403);
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 1024) return send(413);
        }
        let change;
        try {
          change = JSON.parse(body);
        } catch {
          return send(400);
        }
        if (change?.action === 'next-pass') {
          persist(advanceLocalPass(ballot));
          return json(200, ballotView(catalog.names));
        }
        const filename = catalog.names.find(([id]) => id === change?.take)?.[1];
        if (!filename || ![undefined, -1, 1].includes(change.vote)) return send(400);
        persist(applyLocalVote(ballot, filename, change.vote));
        return json(200, ballotView(catalog.names));
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return send(405);
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        return send(200, request.method === 'HEAD' ? '' : catalog.html);
      }

      const file = request.url?.slice(1);
      if (!file || !catalog.files.includes(file)) return send(404);
      const filename = path.join(output, file);
      const { size } = await stat(filename);
      const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      const start = range
        ? range[1]
          ? Number(range[1])
          : Math.max(0, size - Number(range[2]))
        : 0;
      const end = range?.[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      response.setHeader('Accept-Ranges', 'bytes');
      if ((request.headers.range && !range) || (range && !range[1] && !range[2]) || start > end) {
        response.setHeader('Content-Range', `bytes */${size}`);
        return send(416);
      }
      response.setHeader('Content-Type', 'audio/mpeg');
      response.setHeader('Content-Length', end - start + 1);
      if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      response.writeHead(range ? 206 : 200);
      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(filename, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      if (response.headersSent) response.destroy();
      else send(500);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}/`;
}
