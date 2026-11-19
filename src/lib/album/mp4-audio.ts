/**
 * ISO BMFF helpers for public Suno MP4s.
 * Suno puts the movie header at the end of the file and muxes a picture with the AAC.
 * These functions copy or rebuild the audio track only. They do not decode samples.
 */

const MVHD = [0x6d, 0x76, 0x68, 0x64];

export type AacTrack = {
  sampleRate: number;
  channels: number;
  /** Duration from the audio media header, in seconds. */
  seconds: number;
  /** Samples per AAC frame, in `sampleRate` units. */
  sampleDelta: number;
  asc: Uint8Array;
  frames: Uint8Array[];
};

type Box = { type: string; start: number; header: number; end: number };

/** Last sane `mvhd` duration. A tail download still finds the header Suno writes at the end. */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  let found: number | null = null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 4; index + 24 < bytes.length; index += 1) {
    if (
      bytes[index] !== MVHD[0] ||
      bytes[index + 1] !== MVHD[1] ||
      bytes[index + 2] !== MVHD[2] ||
      bytes[index + 3] !== MVHD[3]
    ) {
      continue;
    }
    const version = bytes[index + 4];
    if (version !== 0 && version !== 1) continue;
    let timescale = 0;
    let duration = 0;
    if (version === 0) {
      if (index + 24 > bytes.length) continue;
      timescale = view.getUint32(index + 16);
      duration = view.getUint32(index + 20);
    } else {
      if (index + 36 > bytes.length) continue;
      timescale = view.getUint32(index + 24);
      duration = Number(view.getBigUint64(index + 28));
    }
    if (timescale < 1 || timescale > 1_000_000) continue;
    const seconds = duration / timescale;
    if (seconds >= 0.05 && seconds <= 60 * 60) found = seconds;
  }
  return found;
}

/** Audio-only MP4 with the movie header first, so a player knows the length immediately. */
export function stripMp4ToM4a(bytes: Uint8Array): { bytes: Uint8Array; seconds: number } | null {
  const track = extractAacTrack(bytes);
  if (track === null) return null;
  return { bytes: buildM4a(track), seconds: track.seconds };
}

export function extractAacTrack(bytes: Uint8Array): AacTrack | null {
  const root = readBoxes(bytes, 0, bytes.length);
  const moov = root.find(box => box.type === 'moov');
  if (moov === undefined) return null;
  for (const trak of readBoxes(bytes, moov.start + moov.header, moov.end)) {
    if (trak.type !== 'trak') continue;
    const track = readAudioTrack(bytes, trak);
    if (track !== null) return track;
  }
  return null;
}

export function buildM4a(track: AacTrack): Uint8Array {
  const ftyp = box(
    'ftyp',
    concat([fourcc('M4A '), u32(0), fourcc('M4A '), fourcc('mp42'), fourcc('isom')])
  );
  const placeholder = buildMoov(track, 0);
  const dataOffset = ftyp.length + placeholder.length + 8;
  const moov = buildMoov(track, dataOffset);
  const payload = concat(track.frames);
  return concat([ftyp, moov, box('mdat', payload)]);
}

function readAudioTrack(bytes: Uint8Array, trak: Box): AacTrack | null {
  const mdia = child(bytes, trak, 'mdia');
  if (mdia === null) return null;
  const hdlr = child(bytes, mdia, 'hdlr');
  if (hdlr === null) return null;
  const handlerAt = hdlr.start + hdlr.header + 8;
  if (handlerAt + 4 > hdlr.end) return null;
  if (text(bytes, handlerAt, 4) !== 'soun') return null;
  const mdhd = child(bytes, mdia, 'mdhd');
  const minf = child(bytes, mdia, 'minf');
  if (mdhd === null || minf === null) return null;
  const timing = readMdhd(bytes, mdhd);
  if (timing === null) return null;
  const stbl = child(bytes, minf, 'stbl');
  if (stbl === null) return null;
  const stsd = child(bytes, stbl, 'stsd');
  const stsc = child(bytes, stbl, 'stsc');
  const stsz = child(bytes, stbl, 'stsz');
  const stco = child(bytes, stbl, 'stco') ?? child(bytes, stbl, 'co64');
  if (stsd === null || stsc === null || stsz === null || stco === null) return null;
  const described = readMp4a(bytes, stsd);
  if (described === null) return null;
  const sampleDelta = readSampleDelta(bytes, child(bytes, stbl, 'stts')) ?? 1024;
  const frames = readFrames(bytes, stsc, stsz, stco);
  if (frames === null || frames.length === 0) return null;
  const sampleRate = timing.timescale > 0 ? timing.timescale : described.sampleRate;
  if (sampleRate < 1 || described.channels < 1) return null;
  return {
    sampleRate,
    channels: described.channels,
    seconds: timing.seconds,
    sampleDelta,
    asc: described.asc,
    frames,
  };
}

function readMdhd(bytes: Uint8Array, box: Box): { timescale: number; seconds: number } | null {
  const payload = box.start + box.header;
  if (payload >= bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[payload];
  if (version === 0) {
    if (payload + 20 > box.end) return null;
    const timescale = view.getUint32(payload + 12);
    const duration = view.getUint32(payload + 16);
    if (timescale < 1) return null;
    return { timescale, seconds: duration / timescale };
  }
  if (version === 1) {
    if (payload + 32 > box.end) return null;
    const timescale = view.getUint32(payload + 20);
    const duration = Number(view.getBigUint64(payload + 24));
    if (timescale < 1) return null;
    return { timescale, seconds: duration / timescale };
  }
  return null;
}

function readMp4a(
  bytes: Uint8Array,
  stsd: Box
): { channels: number; sampleRate: number; asc: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payload = stsd.start + stsd.header;
  if (payload + 8 > stsd.end) return null;
  const entry = payload + 8;
  if (entry + 36 > stsd.end || text(bytes, entry + 4, 4) !== 'mp4a') return null;
  const channels = view.getUint16(entry + 24);
  const sampleRate = view.getUint32(entry + 32) >>> 16;
  const asc = findAsc(bytes, entry + 36, stsd.end);
  if (asc === null || asc.length === 0) return null;
  return { channels: channels === 0 ? 2 : channels, sampleRate, asc };
}

function findAsc(bytes: Uint8Array, start: number, end: number): Uint8Array | null {
  const boxes = readBoxes(bytes, start, end);
  const esds = boxes.find(entry => entry.type === 'esds');
  if (esds === undefined) {
    for (const entry of boxes) {
      const nested = findAsc(bytes, entry.start + entry.header, entry.end);
      if (nested !== null) return nested;
    }
    return null;
  }
  return descriptorAsc(bytes, esds.start + esds.header + 4, esds.end);
}

function descriptorAsc(bytes: Uint8Array, start: number, end: number): Uint8Array | null {
  let offset = start;
  while (offset + 2 <= end) {
    const tag = bytes[offset];
    const length = descriptorLength(bytes, offset + 1);
    if (length === null || length.next + length.value > end) return null;
    const body = length.next;
    const bodyEnd = body + length.value;
    if (tag === 0x05) return bytes.slice(body, bodyEnd);
    let child = body;
    if (tag === 0x03 && body + 3 <= bodyEnd) child = body + 3;
    if (tag === 0x04 && body + 13 <= bodyEnd) child = body + 13;
    const nested = descriptorAsc(bytes, child, bodyEnd);
    if (nested !== null) return nested;
    offset = bodyEnd;
  }
  return null;
}

function descriptorLength(
  bytes: Uint8Array,
  offset: number
): { value: number; next: number } | null {
  let value = 0;
  let next = offset;
  for (let count = 0; count < 4; count += 1) {
    if (next >= bytes.length) return null;
    const byte = bytes[next] ?? 0;
    next += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next };
  }
  return null;
}

function readSampleDelta(bytes: Uint8Array, stts: Box | null): number | null {
  if (stts === null) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payload = stts.start + stts.header;
  if (payload + 8 > stts.end) return null;
  const entries = view.getUint32(payload + 4);
  if (entries < 1 || payload + 16 > stts.end) return null;
  const delta = view.getUint32(payload + 12);
  return delta > 0 ? delta : null;
}

function readFrames(bytes: Uint8Array, stsc: Box, stsz: Box, stco: Box): Uint8Array[] | null {
  const chunks = readChunks(bytes, stsc);
  const sizes = readSampleSizes(bytes, stsz);
  const offsets = readChunkOffsets(bytes, stco);
  if (chunks === null || sizes === null || offsets === null) return null;
  if (offsets.length === 0 || sizes.length === 0) return null;
  const frames: Uint8Array[] = [];
  let sampleIndex = 0;
  for (let chunk = 0; chunk < offsets.length; chunk += 1) {
    const perChunk = samplesInChunk(chunks, chunk + 1);
    let offset = offsets[chunk] ?? 0;
    for (let index = 0; index < perChunk; index += 1) {
      const size = sizes[sampleIndex] ?? 0;
      sampleIndex += 1;
      if (size < 1 || offset < 0 || offset + size > bytes.length) return null;
      frames.push(bytes.slice(offset, offset + size));
      offset += size;
    }
  }
  if (sampleIndex !== sizes.length) return null;
  return frames;
}

function readChunks(bytes: Uint8Array, stsc: Box): { first: number; count: number }[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payload = stsc.start + stsc.header;
  if (payload + 8 > stsc.end) return null;
  const entries = view.getUint32(payload + 4);
  const chunks: { first: number; count: number }[] = [];
  for (let index = 0; index < entries; index += 1) {
    const at = payload + 8 + index * 12;
    if (at + 12 > stsc.end) return null;
    chunks.push({ first: view.getUint32(at), count: view.getUint32(at + 4) });
  }
  return chunks;
}

function samplesInChunk(chunks: { first: number; count: number }[], chunkNumber: number): number {
  let count = chunks[0]?.count ?? 0;
  for (const entry of chunks) {
    if (entry.first <= chunkNumber) count = entry.count;
  }
  return count;
}

function readSampleSizes(bytes: Uint8Array, stsz: Box): number[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payload = stsz.start + stsz.header;
  if (payload + 12 > stsz.end) return null;
  const uniform = view.getUint32(payload + 4);
  const count = view.getUint32(payload + 8);
  const sizes: number[] = [];
  if (uniform > 0) {
    for (let index = 0; index < count; index += 1) sizes.push(uniform);
    return sizes;
  }
  if (payload + 12 + count * 4 > stsz.end) return null;
  for (let index = 0; index < count; index += 1) {
    sizes.push(view.getUint32(payload + 12 + index * 4));
  }
  return sizes;
}

function readChunkOffsets(bytes: Uint8Array, stco: Box): number[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payload = stco.start + stco.header;
  if (payload + 8 > stco.end) return null;
  const count = view.getUint32(payload + 4);
  const wide = stco.type === 'co64';
  const width = wide ? 8 : 4;
  if (payload + 8 + count * width > stco.end) return null;
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = payload + 8 + index * width;
    offsets.push(wide ? Number(view.getBigUint64(at)) : view.getUint32(at));
  }
  return offsets;
}

function buildMoov(track: AacTrack, dataOffset: number): Uint8Array {
  const frameCount = track.frames.length;
  const mediaDuration = frameCount * track.sampleDelta;
  const movieDuration = Math.max(1, Math.round(track.seconds * 1000));
  const mvhd = fullBox(
    'mvhd',
    0,
    0,
    concat([
      u32(0),
      u32(0),
      u32(1000),
      u32(movieDuration),
      u32(0x00010000),
      u16(0x0100),
      u16(0),
      u32(0),
      u32(0),
      matrix(),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(2),
    ])
  );
  const tkhd = fullBox(
    'tkhd',
    0,
    7,
    concat([
      u32(0),
      u32(0),
      u32(1),
      u32(0),
      u32(movieDuration),
      u32(0),
      u32(0),
      u16(0),
      u16(0),
      u16(0x0100),
      u16(0),
      matrix(),
      u32(0),
      u32(0),
    ])
  );
  const mdhd = fullBox(
    'mdhd',
    0,
    0,
    concat([u32(0), u32(0), u32(track.sampleRate), u32(mediaDuration), u16(0x55c4), u16(0)])
  );
  const hdlr = fullBox(
    'hdlr',
    0,
    0,
    concat([u32(0), fourcc('soun'), u32(0), u32(0), u32(0), ascii('SoundHandler\0')])
  );
  const smhd = fullBox('smhd', 0, 0, concat([u16(0), u16(0)]));
  const url = fullBox('url ', 0, 1, new Uint8Array());
  const dref = fullBox('dref', 0, 0, concat([u32(1), url]));
  const dinf = box('dinf', dref);
  const stsd = fullBox('stsd', 0, 0, concat([u32(1), mp4aEntry(track)]));
  const stts = fullBox('stts', 0, 0, concat([u32(1), u32(frameCount), u32(track.sampleDelta)]));
  const stsc = fullBox('stsc', 0, 0, concat([u32(1), u32(1), u32(frameCount), u32(1)]));
  const sizes: Uint8Array[] = [u32(0), u32(frameCount)];
  for (const frame of track.frames) sizes.push(u32(frame.length));
  const stsz = fullBox('stsz', 0, 0, concat(sizes));
  const stco = fullBox('stco', 0, 0, concat([u32(1), u32(dataOffset)]));
  const stbl = box('stbl', concat([stsd, stts, stsc, stsz, stco]));
  const minf = box('minf', concat([smhd, dinf, stbl]));
  const mdia = box('mdia', concat([mdhd, hdlr, minf]));
  const trak = box('trak', concat([tkhd, mdia]));
  return box('moov', concat([mvhd, trak]));
}

function mp4aEntry(track: AacTrack): Uint8Array {
  const esds = box('esds', concat([u32(0), esDescriptor(track)]));
  const header = new Uint8Array(36);
  const view = new DataView(header.buffer);
  view.setUint32(0, 36 + esds.length);
  header.set(fourcc('mp4a'), 4);
  view.setUint16(14, 1);
  view.setUint16(24, track.channels);
  view.setUint16(26, 16);
  view.setUint32(32, track.sampleRate << 16);
  return concat([header, esds]);
}

function esDescriptor(track: AacTrack): Uint8Array {
  const specific = descriptor(0x05, track.asc);
  const avg = Math.max(
    1,
    Math.round((concat(track.frames).length * 8) / Math.max(track.seconds, 0.001))
  );
  const configBody = concat([
    new Uint8Array([0x40, 0x15, 0x00, 0x00, 0x00]),
    u32(avg),
    u32(avg),
    specific,
  ]);
  const config = descriptor(0x04, configBody);
  const esBody = concat([
    u16(1),
    new Uint8Array([0]),
    config,
    descriptor(0x06, new Uint8Array([2])),
  ]);
  return descriptor(0x03, esBody);
}

function descriptor(tag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 1 + body.length);
  out[0] = tag;
  out[1] = body.length;
  out.set(body, 2);
  return out;
}

function child(bytes: Uint8Array, parent: Box, type: string): Box | null {
  return (
    readBoxes(bytes, parent.start + parent.header, parent.end).find(entry => entry.type === type) ??
    null
  );
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = text(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    boxes.push({ type, start: offset, header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function fullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array {
  const head = new Uint8Array(4);
  const view = new DataView(head.buffer);
  view.setUint32(0, (version << 24) | flags);
  return box(type, concat([head, payload]));
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(fourcc(type), 4);
  out.set(payload, 8);
  return out;
}

function matrix(): Uint8Array {
  return concat([
    u32(0x00010000),
    u32(0),
    u32(0),
    u32(0),
    u32(0x00010000),
    u32(0),
    u32(0),
    u32(0),
    u32(0x40000000),
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0);
  return bytes;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value & 0xffff);
  return bytes;
}

function fourcc(type: string): Uint8Array {
  return Uint8Array.from(type.slice(0, 4).padEnd(4, ' '), char => char.charCodeAt(0));
}

function ascii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index);
  return bytes;
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1)
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}
