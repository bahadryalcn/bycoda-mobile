import { describe, expect, it } from "vitest";
import { invertedInputOffset } from "./inverted-input-offset";

const base = {
  offset: 200,
  contentHeight: 1_000,
  viewport: { y: 100, height: 400 },
  input: { y: 220, height: 100 },
  gap: 8,
};

describe("inverted transcript input visibility", () => {
  it("leaves a visible field at the current offset", () => {
    expect(invertedInputOffset(base)).toBe(200);
  });

  it("increases the inverted offset to reveal a field above the viewport", () => {
    expect(invertedInputOffset({ ...base, input: { y: 70, height: 30 } })).toBe(238);
  });

  it("decreases the inverted offset to reveal a field below the composer edge", () => {
    expect(invertedInputOffset({ ...base, input: { y: 470, height: 50 } })).toBe(172);
  });

  it("clamps to the newest-message content boundary", () => {
    expect(invertedInputOffset({ ...base, offset: 10, input: { y: 500, height: 100 } })).toBe(0);
  });

  it("clamps to the oldest-message content boundary", () => {
    expect(invertedInputOffset({ ...base, offset: 590, input: { y: 50, height: 30 } })).toBe(600);
  });

  it("uses the caret inside a field taller than the viewport", () => {
    const tall = { ...base, input: { y: -200, height: 800 } };
    expect(invertedInputOffset({ ...tall, caret: { startY: 420, endY: 440 } })).toBe(200);
    expect(invertedInputOffset({ ...tall, caret: { startY: 230, endY: 250 } })).toBe(278);
    expect(invertedInputOffset({ ...tall, caret: { startY: 720, endY: 740 } })).toBe(152);
  });

  it("clamps a scrolled multiline selection to the actual input height", () => {
    expect(
      invertedInputOffset({
        ...base,
        input: { y: 450, height: 80 },
        caret: { startY: 500, endY: 520 },
      }),
    ).toBe(162);
  });

  it("keeps the active end of a long selection visible", () => {
    expect(
      invertedInputOffset({
        ...base,
        input: { y: -200, height: 800 },
        caret: { startY: 50, endY: 700 },
      }),
    ).toBe(192);
  });

  it("reveals the end of a tall field until native caret information arrives", () => {
    expect(invertedInputOffset({ ...base, input: { y: -200, height: 800 } })).toBe(92);
  });

  it("accounts for actual native content insets at the boundaries", () => {
    expect(
      invertedInputOffset({
        ...base,
        offset: 0,
        input: { y: 500, height: 100 },
        insetTop: 20,
      }),
    ).toBe(-20);
    expect(
      invertedInputOffset({
        ...base,
        offset: 590,
        input: { y: 50, height: 30 },
        insetBottom: 30,
      }),
    ).toBe(630);
  });

  it("does not scroll short content past its actual bounds", () => {
    expect(
      invertedInputOffset({ ...base, offset: 0, contentHeight: 200, input: { y: 70, height: 30 } }),
    ).toBe(0);
  });

  it("waits for measurable viewport and input layouts", () => {
    expect(invertedInputOffset({ ...base, viewport: { y: 100, height: 0 } })).toBe(200);
    expect(invertedInputOffset({ ...base, input: { y: 100, height: 0 } })).toBe(200);
  });
});
