import { describe, expect, it } from "vitest";
import {
  clampGalleryIndex, galleryAxis, galleryCounter, galleryDragOffset, galleryWindow, mediaAutoLoads, settleGalleryPage,
  GALLERY_DISMISS, GALLERY_IDLE, GALLERY_PAGE,
} from "./media-gallery-model";

describe("media gallery model", () => {
  it("starts at the tapped image, clamped to the gallery", () => {
    expect(clampGalleryIndex(3, 7)).toBe(3);
    expect(clampGalleryIndex(9, 7)).toBe(6);
    expect(clampGalleryIndex(-1, 7)).toBe(0);
    expect(clampGalleryIndex(Number.NaN, 7)).toBe(0);
    expect(clampGalleryIndex(2, 0)).toBe(0);
  });

  it("clamps the page when the gallery's items shrink", () => {
    expect(clampGalleryIndex(6, 4)).toBe(3);
    expect(clampGalleryIndex(1, 1)).toBe(0);
  });

  it("reads the visible tiles on their own and hidden images only near the open gallery page", () => {
    expect([0, 1, 2, 3].every((index) => mediaAutoLoads(index, 4, null))).toBe(true);
    expect(mediaAutoLoads(4, 4, null)).toBe(false);
    expect(mediaAutoLoads(9, 4, null)).toBe(false);
    // The gallery on page 3 (the "+N" tile) reads its right neighbour; page 6 reads 5 and 7.
    expect(mediaAutoLoads(4, 4, 3)).toBe(true);
    expect(mediaAutoLoads(5, 4, 3)).toBe(false);
    expect([4, 5, 6, 7, 8].map((index) => mediaAutoLoads(index, 4, 6))).toEqual([false, true, true, true, false]);
    // A visible tile still reads while the gallery is elsewhere.
    expect(mediaAutoLoads(0, 4, 8)).toBe(true);
  });

  it("counts pages only when there is more than one", () => {
    expect(galleryCounter(2, 7)).toBe("3 / 7");
    expect(galleryCounter(0, 1)).toBeNull();
  });

  it("keeps the current page and its neighbours mounted", () => {
    expect(galleryWindow(0, 7)).toEqual([0, 1]);
    expect(galleryWindow(3, 7)).toEqual([2, 3, 4]);
    expect(galleryWindow(6, 7)).toEqual([5, 6]);
    expect(galleryWindow(0, 0)).toEqual([]);
  });

  it("locks a drag to paging or dismissal once it moves", () => {
    expect(galleryAxis(3, 2, true)).toBe(GALLERY_IDLE);
    expect(galleryAxis(-40, 6, true)).toBe(GALLERY_PAGE);
    expect(galleryAxis(10, 40, true)).toBe(GALLERY_DISMISS);
    // A single image never pages; a sideways drag keeps the dismiss-follow behaviour.
    expect(galleryAxis(-40, 6, false)).toBe(GALLERY_DISMISS);
  });

  it("turns one page on a far drag or a flick, never past the ends", () => {
    expect(settleGalleryPage(2, 7, -100, 0, 400)).toBe(3);
    expect(settleGalleryPage(2, 7, 100, 0, 400)).toBe(1);
    expect(settleGalleryPage(2, 7, -30, 0, 400)).toBe(2);
    expect(settleGalleryPage(2, 7, -30, -900, 400)).toBe(3);
    expect(settleGalleryPage(2, 7, -30, 900, 400)).toBe(2);
    expect(settleGalleryPage(6, 7, -300, -900, 400)).toBe(6);
    expect(settleGalleryPage(0, 7, 300, 900, 400)).toBe(0);
  });

  it("resists dragging past the first or last page", () => {
    expect(galleryDragOffset(2, 7, -50, 400)).toBe(-850);
    expect(galleryDragOffset(0, 7, 100, 400)).toBe(30);
    expect(galleryDragOffset(6, 7, -100, 400)).toBe(-2430);
  });
});
