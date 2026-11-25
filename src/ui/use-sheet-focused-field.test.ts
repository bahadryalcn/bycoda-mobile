import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Keyboard: { addListener: () => ({ remove: () => undefined }) }, TextInput: { State: {} } }));
import { focusedFieldScrollDelta, FOCUSED_FIELD_MARGIN } from "./use-sheet-focused-field";

const view = { top: 100, bottom: 400 };

it("leaves a visible field where it is", () => {
  expect(focusedFieldScrollDelta({ top: 200, bottom: 248 }, view)).toBe(0);
});

it("scrolls a field hidden behind the keyboard or action area up into view with a margin", () => {
  expect(focusedFieldScrollDelta({ top: 380, bottom: 428 }, view)).toBe(428 - (400 - FOCUSED_FIELD_MARGIN));
});

it("scrolls a field above the visible body back down", () => {
  expect(focusedFieldScrollDelta({ top: 60, bottom: 108 }, view)).toBe(60 - (100 + FOCUSED_FIELD_MARGIN));
});

it("keeps the top of a field taller than the body in view", () => {
  expect(focusedFieldScrollDelta({ top: 300, bottom: 800 }, view)).toBe(300 - (100 + FOCUSED_FIELD_MARGIN));
});
