/** Natural size of a captured frame, read from its encoded header so the viewer can fit it to the screen before decoding. */
export type FrameDimensions = { width: number; height: number };

/** A PNG keeps its size in the first 24 bytes (32 base64 characters). */
const PNG_HEADER_CHARS = 32;
/** A JPEG start-of-frame usually sits within the first few KB; larger windows are tried only when it does not. */
const JPEG_HEADER_CHARS = [4 * 1024, 16 * 1024, 48 * 1024];

function bytes(base64: string, chars: number): Uint8Array | undefined {
  try {
    const binary = atob(base64.slice(0, chars - (chars % 4)));
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
    return data;
  } catch {
    return undefined;
  }
}

export function frameDimensions(mime: string, base64: string): FrameDimensions | undefined {
  if (mime === "image/png") {
    const data = bytes(base64, PNG_HEADER_CHARS);
    if (!data || data.length < 24 || data[1] !== 0x50) return undefined;
    const word = (at: number) => ((data[at] ?? 0) << 8) | (data[at + 1] ?? 0);
    const long = (at: number) => (word(at) * 65536) + word(at + 2);
    const width = long(16), height = long(20);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  for (const chars of JPEG_HEADER_CHARS) {
    const data = bytes(base64, chars);
    if (!data) return undefined;
    const found = jpegDimensions(data);
    // Stop once the whole payload was read or the header was conclusive.
    if (found !== "more" || chars >= base64.length) return found === "more" ? undefined : found;
  }
  return undefined;
}

function jpegDimensions(data: Uint8Array): FrameDimensions | undefined | "more" {
  const word = (at: number) => ((data[at] ?? 0) << 8) | (data[at + 1] ?? 0);
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
  return "more";
}

/** Largest width that keeps a frame of this aspect inside the area; unknown frames assume a tall phone. */
export function fitFrameWidth(area: { width: number; height: number }, frame: FrameDimensions | undefined): number {
  const aspect = frame ? frame.width / frame.height : 9 / 19.5;
  if (area.width <= 0 || area.height <= 0) return 0;
  return Math.floor(Math.min(area.width, area.height * aspect));
}
