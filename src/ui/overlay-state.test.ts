import { describe, expect, it } from "vitest";
import { canRemoveOverlay, closeOverlay, showOverlay } from "./overlay-state";

describe("overlay dismissal lifecycle", () => {
  it("retains content until the matching close animation finishes", () => {
    const open = showOverlay(undefined, "draft editor");
    const closing = closeOverlay(open);
    expect(closing.value).toBe("draft editor");
    expect(canRemoveOverlay(open, closing.generation)).toBe(false);
    expect(canRemoveOverlay(closing, open.generation)).toBe(false);
    expect(canRemoveOverlay(closing, closing.generation)).toBe(true);
    expect(closeOverlay(closing)).toBe(closing);
  });
  it("ignores a delayed close callback after reopening, even if closed again", () => {
    const firstClose = closeOverlay(showOverlay(undefined, "picker"));
    const reopened = showOverlay(firstClose, "updated picker");
    expect(canRemoveOverlay(reopened, firstClose.generation)).toBe(false);
    const secondClose = closeOverlay(reopened);
    expect(canRemoveOverlay(secondClose, firstClose.generation)).toBe(false);
    expect(canRemoveOverlay(secondClose, secondClose.generation)).toBe(true);
  });
});
