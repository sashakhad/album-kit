/** Types for the vendored Fraunhofer FDK-AAC glue. The wasm instance is not shared. */
export interface FdkAacModule {
  _encoder_init(
    sampleRate: number,
    channels: number,
    bitrate: number,
    aot: number,
    transportType: number
  ): number;
  _encoder_encode(pcmPtr: number, numSamples: number, outPtr: number, outSizePtr: number): number;
  _encoder_get_asc(ascPtr: number, ascSizePtr: number): number;
  _encoder_get_frame_size(): number;
  _encoder_get_max_out_buf_bytes(): number;
  _encoder_close(): void;
  _decoder_init(transportType: number): number;
  _decoder_set_config(confPtr: number, confSize: number): number;
  _decoder_decode(
    aacPtr: number,
    aacSize: number,
    pcmPtr: number,
    pcmSizePtr: number,
    channelsPtr: number,
    sampleRatePtr: number
  ): number;
  _decoder_close(): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  HEAP32: Int32Array;
}

export default function createFdkAacModule(overrides?: {
  wasmBinary?: Uint8Array;
}): Promise<FdkAacModule>;
