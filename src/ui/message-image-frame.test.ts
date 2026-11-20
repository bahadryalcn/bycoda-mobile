import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inlineRaster } from "./inline-raster";
import { IMAGE_FRAME_MAX_HEIGHT, reservedImageRatio } from "./message-image-frame";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=";

describe("reserved inline image frame", () => {
  it("uses known dimensions, clamped to the old display bounds", () => {
    expect(reservedImageRatio({ width: 300, height: 200 })).toBe(1.5);
    expect(reservedImageRatio({ width: 100, height: 400 })).toBe(0.6);
    expect(reservedImageRatio({ width: 4000, height: 100 })).toBe(3);
    expect(reservedImageRatio(inlineRaster(`data:image/png;base64,${png}`))).toBe(1);
  });
  it("reserves a square for sources without metadata instead of guessing a landscape box", () => {
    for (const known of [undefined, null, { width: 0, height: 10 }, { width: 10, height: 0 }, { width: NaN, height: 5 }, { width: Infinity, height: 5 }])
      expect(reservedImageRatio(known)).toBe(1);
    expect(IMAGE_FRAME_MAX_HEIGHT).toBe(240);
  });
  it("never lets the loaded image resize the frame (source guard for #1115)", () => {
    const source = readFileSync(new URL("./message-image.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/setRatio|useState\(1\.6\)|event\.source\.(width|height)/);
    // The spinner overlays the frame; a sibling spinner below the image would add a second height change.
    expect(source).not.toMatch(/!loaded && !query\.error \? <Loading \/> : null\}\s*\n\s*<ErrorText/);
  });
});
