import { expect, it, vi } from "vitest";
import type { HostTransport } from "@/remote/transport";
import type { CrewMentionTarget } from "../../../../src/features/sessions/model/crewMentions";
import { composerCrewHandles, deliverComposerCrews } from "./composer-crew-delivery";
import { crewIntentForDraft, decodeComposerDraft, emptyComposerDraft, encodeComposerDraft } from "./composer-draft";

it("limits delegation scanning to deliberate Crew references outside Markdown", () => {
  expect(composerCrewHandles("Ask @crew:dba and @crews:release. @crews:DBA @dba @gh:org/repo#37")).toEqual(["dba", "release"]);
  expect(composerCrewHandles("> @crews:quoted\n\n\`@crews:inline\`\n\n\`\`\`\n@crews:fenced\n\`\`\`")).toEqual([]);
});

it("preserves delegation identity through saved drafts", () => {
  const draft = { ...emptyComposerDraft(), text: "Ask @crews:dba" };
  const intent = crewIntentForDraft(draft, "host", ["member:m"], () => "af21afa1-beef-4afe-85cd-aaa1a112aaff");
  const saved = decodeComposerDraft(encodeComposerDraft({ ...draft, crewIntent: intent })!);
  expect(crewIntentForDraft(saved, "host", ["member:m"], () => "unused")).toEqual(intent);
  expect(crewIntentForDraft({ ...saved, text: "Different task @crews:dba" }, "host", ["member:m"], () => "next").id).toBe("next");
});

it("reuses the exact Host request IDs after a partial failure", async () => {
  const request = vi.fn()
    .mockResolvedValueOnce({ taskId: "task" })
    .mockRejectedValueOnce(Error("interrupted"))
    .mockResolvedValueOnce({ taskId: "task" })
    .mockResolvedValueOnce({ id: "run" });
  const client = { request } as unknown as HostTransport;
  const input = { projectId: "project", sessionId: "parent", intentId: "intent", text: "Ask @crews:dba and @crews:release" };
  const targets = [
    { kind: "member", id: "m", token: "dba" },
    { kind: "crew", id: "r", token: "release" },
  ] as CrewMentionTarget[];
  const deliver = () => deliverComposerCrews(client, input, targets, new AbortController().signal, () => {});
  await expect(deliver()).rejects.toThrow("interrupted");
  await expect(deliver()).resolves.toContain("Delegated to @release (run run)");
  expect(request.mock.calls.map(([method, params]) => [method, params.requestId])).toEqual([
    ["crews.member.ask", "chat-mention:parent:intent:member:m"],
    ["crews.start", "chat-mention:parent:intent:crew:r"],
    ["crews.member.ask", "chat-mention:parent:intent:member:m"],
    ["crews.start", "chat-mention:parent:intent:crew:r"],
  ]);
});
