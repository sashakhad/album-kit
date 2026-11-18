import { deflateSync, crc32 } from 'node:zlib';

const WIDTH = 480;
const HEIGHT = 640;

const COLOR = {
  background: [20, 20, 20],
  panel: [32, 32, 32],
  ink: [245, 245, 245],
  muted: [168, 168, 168],
  play: [245, 245, 245],
  playInk: [20, 20, 20],
  chip: [48, 48, 48],
};

// 5×7 capitals, digits, and the punctuation album titles use.
const GLYPHS = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 6, 8, 16, 31],
  3: [14, 17, 1, 6, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  "'": [4, 4, 4, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 4, 4],
  ',': [0, 0, 0, 0, 4, 4, 8],
  '&': [12, 18, 20, 8, 21, 18, 13],
};

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    raw[start] = 0;
    rgb.copy(raw, start + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fill(pixels, x, y, width, height, color) {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(WIDTH, x + width);
  const bottom = Math.min(HEIGHT, y + height);
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const index = (row * WIDTH + column) * 3;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
    }
  }
}

function glyphFor(character) {
  const upper = character.toUpperCase();
  return GLYPHS[upper] ?? GLYPHS[character] ?? null;
}

function textWidth(text, scale) {
  let width = 0;
  for (const character of text) {
    width += glyphFor(character) ? 6 * scale : 4 * scale;
  }
  return width;
}

function drawText(pixels, text, x, y, scale, color) {
  let cursor = x;
  for (const character of text) {
    const glyph = glyphFor(character);
    if (!glyph) {
      cursor += 4 * scale;
      continue;
    }
    for (let row = 0; row < glyph.length; row += 1) {
      const bits = glyph[row];
      for (let column = 0; column < 5; column += 1) {
        if ((bits & (1 << (4 - column))) === 0) continue;
        fill(pixels, cursor + column * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
}

function fitText(text, scale, maxWidth) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (textWidth(clean, scale) <= maxWidth) return clean;
  let fitted = '';
  for (const character of clean) {
    const next = `${fitted}${character}`;
    if (textWidth(`${next}...`, scale) > maxWidth) break;
    fitted = next;
  }
  return `${fitted.trimEnd()}...`;
}

function trackLetters(track) {
  if (Array.isArray(track.letters) && track.letters.length > 0) return track.letters;
  if (Array.isArray(track.takes)) {
    const letters = [];
    for (const take of track.takes) {
      const letter = typeof take === 'string' ? take : take?.letter;
      if (typeof letter === 'string' && letter.length > 0) letters.push(letter);
    }
    return letters;
  }
  return [];
}

export function renderAlbumPagePng({ title, tracks }) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  fill(pixels, 0, 0, WIDTH, HEIGHT, COLOR.background);
  fill(pixels, 28, 28, WIDTH - 56, HEIGHT - 56, COLOR.panel);

  drawText(pixels, 'LISTEN', 52, 56, 2, COLOR.muted);
  drawText(pixels, fitText(title || 'Album', 3, 376), 52, 88, 3, COLOR.ink);
  drawText(pixels, 'AN ALBUM IN THE MAKING', 52, 132, 1, COLOR.muted);

  fill(pixels, 52, 168, 112, 36, COLOR.play);
  drawText(pixels, 'PLAY', 78, 178, 2, COLOR.playInk);

  drawText(pixels, 'TRACKS', 52, 232, 2, COLOR.muted);

  const rows = Array.isArray(tracks) ? tracks.slice(0, 6) : [];
  let y = 268;
  for (const track of rows) {
    const name = typeof track?.title === 'string' ? track.title : 'Track';
    drawText(pixels, fitText(name, 2, 280), 52, y + 6, 2, COLOR.ink);
    const letters = trackLetters(track).slice(0, 4);
    let chipX = 340;
    for (const letter of letters) {
      fill(pixels, chipX, y, 28, 28, COLOR.chip);
      drawText(pixels, String(letter).slice(0, 1).toUpperCase(), chipX + 8, y + 7, 2, COLOR.ink);
      chipX += 34;
    }
    y += 44;
  }
  if (Array.isArray(tracks) && tracks.length > rows.length) {
    drawText(pixels, `+ ${tracks.length - rows.length} MORE`, 52, y + 8, 1, COLOR.muted);
  }
  if (rows.length === 0) {
    drawText(pixels, 'TAKES LAND HERE', 52, 280, 2, COLOR.muted);
  }

  return encodePng(WIDTH, HEIGHT, pixels);
}
