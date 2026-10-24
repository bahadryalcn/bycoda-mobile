import { describe, expect, it } from "vitest";
import type { ContextualSessionInput, ContextualSessionPreview, HostSession } from "@/domain/types";
import { contextualCommand, contextualReplies } from "./handoff-model";
const source = { projectId: "p", revision: 5, status: "idle", session: { id: "source", blocks: [
  { id: "a", role: "assistant", text: "Result" }, { id: "s", role: "assistant", text: "Streaming", streaming: true },
  { id: "d", role: "assistant", text: "Private", internal: true },
] } } as HostSession;
const input: ContextualSessionInput = { sessionId: "source", sourceBlockId: "a", expectedRevision: 5,
  mode: "handoff", harness: "claude", model: "claude:test", modelSettings: { effort: "high" } };
const preview = { ...input, digest: "a".repeat(64), projectId: "p", account: "host-default", contextText: "Exact reviewed recap" } as ContextualSessionPreview;
describe("reviewed contextual transfer", () => {
  it("selects completed public replies and binds actual preview source/target/settings", () => {
    expect(contextualReplies(source).map((block) => block.id)).toEqual(["a"]);
    expect(contextualCommand({ machineId: "m", sessionId: "source" }, source, input, preview)).toEqual({ ...input, type: "contextual", previewDigest: preview.digest });
  });
  it("rejects changed revision, source, account, target, settings and running state before dispatch", () => {
    const scope = { machineId: "m", sessionId: "source" };
    for (const changed of [{ ...preview, model: "different" }, { ...preview, modelSettings: { effort: "low" } },
      { ...preview, projectId: "other" }, { ...preview, account: "other" }, { ...preview, sourceBlockId: "other" }])
      expect(() => contextualCommand(scope, source, input, changed as ContextualSessionPreview)).toThrow();
    expect(() => contextualCommand(scope, { ...source, revision: 6 }, input, preview)).toThrow();
    expect(() => contextualCommand(scope, { ...source, status: "running" }, input, preview)).toThrow();
    expect(() => contextualCommand({ ...scope, sessionId: "other" }, source, input, preview)).toThrow();
  });
});
