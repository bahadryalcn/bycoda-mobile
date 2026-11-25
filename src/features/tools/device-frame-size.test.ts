import { expect, it } from "vitest";
import { fitFrameWidth, frameDimensions } from "./device-frame-size";

const png = (w: number, h: number) => {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  bytes.set([w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255], 16);
  return btoa(String.fromCharCode(...bytes));
};

it("reads PNG and JPEG sizes from the header", () => {
  expect(frameDimensions("image/png", png(1179, 2556))).toEqual({ width: 1179, height: 2556 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x09, 0xfc, 0x04, 0x9b, 3, 0]);
  expect(frameDimensions("image/jpeg", btoa(String.fromCharCode(...jpeg)))).toEqual({ width: 1179, height: 2556 });
  expect(frameDimensions("image/png", "not base64!")).toBeUndefined();
});

it("fits the frame inside the available area", () => {
  expect(fitFrameWidth({ width: 400, height: 400 }, { width: 100, height: 200 })).toBe(200);
  expect(fitFrameWidth({ width: 300, height: 900 }, { width: 100, height: 200 })).toBe(300);
  expect(fitFrameWidth({ width: 0, height: 0 }, undefined)).toBe(0);
});
