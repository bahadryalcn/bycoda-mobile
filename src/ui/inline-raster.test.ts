import { describe, expect, it } from "vitest";
import { inlineRaster, MAX_INLINE_RASTER_BYTES } from "./inline-raster";
import { parseMessage, type MessageNode } from "./message-model";
const flatten = (nodes: MessageNode[]): MessageNode[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children)]);
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=";
const uri = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

describe("bounded inline raster media", () => {
  it("allows a real small PNG through the native Markdown image path", () => {
    const source = `data:image/png;base64,${png}`;
    expect(inlineRaster(source)?.mimeType).toBe("image/png");
    expect(
      flatten(parseMessage(`![embedded](${source})`)).find((node) => node.type === "image")?.attrs
        .src,
    ).toBe(source);
    expect(
      inlineRaster("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
        ?.mimeType,
    ).toBe("image/gif");
  });
  it("reads bounded JPEG and WebP dimensions without trusting just the MIME label", () => {
    // These minimal headers exercise the boundary parser, not an image decoder.
    const jpeg = Uint8Array.from([255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 217]);
    expect(inlineRaster(uri("image/jpeg", jpeg))?.bytes).toBe(jpeg.length);
    const webp = new Uint8Array(30);
    webp.set(Buffer.from("RIFF"));
    webp[4] = 22;
    webp.set(Buffer.from("WEBPVP8X"), 8);
    webp[16] = 10;
    expect(inlineRaster(uri("image/webp", webp))?.bytes).toBe(30);
    expect(inlineRaster(uri("image/png", jpeg))).toBeNull();
  });
  it("rejects active formats, forged headers, malformed base64 and byte/dimension bombs", () => {
    for (const source of [
      "data:image/svg+xml;base64,PHN2Zy8+",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/png;base64,PHN2Zy8+",
      "data:image/png;base64,AAAA!===",
      "data:image/png;charset=utf-8;base64," + png,
      "data:image/png;base64," + "A".repeat(Math.ceil((MAX_INLINE_RASTER_BYTES + 1) / 3) * 4),
    ])
      expect(inlineRaster(source), source.slice(0, 60)).toBeNull();
    const large = Uint8Array.from(Buffer.from(png, "base64"));
    large.set([0, 0, 32, 0], 16); // 8192 pixels wide, independent of tiny encoded size.
    expect(inlineRaster(uri("image/png", large))).toBeNull();
    large.set([0, 0, 16, 0], 16);
    large.set([0, 0, 16, 0], 20); // 16 million decoded pixels.
    expect(inlineRaster(uri("image/png", large))).toBeNull();
    expect(
      flatten(parseMessage("![unsafe](data:image/svg+xml;base64,PHN2Zy8+)")).some(
        (node) => node.type === "image",
      ),
    ).toBe(false);
  });
});
