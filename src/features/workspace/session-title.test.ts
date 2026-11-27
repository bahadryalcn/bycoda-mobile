import { expect, it } from "vitest";
import { sessionDisplayTitle } from "./session-title";

it("strips a leading provider name and keeps the rest", () => {
  expect(sessionDisplayTitle("codex · Fix login", "New")).toBe("Fix login");
  expect(sessionDisplayTitle("Claude - Fix login", "New")).toBe("Fix login");
  expect(sessionDisplayTitle("codexify the repo", "New")).toBe("codexify the repo");
  expect(sessionDisplayTitle("Fix codex · parser", "New")).toBe("Fix codex · parser");
});
it("falls back when nothing remains", () => {
  expect(sessionDisplayTitle("codex · ", "New")).toBe("New");
  expect(sessionDisplayTitle("", "New")).toBe("New");
  expect(sessionDisplayTitle(undefined, "New")).toBe("New");
});

it("strips repeated provider prefixes from auto-named titles", () => {
  expect(sessionDisplayTitle("codex · codex · Bycoda agent-inspection promo video", "New")).toBe("Bycoda agent-inspection promo video");
  expect(sessionDisplayTitle("claude: codex - Fix push", "New")).toBe("Fix push");
  expect(sessionDisplayTitle("Codex review notes", "New")).toBe("Codex review notes");
});
