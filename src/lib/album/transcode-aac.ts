import { readFile } from 'node:fs/promises';

import { buildM4a, type AacTrack } from './mp4-audio.ts';
import createFdkAacModule, { type FdkAacModule } from './vendor/fdk-aac.js';

const AAC_LC = 2;
const RAW_AAC = 0;
const PCM_BYTES = 8 * 2048 * 2;

let modulePromise: Promise<FdkAacModule> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Re-encode one AAC track at `bitrate` bits per second.
 * The codec wasm keeps a single encoder, so calls run one at a time.
 * Returns null when the track cannot be decoded.
 */
export async function transcodeAacToM4a(
  track: AacTrack,
  bitrate: number
): Promise<{ bytes: Uint8Array; seconds: number } | null> {
  const run = queue.then(() => transcodeOne(track, bitrate));
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function transcodeOne(
  track: AacTrack,
  bitrate: number
): Promise<{ bytes: Uint8Array; seconds: number } | null> {
  const wasm = await loadModule();
  if (wasm._decoder_init(RAW_AAC) !== 0) return null;
  const ascPtr = wasm._malloc(track.asc.length);
  wasm.HEAPU8.set(track.asc, ascPtr);
  const configured = wasm._decoder_set_config(ascPtr, track.asc.length);
  wasm._free(ascPtr);
  if (configured !== 0) {
    wasm._decoder_close();
    return null;
  }
  let aacPtr = wasm._malloc(8192);
  let aacCap = 8192;
  const pcmBuf = wasm._malloc(PCM_BYTES);
  const pcmSizePtr = wasm._malloc(4);
  const channelsPtr = wasm._malloc(4);
  const ratePtr = wasm._malloc(4);
  const decoded: Int16Array[] = [];
  let channels = track.channels;
  let sampleRate = track.sampleRate;
  try {
    for (const frame of track.frames) {
      if (frame.length > aacCap) {
        wasm._free(aacPtr);
        aacCap = frame.length;
        aacPtr = wasm._malloc(aacCap);
      }
      if (aacPtr === 0) return null;
      wasm.HEAPU8.set(frame, aacPtr);
      const decodedFrame = decodeFrame(
        wasm,
        aacPtr,
        frame.length,
        pcmBuf,
        pcmSizePtr,
        channelsPtr,
        ratePtr
      );
      if (decodedFrame === null) return null;
      if (decodedFrame.samples.length > 0) decoded.push(decodedFrame.samples);
      if (decodedFrame.channels > 0) channels = decodedFrame.channels;
      if (decodedFrame.sampleRate > 0) sampleRate = decodedFrame.sampleRate;
    }
  } finally {
    wasm._free(aacPtr);
    wasm._free(pcmBuf);
    wasm._free(pcmSizePtr);
    wasm._free(channelsPtr);
    wasm._free(ratePtr);
    wasm._decoder_close();
  }
  if (decoded.length === 0 || channels < 1 || sampleRate < 1) return null;
  const pcm = joinSamples(decoded);
  return encodeM4a(wasm, pcm, sampleRate, channels, bitrate);
}

function decodeFrame(
  wasm: FdkAacModule,
  aacPtr: number,
  aacSize: number,
  pcmBuf: number,
  pcmSizePtr: number,
  channelsPtr: number,
  ratePtr: number
): { samples: Int16Array; channels: number; sampleRate: number } | null {
  wasm.HEAP32[pcmSizePtr >> 2] = 0;
  wasm.HEAP32[channelsPtr >> 2] = 0;
  wasm.HEAP32[ratePtr >> 2] = 0;
  if (wasm._decoder_decode(aacPtr, aacSize, pcmBuf, pcmSizePtr, channelsPtr, ratePtr) !== 0) {
    return null;
  }
  const count = wasm.HEAP32[pcmSizePtr >> 2] ?? 0;
  const channels = wasm.HEAP32[channelsPtr >> 2] ?? 0;
  const sampleRate = wasm.HEAP32[ratePtr >> 2] ?? 0;
  if (count <= 0) return { samples: new Int16Array(), channels, sampleRate };
  const samples = new Int16Array(count);
  samples.set(wasm.HEAP16.subarray(pcmBuf >> 1, (pcmBuf >> 1) + count));
  return { samples, channels, sampleRate };
}

function encodeM4a(
  wasm: FdkAacModule,
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
  bitrate: number
): { bytes: Uint8Array; seconds: number } | null {
  if (wasm._encoder_init(sampleRate, channels, bitrate, AAC_LC, RAW_AAC) !== 0) return null;
  const frameSize = wasm._encoder_get_frame_size();
  const maxOut = wasm._encoder_get_max_out_buf_bytes();
  if (frameSize < 1 || maxOut < 1) {
    wasm._encoder_close();
    return null;
  }
  const ascPtr = wasm._malloc(64);
  const ascSizePtr = wasm._malloc(4);
  if (wasm._encoder_get_asc(ascPtr, ascSizePtr) !== 0) {
    wasm._free(ascPtr);
    wasm._free(ascSizePtr);
    wasm._encoder_close();
    return null;
  }
  const ascSize = wasm.HEAP32[ascSizePtr >> 2] ?? 0;
  const asc = wasm.HEAPU8.slice(ascPtr, ascPtr + ascSize);
  wasm._free(ascPtr);
  wasm._free(ascSizePtr);
  if (asc.length === 0) {
    wasm._encoder_close();
    return null;
  }
  const frameSamples = frameSize * channels;
  const pcmPtr = wasm._malloc(frameSamples * 2);
  const outPtr = wasm._malloc(maxOut);
  const outSizePtr = wasm._malloc(4);
  const frames: Uint8Array[] = [];
  try {
    for (let offset = 0; offset < pcm.length; offset += frameSamples) {
      const chunk = Math.min(frameSamples, pcm.length - offset);
      wasm.HEAP16.set(pcm.subarray(offset, offset + chunk), pcmPtr >> 1);
      if (chunk < frameSamples) {
        wasm.HEAP16.fill(0, (pcmPtr >> 1) + chunk, (pcmPtr >> 1) + frameSamples);
      }
      wasm.HEAP32[outSizePtr >> 2] = 0;
      if (wasm._encoder_encode(pcmPtr, frameSamples, outPtr, outSizePtr) !== 0) return null;
      const outBytes = wasm.HEAP32[outSizePtr >> 2] ?? 0;
      if (outBytes > 0) frames.push(wasm.HEAPU8.slice(outPtr, outPtr + outBytes));
    }
  } finally {
    wasm._free(pcmPtr);
    wasm._free(outPtr);
    wasm._free(outSizePtr);
    wasm._encoder_close();
  }
  if (frames.length === 0) return null;
  const seconds = (frames.length * frameSize) / sampleRate;
  return {
    bytes: buildM4a({
      sampleRate,
      channels,
      seconds,
      sampleDelta: frameSize,
      asc,
      frames,
    }),
    seconds,
  };
}

function joinSamples(chunks: Int16Array[]): Int16Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const joined = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

async function loadModule(): Promise<FdkAacModule> {
  if (modulePromise === null) {
    modulePromise = readFile(new URL('./vendor/fdk-aac.wasm', import.meta.url)).then(bytes =>
      createFdkAacModule({ wasmBinary: new Uint8Array(bytes) })
    );
  }
  try {
    return await modulePromise;
  } catch (error) {
    modulePromise = null;
    throw error;
  }
}
