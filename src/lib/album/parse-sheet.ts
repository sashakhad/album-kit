export type TrackSheetFile = {
  take: string;
  file: string;
  prompt: string;
};

export type TrackSheetPrompt = {
  lane: string;
  name: string;
  style: string;
};

export type TrackSheet = {
  title: string;
  settings: Record<string, string>;
  files: TrackSheetFile[];
  prompts: TrackSheetPrompt[];
};

const PROMPT_HEADING = /^##\s+(p\d+)\s*[—–-]\s*(.+?)\s*$/;
const SETTING_LINE = /^[-*]\s+([^:]+?):\s*(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

type Section =
  | { kind: 'preamble' }
  | { kind: 'files' }
  | { kind: 'prompt'; prompt: TrackSheetPrompt; paragraph: string[]; done: boolean }
  | { kind: 'other' };

export function parseTrackSheet(markdown: string): TrackSheet {
  const sheet: TrackSheet = { title: '', settings: {}, files: [], prompts: [] };
  let section: Section = { kind: 'preamble' };
  let tableHeaderSeen = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith('## ')) {
      finishPrompt(section);
      section = sectionFor(line);
      tableHeaderSeen = false;
      if (section.kind === 'prompt') {
        sheet.prompts.push(section.prompt);
      }
      continue;
    }

    if (section.kind === 'preamble') {
      if (sheet.title.length === 0 && /^#\s+/.test(line)) {
        sheet.title = line.replace(/^#\s+/, '').trim();
        continue;
      }
      const setting = SETTING_LINE.exec(line);
      const key = setting?.[1];
      const value = setting?.[2];
      if (key !== undefined && value !== undefined) {
        sheet.settings[stripBackticks(key)] = stripBackticks(value);
      }
      continue;
    }

    if (section.kind === 'files') {
      if (!line.startsWith('|')) {
        continue;
      }
      if (TABLE_SEPARATOR.test(line)) {
        tableHeaderSeen = true;
        continue;
      }
      if (!tableHeaderSeen) {
        continue;
      }
      const [take, file, prompt] = tableCells(line);
      if (take !== undefined && file !== undefined) {
        sheet.files.push({ take, file, prompt: prompt ?? '' });
      }
      continue;
    }

    if (section.kind === 'prompt' && !section.done) {
      if (line.length === 0) {
        if (section.paragraph.length > 0) {
          finishPrompt(section);
        }
        continue;
      }
      section.paragraph.push(line);
    }
  }

  finishPrompt(section);
  return sheet;
}

function sectionFor(headingLine: string): Section {
  const heading = headingLine.trim();
  const prompt = PROMPT_HEADING.exec(heading);
  const lane = prompt?.[1];
  const name = prompt?.[2];
  if (lane !== undefined && name !== undefined) {
    return {
      kind: 'prompt',
      prompt: { lane, name: name.trim(), style: '' },
      paragraph: [],
      done: false,
    };
  }

  if (/^##\s+canonical files\s*$/i.test(heading)) {
    return { kind: 'files' };
  }

  return { kind: 'other' };
}

function finishPrompt(section: Section): void {
  if (section.kind !== 'prompt' || section.done) {
    return;
  }
  if (section.paragraph.length === 0) {
    return;
  }
  section.prompt.style = section.paragraph.join(' ');
  section.done = true;
}

function tableCells(line: string): string[] {
  const inner = line.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(cell => stripBackticks(cell.trim()));
}

function stripBackticks(value: string): string {
  return value.replace(/`/g, '').trim();
}
