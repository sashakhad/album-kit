import { isAbortError } from '@/lib/album/playback';
import { isDirectSunoStream, isVideoStream } from '@/lib/album/stream-url';

export type PlaybackFailure = {
  code: number | null;
  message: string;
};

export type ElementAttempt = {
  tag: 'audio' | 'video';
  crossOrigin: boolean;
};

type Settle =
  | { kind: 'played' }
  | { kind: 'aborted' }
  | { kind: 'gesture' }
  | { kind: 'failed'; failure: PlaybackFailure };

export type PlaybackListener = {
  onPlaying: () => void;
  onFailure: (message: string) => void;
  onNeedsGesture: (message: string) => void;
};

export type BufferedTake = {
  remote: string;
  objectUrl: string;
};

type StartPlaybackArgs = {
  url: string;
  audio: HTMLAudioElement | null;
  video: HTMLVideoElement | null;
  buffered: BufferedTake | null;
  fetchImpl?: typeof fetch;
  listener: PlaybackListener;
  onBuffer: (remote: string, objectUrl: string) => void;
};

const GESTURE_MESSAGE = 'Tap play again to start this take.';

export function elementAttempts(url: string): ElementAttempt[] {
  const primary: ElementAttempt['tag'] = isVideoStream(url) ? 'video' : 'audio';
  const secondary: ElementAttempt['tag'] = primary === 'video' ? 'audio' : 'video';
  return [
    { tag: primary, crossOrigin: false },
    { tag: primary, crossOrigin: true },
    { tag: secondary, crossOrigin: false },
    { tag: secondary, crossOrigin: true },
  ];
}

export function readMediaError(element: HTMLMediaElement): PlaybackFailure | null {
  const error = element.error;
  if (error === null || error === undefined || typeof error.code !== 'number') return null;
  const raw: unknown = error.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  return {
    code: error.code,
    message: message.length > 0 ? message : mediaErrorLabel(error.code),
  };
}

export function isSafetyCheck(failure: PlaybackFailure | null): boolean {
  if (failure === null) return false;
  return /url safety check|content security policy|refused to load media/i.test(failure.message);
}

export function formatPlaybackFailure(url: string, failure: PlaybackFailure): string {
  const code = failure.code === null ? 'unknown' : String(failure.code);
  return `Could not play this track. MediaError ${code}: ${failure.message} URL: ${url}`;
}

/** True when every policy allows `url` for `directive` (missing directives use default-src). */
export function policiesAllow(
  policies: readonly string[],
  directive: 'media-src' | 'connect-src',
  url: string,
  selfOrigin = 'null'
): boolean {
  for (const policy of policies) {
    if (!policyAllows(policy, directive, url, selfOrigin)) return false;
  }
  return true;
}

export function startTakePlayback(args: StartPlaybackArgs): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  const buffered = args.buffered;
  if (buffered !== null && buffered.remote === args.url) {
    const element = claimElement(args, isVideoStream(args.url) ? 'video' : 'audio');
    if (element !== null) {
      const pending = settlePlay(element, signal, {
        url: buffered.objectUrl,
        crossOrigin: false,
      });
      void finishBuffered(args, signal, pending);
      return () => controller.abort();
    }
  }
  const [first] = elementAttempts(args.url);
  const element = first === undefined ? null : claimElement(args, first.tag);
  if (first === undefined || element === null) {
    args.listener.onFailure(
      formatPlaybackFailure(args.url, { code: null, message: 'The media failed to load' })
    );
    return () => controller.abort();
  }
  // Set the source before the first await so a tap still counts as a user gesture.
  const pending = settlePlay(element, signal, { url: args.url, crossOrigin: first.crossOrigin });
  void finishAttempts(args, signal, pending, 0);
  return () => controller.abort();
}

async function finishBuffered(
  args: StartPlaybackArgs,
  signal: AbortSignal,
  pending: Promise<Settle>
): Promise<void> {
  const settled = await pending;
  if (signal.aborted || settled.kind === 'aborted') return;
  if (settled.kind === 'played') {
    args.listener.onPlaying();
    return;
  }
  if (settled.kind === 'gesture') {
    args.listener.onNeedsGesture(GESTURE_MESSAGE);
    return;
  }
  await reportAttempts(args, signal, 0, settled.failure);
}

async function finishAttempts(
  args: StartPlaybackArgs,
  signal: AbortSignal,
  pending: Promise<Settle>,
  index: number
): Promise<void> {
  const settled = await pending;
  if (signal.aborted || settled.kind === 'aborted') return;
  if (settled.kind === 'played') {
    args.listener.onPlaying();
    return;
  }
  if (settled.kind === 'gesture') {
    args.listener.onNeedsGesture(GESTURE_MESSAGE);
    return;
  }
  const attempts = elementAttempts(args.url);
  const nextIndex = isSafetyCheck(settled.failure) ? attempts.length : index + 1;
  await reportAttempts(args, signal, nextIndex, settled.failure);
}

async function reportAttempts(
  args: StartPlaybackArgs,
  signal: AbortSignal,
  index: number,
  last: PlaybackFailure
): Promise<void> {
  const attempts = elementAttempts(args.url);
  for (let cursor = index; cursor < attempts.length; cursor += 1) {
    if (signal.aborted) return;
    const attempt = attempts[cursor];
    if (attempt === undefined) continue;
    const element = claimElement(args, attempt.tag);
    if (element === null) continue;
    const settled = await settlePlay(element, signal, {
      url: args.url,
      crossOrigin: attempt.crossOrigin,
    });
    if (signal.aborted || settled.kind === 'aborted') return;
    if (settled.kind === 'played') {
      args.listener.onPlaying();
      return;
    }
    if (settled.kind === 'gesture') {
      args.listener.onNeedsGesture(GESTURE_MESSAGE);
      return;
    }
    last = settled.failure;
    if (isSafetyCheck(settled.failure)) break;
  }
  if (signal.aborted) return;
  if (!isDirectSunoStream(args.url)) {
    args.listener.onFailure(formatPlaybackFailure(args.url, last));
    return;
  }
  const fetched = await fetchStream(args, signal);
  if (signal.aborted || fetched === 'aborted') return;
  if (fetched.kind === 'failed') {
    args.listener.onFailure(
      formatPlaybackFailure(args.url, {
        code: last.code,
        message: `${last.message} Fetch: ${fetched.message}`,
      })
    );
    return;
  }
  const element = claimElement(args, isVideoStream(args.url) ? 'video' : 'audio');
  if (element === null) {
    args.listener.onFailure(formatPlaybackFailure(args.url, last));
    return;
  }
  const settled = await settlePlay(element, signal, { url: fetched.objectUrl, crossOrigin: false });
  if (signal.aborted || settled.kind === 'aborted') return;
  if (settled.kind === 'played') {
    args.listener.onPlaying();
    return;
  }
  if (settled.kind === 'gesture') {
    args.listener.onNeedsGesture(GESTURE_MESSAGE);
    return;
  }
  const sourced = await playMediaSource(fetched.bytes, fetched.mime, element, signal);
  if (signal.aborted || sourced === 'aborted') return;
  if (sourced === 'played') {
    args.listener.onPlaying();
    return;
  }
  args.listener.onFailure(formatPlaybackFailure(args.url, settled.failure));
}

function claimElement(args: StartPlaybackArgs, tag: 'audio' | 'video'): HTMLMediaElement | null {
  const active = tag === 'video' ? args.video : args.audio;
  const idle = tag === 'video' ? args.audio : args.video;
  if (idle !== null) {
    idle.pause();
    if (idle.getAttribute('src') !== null) {
      idle.removeAttribute('src');
      idle.load();
    }
  }
  return active;
}

function prepareElement(element: HTMLMediaElement, url: string, crossOrigin: boolean): void {
  element.setAttribute('referrerpolicy', 'no-referrer');
  if (crossOrigin) element.crossOrigin = 'anonymous';
  else element.removeAttribute('crossorigin');
  element.setAttribute('src', url);
}

function settlePlay(
  element: HTMLMediaElement,
  signal: AbortSignal,
  load?: { url: string; crossOrigin: boolean }
): Promise<Settle> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: Settle) => {
      if (settled) return;
      settled = true;
      element.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onError = () => {
      finish({ kind: 'failed', failure: failureOf(element) });
    };
    const onAbort = () => finish({ kind: 'aborted' });
    element.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
    if (load !== undefined) prepareElement(element, load.url, load.crossOrigin);
    let playing: Promise<void>;
    try {
      playing = element.play();
    } catch (error) {
      finish(thrownSettle(element, error));
      return;
    }
    void playing.then(
      () => {
        finish({ kind: 'played' });
      },
      (error: unknown) => {
        if (signal.aborted || isAbortError(error)) {
          finish({ kind: 'aborted' });
          return;
        }
        queueMicrotask(() => {
          const failure = readMediaError(element);
          if (failure !== null) {
            finish({ kind: 'failed', failure });
            return;
          }
          finish(thrownSettle(element, error));
        });
      }
    );
  });
}

function thrownSettle(element: HTMLMediaElement, error: unknown): Settle {
  const mediaError = readMediaError(element);
  if (mediaError !== null) return { kind: 'failed', failure: mediaError };
  if (error instanceof DOMException && error.name === 'NotAllowedError') return { kind: 'gesture' };
  const message = error instanceof Error ? error.message : 'The media failed to load';
  return { kind: 'failed', failure: { code: null, message } };
}

function failureOf(element: HTMLMediaElement): PlaybackFailure {
  return readMediaError(element) ?? { code: null, message: 'The media failed to load' };
}

type FetchResult =
  | 'aborted'
  | { kind: 'failed'; message: string }
  | { kind: 'ok'; objectUrl: string; bytes: ArrayBuffer; mime: string };

async function fetchStream(args: StartPlaybackArgs, signal: AbortSignal): Promise<FetchResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(args.url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!response.ok) return { kind: 'failed', message: `HTTP ${String(response.status)}` };
    const bytes = await response.arrayBuffer();
    if (signal.aborted) return 'aborted';
    const mime = mimeFor(response.headers.get('content-type'), args.url);
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    args.onBuffer(args.url, objectUrl);
    return { kind: 'ok', objectUrl, bytes, mime };
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return 'aborted';
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Fetch failed';
    return { kind: 'failed', message };
  }
}

function mimeFor(header: string | null, url: string): string {
  const value = header?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (value.startsWith('audio/') || value.startsWith('video/')) return value;
  return isVideoStream(url) ? 'video/mp4' : 'audio/mpeg';
}

async function playMediaSource(
  bytes: ArrayBuffer,
  mime: string,
  element: HTMLMediaElement,
  signal: AbortSignal
): Promise<'played' | 'failed' | 'aborted'> {
  if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mime)) return 'failed';
  const source = new MediaSource();
  const objectUrl = URL.createObjectURL(source);
  try {
    element.src = objectUrl;
    await waitForSourceOpen(source, signal);
    if (signal.aborted) return 'aborted';
    const buffer = source.addSourceBuffer(mime);
    await appendSourceBuffer(buffer, bytes);
    if (source.readyState === 'open') source.endOfStream();
    const settled = await settlePlay(element, signal);
    if (settled.kind === 'played') return 'played';
    if (settled.kind === 'aborted') return 'aborted';
    return 'failed';
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return 'aborted';
    return 'failed';
  }
}

function waitForSourceOpen(source: MediaSource, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => resolve();
    const onError = () => reject(new Error('MediaSource failed to open'));
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    source.addEventListener('sourceopen', onOpen, { once: true });
    source.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function appendSourceBuffer(buffer: SourceBuffer, bytes: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    buffer.addEventListener('updateend', () => resolve(), { once: true });
    buffer.addEventListener('error', () => reject(new Error('MediaSource buffer failed')), {
      once: true,
    });
    buffer.appendBuffer(bytes);
  });
}

function policyAllows(
  policy: string,
  directive: 'media-src' | 'connect-src',
  url: string,
  selfOrigin: string
): boolean {
  const sources = directiveSources(policy, directive);
  if (sources === null) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  for (const source of sources) {
    if (sourceMatches(source, parsed, selfOrigin)) return true;
  }
  return false;
}

function directiveSources(policy: string, name: 'media-src' | 'connect-src'): string[] | null {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part
      .trim()
      .split(/\s+/)
      .filter(token => token.length > 0);
    const directive = tokens[0];
    if (directive === undefined) continue;
    directives.set(directive, tokens.slice(1));
  }
  const chosen = directives.get(name) ?? directives.get('default-src');
  if (chosen === undefined || chosen.length === 0 || chosen[0] === "'none'") return null;
  return chosen;
}

function sourceMatches(source: string, url: URL, selfOrigin: string): boolean {
  if (source === '*') return true;
  if (source === "'self'") {
    if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'file:') {
      return false;
    }
    return url.origin === selfOrigin;
  }
  if (source.endsWith(':') && !source.includes('//')) return url.protocol === source;
  const wildcard = source.indexOf('*.');
  const hostSource =
    wildcard === -1 ? source : `${source.slice(0, wildcard)}wildcard.${source.slice(wildcard + 2)}`;
  let parsed: URL;
  try {
    parsed = new URL(hostSource);
  } catch {
    return false;
  }
  if (parsed.protocol !== url.protocol) return false;
  if (parsed.port !== '' && parsed.port !== url.port) return false;
  if (wildcard === -1) return parsed.hostname === url.hostname;
  const suffix = parsed.hostname.slice('wildcard.'.length);
  if (!url.hostname.endsWith(`.${suffix}`)) return false;
  const label = url.hostname.slice(0, url.hostname.length - suffix.length - 1);
  return label.length > 0 && !label.includes('.');
}

function mediaErrorLabel(code: number): string {
  if (code === 1) return 'MEDIA_ERR_ABORTED';
  if (code === 2) return 'MEDIA_ERR_NETWORK';
  if (code === 3) return 'MEDIA_ERR_DECODE';
  if (code === 4) return 'MEDIA_ERR_SRC_NOT_SUPPORTED';
  return 'MEDIA_ERR_UNKNOWN';
}
