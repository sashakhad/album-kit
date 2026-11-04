import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defaultAlbumRoot } from '@/lib/album/paths';

const SET_ID_PATTERN = /^v\d+$/;
const TRACK_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TAKE_LETTER_PATTERN = /^[A-Z]{1,2}$/;

const pinSchema = z.object({
  set: z.string(),
  take: z.string().regex(TAKE_LETTER_PATTERN, 'must be one or two capital letters, like A or AB'),
});

const albumConfigSchema = z
  .object({
    title: z.string().min(1, 'must be at least 1 character'),
    artist: z.string(),
    genre: z.string(),
    rule: z.string(),
    sets: z
      .array(
        z.object({
          id: z.string().regex(SET_ID_PATTERN, 'must look like v1, v2 and so on'),
          name: z.string(),
          blurb: z.string().optional(),
        })
      )
      .min(1, 'must have at least 1 set'),
    tracks: z.array(
      z.object({
        number: z
          .number()
          .int('must be a whole number')
          .min(1, 'must be 1 to 99')
          .max(99, 'must be 1 to 99'),
        title: z.string().min(1, 'must be at least 1 character'),
        slug: z
          .string()
          .regex(
            TRACK_SLUG_PATTERN,
            'must be lowercase letters and digits joined by single dashes'
          ),
        parked: z.boolean().optional(),
        listen: pinSchema.optional(),
        vip: pinSchema.extend({ title: z.string().optional() }).optional(),
      })
    ),
  })
  .superRefine((config, ctx) => {
    const setIds = new Set<string>();
    for (const [index, set] of config.sets.entries()) {
      if (setIds.has(set.id)) {
        ctx.addIssue({ code: 'custom', path: ['sets', index, 'id'], message: `repeats ${set.id}` });
      }
      setIds.add(set.id);
    }

    const numbers = new Set<number>();
    const slugs = new Set<string>();
    for (const [index, track] of config.tracks.entries()) {
      if (numbers.has(track.number)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tracks', index, 'number'],
          message: `repeats ${track.number}`,
        });
      }
      numbers.add(track.number);

      if (slugs.has(track.slug)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tracks', index, 'slug'],
          message: `repeats ${track.slug}`,
        });
      }
      slugs.add(track.slug);

      for (const pin of ['listen', 'vip'] as const) {
        const value = track[pin];
        if (value !== undefined && !setIds.has(value.set)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tracks', index, pin, 'set'],
            message: `names set ${value.set}, which is not in sets`,
          });
        }
      }
    }
  });

export type AlbumConfig = z.infer<typeof albumConfigSchema>;
export type AlbumConfigSet = AlbumConfig['sets'][number];
export type AlbumConfigTrack = AlbumConfig['tracks'][number];

export function albumConfigPath(): string {
  return path.join(defaultAlbumRoot(), 'album.json');
}

export function parseAlbumConfig(raw: unknown): AlbumConfig {
  const parsed = albumConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      issue => `${formatPath(issue.path)}: ${issue.message}`
    );
    throw new Error(`album/album.json is invalid. ${problems.join('; ')}`);
  }

  return {
    ...parsed.data,
    tracks: [...parsed.data.tracks].sort((left, right) => left.number - right.number),
  };
}

export async function loadAlbumConfig(): Promise<AlbumConfig> {
  const filePath = albumConfigPath();
  const text = await fs.readFile(filePath, 'utf8');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`album/album.json is not valid JSON. ${reason}`);
  }

  return parseAlbumConfig(raw);
}

function formatPath(issuePath: readonly PropertyKey[]): string {
  if (issuePath.length === 0) {
    return '(root)';
  }

  let formatted = '';
  for (const segment of issuePath) {
    if (typeof segment === 'number') {
      formatted += `[${segment}]`;
      continue;
    }
    formatted += formatted.length === 0 ? String(segment) : `.${String(segment)}`;
  }
  return formatted;
}
