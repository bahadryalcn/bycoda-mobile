import { beforeEach, expect, it, vi } from "vitest";
import { appendDraftAttachment, appendDraftText, appendToDraft, fencedBlock, subscribeDraftAppend } from "./draft-append";
import { composerDraftKey } from "./attachment-ownership";

vi.mock("./attachment-ownership", () => ({ composerDraftKey: (machine: string, session: string) => `${machine}:${session}` }));
const target = { machineId: "m", sessionId: "s" };
beforeEach(() => { subscribeDraftAppend(composerDraftKey("m", "s"), () => {})(); });

it("queues requests until the composer subscribes, then delivers them in order", () => {
  appendToDraft(target, { text: "one" }); appendToDraft(target, { text: "two" });
  const seen: string[] = []; const off = subscribeDraftAppend(composerDraftKey("m", "s"), r => seen.push(r.text!));
  expect(seen).toEqual(["one", "two"]);
  appendToDraft(target, { text: "three" }); expect(seen).toEqual(["one", "two", "three"]);
  off(); appendToDraft(target, { text: "four" });
  const later: string[] = []; subscribeDraftAppend(composerDraftKey("m", "s"), r => later.push(r.text!))(); expect(later).toEqual(["four"]);
});
it("never delivers to another session", () => {
  const seen = vi.fn(); const off = subscribeDraftAppend(composerDraftKey("m", "other"), seen);
  appendToDraft(target, { text: "x" }); expect(seen).not.toHaveBeenCalled(); off();
});
it("fences output with a fence the body cannot close", () => {
  expect(fencedBlock("ls\n\n")).toBe("```\nls\n```");
  expect(fencedBlock("a ``` b")).toBe("````\na ``` b\n````");
});
it("appends text after a blank line and enforces the attachment limit", () => {
  expect(appendDraftText({ text: "hi" }, "x").text).toBe("hi\n\nx");
  expect(appendDraftText({ text: "" }, "x").text).toBe("x");
  expect(appendDraftText({ text: "hi" }, "  ").text).toBe("hi");
  expect(() => appendDraftAttachment({ attachments: [{} as never] }, {} as never, 1)).toThrow();
});
