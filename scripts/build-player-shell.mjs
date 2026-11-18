#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const inputRoots = [
  'scripts/build-player-shell.mjs',
  'src/app/globals.css',
  'src/components/album',
  'src/components/ui/button.tsx',
  'src/preview',
  'src/lib/formatters.ts',
  'src/lib/utils.ts',
  'src/lib/album/listen.ts',
  'src/lib/album/playback.ts',
  'src/lib/album/play-path.ts',
  'src/lib/album/preview-listen.ts',
  'src/lib/album/slug.ts',
  'src/lib/album/stream-url.ts',
  'src/lib/album/types.ts',
  'src/lib/votes/tally.ts',
  'src/lib/votes/types.ts',
];

const stampedPackages = [
  'esbuild',
  'postcss',
  'react',
  'react-dom',
  'tailwindcss',
  '@tailwindcss/postcss',
  'next',
  'lucide-react',
];

function filesUnder(relative) {
  const absolute = path.join(root, relative);
  const stat = statSync(absolute);
  if (stat.isFile()) return [relative];
  const found = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(child));
    else if (/\.(tsx?|css|mjs)$/.test(entry.name)) found.push(child);
  }
  return found;
}

export function shellInputs() {
  const files = [];
  for (const relative of inputRoots) files.push(...filesUnder(relative));
  files.sort();
  return files;
}

export function shellStamp() {
  const hash = createHash('sha256');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const name of stampedPackages) {
    hash.update(name);
    hash.update(String(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? ''));
  }
  for (const relative of shellInputs()) {
    hash.update(relative);
    hash.update(readFileSync(path.join(root, relative)));
  }
  return hash.digest('hex').slice(0, 20);
}

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

function fontFace(family, filename, range) {
  const fontDir = path.join(
    path.dirname(require.resolve('next/package.json')),
    'dist/next-devtools/server/font'
  );
  const data = readFileSync(path.join(fontDir, filename)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:100 900;font-style:normal;font-display:swap;unicode-range:${range}}`;
}

export async function buildPlayerShell() {
  const cssPath = path.join(root, 'src/app/globals.css');
  const compiled = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), {
    from: cssPath,
  });
  const fonts = [
    fontFace('Geist', 'geist-latin.woff2', LATIN),
    fontFace('Geist', 'geist-latin-ext.woff2', LATIN_EXT),
    fontFace('Geist Mono', 'geist-mono-latin.woff2', LATIN),
    fontFace('Geist Mono', 'geist-mono-latin-ext.woff2', LATIN_EXT),
  ].join('');
  const css = `${fonts}${compiled.css}`.replaceAll('</style', '<\\/style');
  const bundled = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/preview/standalone.tsx'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      'next/link': path.join(root, 'src/preview/shims/next-link.tsx'),
      'next/navigation': path.join(root, 'src/preview/shims/next-navigation.ts'),
      'server-only': path.join(root, 'src/preview/shims/empty.ts'),
    },
    plugins: [
      {
        name: 'at-alias',
        setup(build) {
          build.onResolve({ filter: /^@\// }, args => {
            const base = path.join(root, 'src', args.path.slice(2));
            const candidates = [
              base,
              `${base}.tsx`,
              `${base}.ts`,
              `${base}.mjs`,
              path.join(base, 'index.ts'),
              path.join(base, 'index.tsx'),
            ];
            const resolved = candidates.find(
              candidate => existsSync(candidate) && statSync(candidate).isFile()
            );
            if (resolved === undefined) {
              return { path: base };
            }
            return { path: resolved };
          });
        },
      },
    ],
  });
  const jsFile = bundled.outputFiles?.[0];
  if (jsFile === undefined) throw new Error('The listen player bundle was empty.');
  const js = jsFile.text.replaceAll('</script', '<\\/script');
  const stamp = shellStamp();
  return `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; media-src 'self' file: https://*.suno.ai; base-uri 'none'; form-action 'none'"
    />
    <title>___ALBUM_TITLE___</title>
    <style>${css}</style>
  </head>
  <body class="font-sans antialiased">
    <div id="album-root"></div>
    <script type="application/json" id="album-data">___ALBUM_DATA___</script>
    <script>const albumKey = ___ALBUM_KEY___;</script>
    <script>${js}</script>
  </body>
</html>
<!-- player-shell ${stamp} -->
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPlayerShell()
    .then(html => {
      const destination = path.join(root, 'scripts/player-shell.html');
      writeFileSync(destination, html);
      process.stdout.write(`${destination}\n`);
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
