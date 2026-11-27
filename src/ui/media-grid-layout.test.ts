import { describe, expect, it } from "vitest";
import {
  MEDIA_GRID_GAP, MEDIA_GRID_MAX, MEDIA_GRID_TILE, MEDIA_SINGLE_MAX_HEIGHT, mediaGridLayout, mediaGridWidth, rememberedMediaSize,
  rememberMediaSize, singleMediaSize,
} from "./media-grid-layout";

const inside = (layout: ReturnType<typeof mediaGridLayout>) =>
  layout.tiles.every((tile) => tile.left >= 0 && tile.top >= 0 && tile.left + tile.width <= layout.width && tile.top + tile.height <= layout.height);

describe("mediaGridLayout", () => {
  it("draws nothing without images or room", () => {
    expect(mediaGridLayout(0, 300)).toEqual({ width: 0, height: 0, tiles: [], overflow: 0 });
    expect(mediaGridLayout(3, 0).tiles).toEqual([]);
  });

  it("caps the block at 280dp or the user column", () => {
    expect(mediaGridWidth(400)).toBe(MEDIA_GRID_MAX);
    expect(mediaGridWidth(250.7)).toBe(250);
    expect(mediaGridLayout(2, 1000).width).toBeLessThanOrEqual(MEDIA_GRID_MAX);
  });

  it("gives one image of unknown size a fixed 4:3 frame, so loading never reflows", () => {
    expect(mediaGridLayout(1, 300)).toMatchObject({ width: 280, height: 210, overflow: 0 });
  });

  it("keeps one image's natural aspect inside 280 wide × 360 tall", () => {
    expect(singleMediaSize(280, { width: 4000, height: 3000 })).toEqual({ width: 280, height: 210 });
    // A tall phone screenshot stands portrait.
    expect(singleMediaSize(280, { width: 1080, height: 2400 })).toEqual({ width: 162, height: MEDIA_SINGLE_MAX_HEIGHT });
    expect(singleMediaSize(280, { width: 3000, height: 500 })).toEqual({ width: 280, height: 120 });
    expect(singleMediaSize(280, { width: 0, height: 0 })).toEqual({ width: 280, height: 210 });
  });

  it("lays a lone image out from its natural size, portrait or landscape", () => {
    const tall = mediaGridLayout(1, 300, { width: 1170, height: 2532 });
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(tall).toMatchObject({ height: MEDIA_SINGLE_MAX_HEIGHT, tiles: [{ index: 0, left: 0, top: 0, width: tall.width, height: MEDIA_SINGLE_MAX_HEIGHT }] });
    const wide = mediaGridLayout(1, 300, { width: 1600, height: 900 });
    expect(wide).toMatchObject({ width: MEDIA_GRID_MAX, height: 158 });
    // A narrow column caps the width first.
    expect(mediaGridLayout(1, 200, { width: 1600, height: 900 })).toMatchObject({ width: 200, height: 120 });
    // Collages keep their fixed frames whatever the first image measures.
    expect(mediaGridLayout(2, 300, { width: 1170, height: 2532 }).height).toBe(160);
  });

  it("remembers a learned natural size by key, so a remount takes its frame at once", () => {
    expect(rememberedMediaSize("test:size")).toBeUndefined();
    expect(rememberMediaSize("test:size", { width: 1170, height: 2532 })).toBe(true);
    expect(rememberMediaSize("test:size", { width: 1170, height: 2532 })).toBe(false);
    expect(rememberMediaSize("test:empty", { width: 0, height: 10 })).toBe(false);
    expect(rememberedMediaSize("test:size")).toEqual({ width: 1170, height: 2532 });
    expect(rememberedMediaSize(undefined)).toBeUndefined();
    for (let i = 0; i < 300; i++) rememberMediaSize(`test:fill-${i}`, { width: 1, height: 1 });
    expect(rememberedMediaSize("test:size")).toBeUndefined();
    expect(rememberedMediaSize("test:fill-299")).toEqual({ width: 1, height: 1 });
  });

  it("puts two images side by side at 160dp", () => {
    const layout = mediaGridLayout(2, 300);
    expect(layout.height).toBe(160);
    expect(layout.tiles.map((tile) => [tile.left, tile.width, tile.height])).toEqual([[0, 139, 160], [139 + MEDIA_GRID_GAP, 139, 160]]);
    expect(inside(layout)).toBe(true);
  });

  it("shows three as one tall tile beside two stacked, 200dp", () => {
    const layout = mediaGridLayout(3, 300);
    expect(layout.height).toBe(200);
    const [large, top, bottom] = layout.tiles;
    expect(large).toMatchObject({ left: 0, top: 0, height: 200 });
    expect(top!.left).toBe(bottom!.left);
    expect(top!.height + MEDIA_GRID_GAP + bottom!.height).toBe(200);
    expect(inside(layout)).toBe(true);
  });

  it("collapses four or more into a 2×2 grid with +N on the last tile", () => {
    const four = mediaGridLayout(4, 300);
    expect(four.tiles).toHaveLength(4);
    expect(four.overflow).toBe(0);
    const seven = mediaGridLayout(7, 300);
    expect(seven.tiles).toHaveLength(4);
    expect(seven.overflow).toBe(3);
    expect(seven.tiles.every((tile) => tile.width === MEDIA_GRID_TILE && tile.height === MEDIA_GRID_TILE)).toBe(true);
    expect(seven).toMatchObject({ width: MEDIA_GRID_TILE * 2 + MEDIA_GRID_GAP, height: MEDIA_GRID_TILE * 2 + MEDIA_GRID_GAP });
    expect(inside(seven)).toBe(true);
  });

  it("shrinks grid tiles on a narrow column but keeps 48dp targets", () => {
    const layout = mediaGridLayout(5, 200);
    expect(layout.tiles[0]!.width).toBe(99);
    expect(layout.tiles.every((tile) => tile.width >= 48 && tile.height >= 48)).toBe(true);
  });
});
