export type ByteRange = {
  start: number;
  end: number;
};

export function parseByteRange(rangeHeader: string, size: number): ByteRange | null {
  if (size <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (match === null) {
    return null;
  }

  const startToken = match[1];
  const endToken = match[2];
  if (startToken === undefined || endToken === undefined) {
    return null;
  }

  if (startToken === '' && endToken === '') {
    return null;
  }

  if (startToken === '') {
    const suffix = Number(endToken);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return null;
    }
    return {
      start: Math.max(0, size - suffix),
      end: size - 1,
    };
  }

  const start = Number(startToken);
  const end = endToken === '' ? size - 1 : Number(endToken);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}
