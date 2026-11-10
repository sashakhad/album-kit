// Remove the common MP3 metadata containers before a take reaches a listening store.
export function stripMp3Tags(bytes: Uint8Array): Uint8Array {
  let start = 0;
  let end = bytes.length;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const flags = bytes[5] ?? 0;
    const size =
      ((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0);
    start = Math.min(bytes.length, 10 + size + (flags & 0x10 ? 10 : 0));
  }
  if (
    end - start >= 128 &&
    bytes[end - 128] === 0x54 &&
    bytes[end - 127] === 0x41 &&
    bytes[end - 126] === 0x47
  ) {
    end -= 128;
  }
  return bytes.slice(start, end);
}
