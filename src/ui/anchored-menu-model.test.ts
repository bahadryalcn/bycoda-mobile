import { expect, it } from "vitest";
import { anchoredMenuAnchorMoved, anchoredMenuChoiceAllowed, anchoredMenuPlacement } from "./anchored-menu-model";

const overlay = { x: 0, y: 0, width: 400, height: 800 };
const insets = { top: 40, bottom: 20, left: 0, right: 0 };

it("opens upward above the trigger with its trailing edge on the trigger's", () => {
  // A send button near the bottom right, above an open keyboard.
  const placement = anchoredMenuPlacement({ anchor: { x: 340, y: 400, width: 48, height: 48 }, overlay, desiredWidth: 272, insets, keyboardInset: 340 });
  expect(placement.bottom).toBe(800 - 400 + 6);
  expect(placement.top).toBeUndefined();
  expect(placement.left).toBe(388 - 272);
  expect(placement.width).toBe(272);
  expect(placement.maxHeight).toBe(400 - 6 - 52);
  expect(placement.origin).toBe("bottom right");
});

it("clamps to the screen edges and narrow windows", () => {
  const narrow = anchoredMenuPlacement({ anchor: { x: 250, y: 500, width: 48, height: 48 }, overlay: { ...overlay, width: 280 }, desiredWidth: 272, insets });
  expect(narrow.width).toBe(280 - 24);
  expect(narrow.left).toBe(12);
  const leading = anchoredMenuPlacement({ anchor: { x: 4, y: 500, width: 48, height: 48 }, overlay, desiredWidth: 272, insets });
  expect(leading.left).toBe(12);
  expect(leading.origin).toBe("bottom left");
});

it("works in the overlay's own coordinates and opens downward only when the room above is too small", () => {
  const shifted = anchoredMenuPlacement({ anchor: { x: 340, y: 424, width: 48, height: 48 }, overlay: { ...overlay, y: 24 }, desiredWidth: 200, insets });
  expect(shifted.bottom).toBe(800 - 400 + 6);
  const below = anchoredMenuPlacement({ anchor: { x: 340, y: 60, width: 48, height: 48 }, overlay, desiredWidth: 200, insets, minHeight: 96 });
  expect(below.top).toBe(60 + 48 + 6);
  expect(below.bottom).toBeUndefined();
  expect(below.origin).toBe("top right");
});

it("follows the trigger only when a keyboard frame change actually moved it", () => {
  const frame = { x: 340, y: 400, width: 48, height: 48 };
  expect(anchoredMenuAnchorMoved(undefined, frame)).toBe(true);
  expect(anchoredMenuAnchorMoved(frame, { ...frame, y: 401.5 })).toBe(false);
  expect(anchoredMenuAnchorMoved(frame, { ...frame, y: 360 })).toBe(true);
  expect(anchoredMenuAnchorMoved(frame, { ...frame, width: 60 })).toBe(true);
});

it("stays on the trigger when Android edge-to-edge shifts every window coordinate by the status bar", () => {
  // Both frames come from the same measureInWindow, so a viewport offset (-24 here) cancels out.
  const offset = -24;
  const placement = anchoredMenuPlacement({
    anchor: { x: 340, y: 700 + offset, width: 48, height: 48 },
    overlay: { x: 0, y: offset, width: 400, height: 800 },
    desiredWidth: 272, insets: { top: 24, bottom: 48, left: 0, right: 0 },
  });
  expect(placement.bottom).toBe(800 - 700 + 6);
  expect(placement.origin).toBe("bottom right");
  expect(placement.maxHeight).toBe(700 - 6 - 24 - 12);
  // Keyboard open: the composer rode up, the menu still opens right above the button.
  const typing = anchoredMenuPlacement({
    anchor: { x: 340, y: 380 + offset, width: 48, height: 48 },
    overlay: { x: 0, y: offset, width: 400, height: 800 },
    desiredWidth: 272, insets: { top: 24, bottom: 48, left: 0, right: 0 }, keyboardInset: 360,
  });
  expect(typing.bottom).toBe(800 - 380 + 6);
  expect(typing.top).toBeUndefined();
});

it("keeps a split-view pane's trigger inside its own window frame", () => {
  // A tablet split: the session pane starts at x=420; the menu ends on the button's trailing edge.
  const placement = anchoredMenuPlacement({
    anchor: { x: 1100, y: 700, width: 48, height: 48 }, overlay: { x: 0, y: 0, width: 1180, height: 820 },
    desiredWidth: 272, insets: { top: 24, bottom: 20, left: 0, right: 0 },
  });
  expect(placement.left).toBe(1148 - 272);
  expect(placement.left + placement.width).toBeLessThanOrEqual(1180 - 12);
});

it("runs a chosen row only while it is enabled and the trigger's private content is still allowed", () => {
  const open = { allowed: true, check: () => true };
  expect(anchoredMenuChoiceAllowed({}, open)).toBe(true);
  expect(anchoredMenuChoiceAllowed({ disabled: true }, open)).toBe(false);
  expect(anchoredMenuChoiceAllowed({}, { allowed: false, check: () => true })).toBe(false);
  expect(anchoredMenuChoiceAllowed({}, { allowed: true, check: () => false })).toBe(false);
});
