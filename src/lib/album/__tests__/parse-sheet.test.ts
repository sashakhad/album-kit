import { describe, expect, it } from 'vitest';

import { parseTrackSheet } from '../parse-sheet';

const SHEET = `# Track One

Track 01. Set v1 (Bubu). Blank Create.

- Title field: \`Track One\`
- Instrumental: ON
- Model: v5.5
- Lyrics: \`[Instrumental]\`
- Exclude: \`vocals, choir, vocal chops\`

## Canonical files

| Take | File                          | Prompt |
| ---- | ----------------------------- | ------ |
| A    | \`v1-01-track-one-p1-takea.mp3\` | p1     |
| B    | \`v1-01-track-one-p1-takeb.mp3\` | p1     |
| C    | \`v1-01-track-one-p2-takec.mp3\` | p2     |

## p1 — Warm room

Warm house in A minor, 122 BPM. Round bass, soft hats.
Long filter on the pads.

A second paragraph that is not the style.

## Notes

- Ignore: this section

## p2 – Cold room

Cold techno, 130 BPM. Dry kick.

## p10 - Hyphen lane

Hyphen separators work too.
`;

describe('parseTrackSheet', () => {
  it('reads the title, settings, files and prompts', () => {
    const sheet = parseTrackSheet(SHEET);

    expect(sheet.title).toBe('Track One');
    expect(sheet.settings).toEqual({
      'Title field': 'Track One',
      Instrumental: 'ON',
      Model: 'v5.5',
      Lyrics: '[Instrumental]',
      Exclude: 'vocals, choir, vocal chops',
    });
    expect(sheet.files).toEqual([
      { take: 'A', file: 'v1-01-track-one-p1-takea.mp3', prompt: 'p1' },
      { take: 'B', file: 'v1-01-track-one-p1-takeb.mp3', prompt: 'p1' },
      { take: 'C', file: 'v1-01-track-one-p2-takec.mp3', prompt: 'p2' },
    ]);
    expect(sheet.prompts).toEqual([
      {
        lane: 'p1',
        name: 'Warm room',
        style: 'Warm house in A minor, 122 BPM. Round bass, soft hats. Long filter on the pads.',
      },
      { lane: 'p2', name: 'Cold room', style: 'Cold techno, 130 BPM. Dry kick.' },
      { lane: 'p10', name: 'Hyphen lane', style: 'Hyphen separators work too.' },
    ]);
  });

  it('only reads settings before the first section', () => {
    const sheet = parseTrackSheet(SHEET);

    expect(sheet.settings).not.toHaveProperty('Ignore');
  });

  it('returns empty parts for a sheet with only a title', () => {
    expect(parseTrackSheet('# Lonely\n')).toEqual({
      title: 'Lonely',
      settings: {},
      files: [],
      prompts: [],
    });
  });

  it('keeps a prompt with no paragraph as an empty style', () => {
    const sheet = parseTrackSheet('# Two\n\n## p1 — Empty\n\n## p2 — Full\n\nStyle here.\n');

    expect(sheet.prompts).toEqual([
      { lane: 'p1', name: 'Empty', style: '' },
      { lane: 'p2', name: 'Full', style: 'Style here.' },
    ]);
  });
});
