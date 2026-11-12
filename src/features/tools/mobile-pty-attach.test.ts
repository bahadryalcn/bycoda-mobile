import { expect, it, vi } from "vitest";
const sent = vi.hoisted(() => vi.fn());
vi.mock("../workspace/draft-append", async importOriginal => ({ ...(await importOriginal<typeof import("../workspace/draft-append")>()), appendToDraft: sent }));
vi.mock("../workspace/attachment-ownership", () => ({ composerDraftKey: () => "k" }));
import { attachTerminalOutput } from "./mobile-pty-attach";
const scope = { machineId: "m", sessionId: "s" };
it("appends recent output as a fenced block for the session", () => {
  attachTerminalOutput(scope, count => (expect(count).toBe(60), "$ ls\nfile"));
  expect(sent).toHaveBeenCalledWith(scope, { text: "```text\n$ ls\nfile\n```" });
});
it("refuses to attach empty output", () => { expect(() => attachTerminalOutput(scope, () => " \n")).toThrow(); });
