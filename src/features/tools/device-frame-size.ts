/** Natural size of a captured frame, read from its encoded header so the viewer can fit it to the screen before decoding. */
export type FrameDimensions = { width: number; height: number };

const HEADER_CHARS = 48 * 1024;

function bytes(base64: string): Uint8Array | undefined {
  try {
    const slice = base64.slice(0, HEADER_CHARS - (HEADER_CHARS % 4));
    return Uint8Array.from(atob(slice), (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export function frameDimensions(mime: string, base64: string): FrameDimensions | undefined {
  const data = bytes(base64);
  if (!data) return undefined;
  const word = (at: number) => ((data[at] ?? 0) << 8) | (data[at + 1] ?? 0);
  if (mime === "image/png") {
    if (data.length < 24 || data[1] !== 0x50) return undefined;
    const long = (at: number) => (word(at) * 65536) + word(at + 2);
    const width = long(16), height = long(20);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  if (data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 9 < data.length) {
    if (data[at] !== 0xff) { at += 1; continue; }
    const marker = data[at + 1]!;
    if (marker === 0xff) { at += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    // Start-of-frame markers carry the size; 0xc4, 0xc8 and 0xcc are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = word(at + 5), width = word(at + 7);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    at += 2 + word(at + 2);
  }
  return undefined;
}

/** Largest width that keeps a frame of this aspect inside the area; unknown frames assume a tall phone. */
export function fitFrameWidth(area: { width: number; height: number }, frame: FrameDimensions | undefined): number {
  const aspect = frame ? frame.width / frame.height : 9 / 19.5;
  if (area.width <= 0 || area.height <= 0) return 0;
  return Math.floor(Math.min(area.width, area.height * aspect));
}
