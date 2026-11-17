import { createReadStream, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

export async function servePreview({ output, files, names }) {
  const ballotPath = path.join(path.dirname(output), 'album-preview-ballot.json');
  let ballot = { selected: null, votes: {} };
  try {
    ballot = JSON.parse(readFileSync(ballotPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const ballotView = () => ({
    selected: [...names].find(([, filename]) => filename === ballot.selected)?.[0] ?? null,
    votes: Object.fromEntries(
      [...names].flatMap(([id, filename]) =>
        Object.hasOwn(ballot.votes, filename) ? [[id, ballot.votes[filename]]] : []
      )
    ),
  });

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
      if (request.url === '/ballot') {
        if (request.method === 'GET') return json(200, ballotView());
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
        const filename = names.get(change?.take);
        if (!filename || ![undefined, -1, 1].includes(change.vote)) return send(400);

        const votes = { ...ballot.votes };
        if (change.vote !== undefined) votes[filename] = (votes[filename] ?? 0) + change.vote;
        const next = { selected: filename, votes };
        const pending = `${ballotPath}.${process.pid}.new`;
        writeFileSync(pending, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        renameSync(pending, ballotPath);
        ballot = next;
        return json(200, ballotView());
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') return send(405);
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        return send(
          200,
          request.method === 'HEAD' ? '' : await readFile(path.join(output, 'Open Album.html'))
        );
      }

      const file = request.url?.slice(1);
      if (!file || !files.has(file)) return send(404);
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
