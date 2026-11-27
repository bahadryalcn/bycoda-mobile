import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

it("shows no 'command reached the computer' row; a settled success clears and re-reads at once", () => {
  const transcript = source("./session-transcript.tsx");
  const screen = source("./session-screen.tsx");
  expect(transcript).not.toMatch(/ChatCommandReceipt|chat-command-receipt/);
  expect(existsSync(new URL("../../ui/chat-command-receipt.tsx", import.meta.url))).toBe(false);
  // The reset follows the awaited mutation in the screen's dispatch (main and Stop lanes), never an
  // effect or a timer in a transient component, so the invalidation is the one re-read.
  expect(transcript).not.toMatch(/isSuccess/);
  expect(screen).toMatch(/receipt = await flight;[\s\S]*\(stop \? resetStop : resetCommand\)\(\);/);
  expect(transcript).not.toMatch(/setTimeout\([^)]*receiptHandled/);
  // An uncertain cancel gets the same status check, but never holds Stop: a repeated cancel for the
  // same run is harmless on the Host, so Stop stays pressable.
  expect(transcript).toMatch(/<CommandError\s+error=\{stopError\}/);
  expect(screen).toContain("stopBlocked={!visible}");
  expect(screen).not.toMatch(/instanceof UncertainCommand\) throw/);
  // One owner of Stop state (the screen) and one set of bounds (the presentation model).
  const composer = source("./session-composer.tsx");
  expect(composer).not.toMatch(/setStopRequest|stopStillPending|stopping\.current/);
  expect(screen).toContain("stopping={stopping}");
  for (const file of [transcript, screen, composer]) expect(file).not.toMatch(/STOP_(SETTLE|REPLY)_MS = /);
});

it("keeps one live indicator: the transcript row, not a Thinking placeholder beside the bar's clock", () => {
  const transcript = source("./session-transcript.tsx");
  expect(transcript).not.toContain("ThinkingPlaceholder");
  expect(transcript).toContain("<LiveTurnRow");
  expect(source("./session-activity-bar.tsx")).not.toMatch(/useElapsedNow|formatElapsed/);
});
