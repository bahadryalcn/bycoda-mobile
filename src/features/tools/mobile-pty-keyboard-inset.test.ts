import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Regression for #455: the terminal modal kept a static bottom inset above the open keyboard.
const source = readFileSync(new URL("./mobile-pty.tsx", import.meta.url), "utf8");

it("drives the terminal modal bottom inset from keyboard progress instead of a static inset", () => {
  expect(source).toContain("useReanimatedKeyboardAnimation()");
  expect(source).toContain("insets.bottom * (1 - Math.min(1, Math.max(0, progress.value)))");
  expect(source).toMatch(/<Animated\.View style=\{\[\{[^\]]*\}, safeBottomStyle\]\}>/);
  expect(source).not.toMatch(/paddingBottom:\s*insets\.bottom\s*\}/);
});

it("keeps the keyboard-avoiding padding owner and closed-keyboard safe area", () => {
  expect(source).toContain('behavior="padding"');
  expect(source).toContain("paddingTop: insets.top");
  expect(source).toContain("paddingLeft: insets.left");
  expect(source).toContain("paddingRight: insets.right");
});
