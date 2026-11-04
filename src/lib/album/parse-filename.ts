export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'] as const;

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

const AUDIO_EXTENSION_SET = new Set<string>(AUDIO_EXTENSIONS);

export function fileExtension(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) {
    return null;
  }
  return filename.slice(dot + 1).toLowerCase();
}

export function isAudioFilename(filename: string): boolean {
  const extension = fileExtension(filename);
  return extension !== null && AUDIO_EXTENSION_SET.has(extension);
}

export function parseTrackNumber(filename: string): number | null {
  const base = stripExtension(filename);
  const match = /^(?:v\d+[-_])?(?:track[\s_-]*)?(\d{1,2})(?:[\s._-]+|$)/i.exec(base);
  if (match === null) {
    return null;
  }

  const raw = match[1];
  if (raw === undefined) {
    return null;
  }

  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

export function parseTakeLabel(filename: string): string | null {
  const base = stripExtension(filename);
  const match = /-take([a-z]{1,2})(?:[-_]|$)/i.exec(base);
  const letter = match?.[1];
  if (letter === undefined) {
    return null;
  }
  return letter.toUpperCase();
}

export function titleFromFilename(filename: string): string {
  const base = stripExtension(filename);
  const stripped = base.replace(/^(?:track[\s_-]*)?\d{1,2}(?:[\s._-]+)?/i, '');
  const source = stripped.length > 0 ? stripped : base;
  return titleCaseWords(source.replace(/[-_]+/g, ' ').trim());
}

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
} as const satisfies Record<AudioExtension, string>;

export function isAudioExtension(value: string): value is AudioExtension {
  return AUDIO_EXTENSION_SET.has(value);
}

export function contentTypeForFilename(filename: string): string | null {
  const extension = fileExtension(filename);
  if (extension === null || !isAudioExtension(extension)) {
    return null;
  }
  return CONTENT_TYPES[extension];
}

export const CANONICAL_TAKE_PATTERN =
  /^(v\d+)-(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)-p(\d{1,2})-take([a-z]{1,2})\.mp3$/;

export type CanonicalTake = {
  setId: string;
  trackNumber: number;
  slug: string;
  promptLane: number;
  letter: string;
};

export function parseCanonicalTake(filename: string): CanonicalTake | null {
  const match = CANONICAL_TAKE_PATTERN.exec(filename);
  if (match === null) {
    return null;
  }

  const [, setId, trackNumber, slug, promptLane, letter] = match;
  if (
    setId === undefined ||
    trackNumber === undefined ||
    slug === undefined ||
    promptLane === undefined ||
    letter === undefined
  ) {
    return null;
  }

  return {
    setId,
    trackNumber: Number(trackNumber),
    slug,
    promptLane: Number(promptLane),
    letter: letter.toUpperCase(),
  };
}

export function canonicalTakeFilename(parts: CanonicalTake): string {
  const track = String(parts.trackNumber).padStart(2, '0');
  return `${parts.setId}-${track}-${parts.slug}-p${parts.promptLane}-take${parts.letter.toLowerCase()}.mp3`;
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) {
    return filename;
  }
  return filename.slice(0, dot);
}

function titleCaseWords(value: string): string {
  if (value.length === 0) {
    return value;
  }

  const titled: string[] = [];
  for (const word of value.split(' ')) {
    if (word.length === 0) {
      continue;
    }
    const first = word[0];
    if (first === undefined) {
      continue;
    }
    titled.push(`${first.toUpperCase()}${word.slice(1)}`);
  }

  return titled.join(' ');
}
