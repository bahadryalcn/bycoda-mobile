import { describe, expect, it } from "vitest";
import { sessionStreamValue } from "./session-sync";
import type { HostSession } from "./types";
import type { SubscriptionEvent } from "../../../src/shared/model/host-contracts";

const session = (revision: number): HostSession => ({
  projectId: "project-a",
  revision,
  status: "idle",
  updatedAt: 1,
  session: {
    id: "session-a",
    harness: "codex",
    model: "model-a",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Session",
    cwd: "/project",
    blocks: [{ id: "block-a", role: "assistant", text: "initial" }],
  },
});
const event = (kind: "snapshot" | "delta", data: unknown): SubscriptionEvent => ({
  jsonrpc: "2.0",
  method: "subscription.event",
  params: {
    subscriptionId: "subscription-a",
    streamId: "stream-a",
    cursor: { epoch: "epoch-a", sequence: 1 },
    kind,
    data: data as SubscriptionEvent["params"]["data"],
  },
});
describe("mobile session stream revision and identity fences", () => {
  it("reports a project mismatch separately from a changed computer, retaining the exact session and both project IDs", () => {
    try {
      sessionStreamValue(event("snapshot", session(1)), undefined, "session-a", "legacy-alias");
      throw new Error("Expected project mismatch");
    } catch (error) {
      expect(error).toMatchObject({
        sessionId: "session-a",
        expectedProjectId: "legacy-alias",
        actualProjectId: "project-a",
      });
      expect(error).not.toHaveProperty("kind", "identity");
    }
  });
  it("reads a session stored under a folded legacy row as the listed project, and only those rows", () => {
    const listed = sessionStreamValue(event("snapshot", session(1)), undefined, "session-a", "listed", [
      "project-a",
    ]);
    expect(listed).toMatchObject({ projectId: "listed" });
    expect(() =>
      sessionStreamValue(event("snapshot", session(1)), undefined, "session-a", "listed", ["other"]),
    ).toThrow("Transcript project identity changed.");
  });
  it("projects a new authority floor at the same transcript revision while preserving old pending intents", () => {
    const known = { ...session(4), authorityGeneration: 2 };
    const next = { ...session(4), authorityGeneration: 3 };
    expect(
      sessionStreamValue(event("snapshot", next), known, "session-a", "project-a"),
    ).toMatchObject({ revision: 4, authorityGeneration: 3 });
    const { blocks, ...metadata } = next.session;
    const delta = {
      kind: "delta",
      base: 4,
      value: { ...next, session: metadata },
      blockIds: blocks.map((block) => block.id),
      blocks: [],
    };
    expect(
      sessionStreamValue(event("delta", delta), known, "session-a", "project-a"),
    ).toMatchObject({ revision: 4, authorityGeneration: 3 });
    expect(
      sessionStreamValue(event("snapshot", known), next, "session-a", "project-a"),
    ).toMatchObject({ revision: 4, authorityGeneration: 3 });
  });
  it("applies a validated snapshot and preserves a newer local authoritative read", () => {
    expect(
      sessionStreamValue(event("snapshot", session(2)), session(1), "session-a", "project-a"),
    ).toEqual(session(2));
    const latest = session(3);
    expect(
      sessionStreamValue(event("snapshot", session(2)), latest, "session-a", "project-a"),
    ).toBe(latest);
  });
  it("applies only a canonical delta with the exact locally applied base", () => {
    const { blocks: _blocks, ...metadata } = session(2).session;
    const delta = {
      kind: "delta",
      base: 1,
      value: { ...session(2), session: metadata },
      blockIds: ["block-a"],
      blocks: [{ id: "block-a", role: "assistant", text: "updated" }],
    };
    const applied = sessionStreamValue(event("delta", delta), session(1), "session-a", "project-a");
    expect(applied).toMatchObject({ revision: 2, session: { blocks: [{ text: "updated" }] } });
    expect(sessionStreamValue(event("delta", delta), session(4), "session-a", "project-a")).toBe(
      "resync",
    );
    expect(sessionStreamValue(event("delta", delta), undefined, "session-a", "project-a")).toBe(
      "resync",
    );
  });
  it("rejects wrong project/session, malformed read fields and envelope revision mismatches", () => {
    expect(() =>
      sessionStreamValue(event("snapshot", session(1)), undefined, "session-b", "project-a"),
    ).toThrow();
    expect(() =>
      sessionStreamValue(event("snapshot", session(1)), undefined, "session-a", "project-b"),
    ).toThrow();
    expect(() =>
      sessionStreamValue(
        event("snapshot", { ...session(1), session: { ...session(1).session, blocks: [null] } }),
        undefined,
        "session-a",
        "project-a",
      ),
    ).toThrow();
    const wrongRevision = event("snapshot", session(1));
    wrongRevision.params.revision = 2;
    expect(() => sessionStreamValue(wrongRevision, undefined, "session-a", "project-a")).toThrow(
      /revision/,
    );
  });
});
