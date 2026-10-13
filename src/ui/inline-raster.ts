/** Small embedded raster previews only; never HTML, SVG, arbitrary URIs or unbounded decodes. */
export const MAX_INLINE_RASTER_BYTES = 128 * 1024;
const MAX_INLINE_PIXELS = 4 * 1024 * 1024;
const MAX_INLINE_SIDE = 4096;
export function inlineRaster(raw: string): { uri: string; mimeType: string; bytes: number } | null {
  if (raw.length > Math.ceil(MAX_INLINE_RASTER_BYTES / 3) * 4 + 32) return null;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(raw);
  if (!match || match[2]!.length % 4) return null;
  const encoded = match[2]!;
  const size =
    (encoded.length / 4) * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (!size || size > MAX_INLINE_RASTER_BYTES) return null;
  let data: string;
  try {
    data = atob(encoded);
  } catch {
    return null;
  }
  const byte = (at: number) => data.charCodeAt(at);
  const u16 = (at: number, little = false) =>
    little ? byte(at) + byte(at + 1) * 256 : byte(at) * 256 + byte(at + 1);
  const u24 = (at: number) => byte(at) + byte(at + 1) * 256 + byte(at + 2) * 65536;
  const u32 = (at: number, little = false) =>
    little ? u16(at, true) + u16(at + 2, true) * 65536 : u16(at) * 65536 + u16(at + 2);
  const mimeType = match[1]!.toLowerCase();
  let width = 0;
  let height = 0;
  if (
    mimeType === "image/png" &&
    data.startsWith("\x89PNG\r\n\x1a\n") &&
    u32(8) === 13 &&
    data.slice(12, 16) === "IHDR"
  ) {
    width = u32(16);
    height = u32(20);
  } else if (mimeType === "image/gif" && /^GIF8[79]a/.test(data)) {
    width = u16(6, true);
    height = u16(8, true);
  } else if (mimeType === "image/jpeg" && byte(0) === 255 && byte(1) === 216) {
    let offset = 2;
    while (offset + 3 < data.length) {
      if (byte(offset++) !== 255) break;
      while (byte(offset) === 255) offset++;
      const marker = byte(offset++);
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = u16(offset);
      if (length < 2 || offset + length > data.length) break;
      if (
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) &&
        length >= 8
      ) {
        height = u16(offset + 3);
        width = u16(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (
    mimeType === "image/webp" &&
    data.startsWith("RIFF") &&
    data.slice(8, 12) === "WEBP" &&
    u32(4, true) + 8 === data.length
  ) {
    const chunk = data.slice(12, 16);
    if (chunk === "VP8X" && data.length >= 30) {
      width = u24(24) + 1;
      height = u24(27) + 1;
    } else if (chunk === "VP8 " && data.slice(23, 26) === "\x9d\x01\x2a") {
      width = u16(26, true) & 16383;
      height = u16(28, true) & 16383;
    } else if (chunk === "VP8L" && byte(20) === 47) {
      width = 1 + byte(21) + (byte(22) & 63) * 256;
      height = 1 + (byte(22) >> 6) + byte(23) * 4 + (byte(24) & 15) * 1024;
    }
  }
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_INLINE_SIDE ||
    height > MAX_INLINE_SIDE ||
    width * height > MAX_INLINE_PIXELS
  )
    return null;
  return { uri: `data:${mimeType};base64,${encoded}`, mimeType, bytes: size };
}
