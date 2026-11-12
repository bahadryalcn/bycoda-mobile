import { describe, expect, it, vi } from "vitest";
import { applyProjectChanges, latestProjectActivity, readProjectSummaries } from "./project-summaries";
import type {
  HostSessionSummary,
  MachineChanges,
} from "../../../../src/features/connections/model/protocol";

const row = (id: string, title = id): HostSessionSummary => ({
  id,
  title,
  projectId: "p",
  harness: "codex",
  revision: 1,
  status: "idle",
  updatedAt: 1,
});
const changes = (projects: MachineChanges["projects"], reset = false): MachineChanges => ({
  instanceId: "instance",
  reset,
  sessions: [],
  projects,
});

describe("batched project summaries", () => {
  it("applies upserts and removals while retaining unchanged sessions", () => {
    const known = {
      instanceId: "instance",
      projects: { p: { etag: "old", sessions: [row("keep"), row("remove"), row("edit")] } },
    };
    const next = applyProjectChanges(
      known,
      changes([
        {
          projectId: "p",
          base: "old",
          etag: "next",
          upserts: [row("edit", "changed"), row("new")],
          removed: ["remove"],
        },
      ]),
    );
    expect(next.projects.p.sessions.map((session) => [session.id, session.title])).toEqual([
      ["keep", "keep"],
      ["edit", "changed"],
      ["new", "new"],
    ]);
    expect(next.projects.p.etag).toBe("next");
  });

  it("rejects an obsolete baseline and removes stale state after host restart", () => {
    const known = {
      instanceId: "instance",
      projects: { stale: { etag: "old", sessions: [row("stale")] } },
    };
    expect(() =>
      applyProjectChanges(
        known,
        changes([{ projectId: "stale", base: "wrong", etag: "next", upserts: [] }]),
      ),
    ).toThrow("baseline");
    const reset = applyProjectChanges(
      known,
      changes([{ projectId: "p", etag: "fresh", sessions: [row("fresh")] }], true),
    );
    expect(Object.keys(reset.projects)).toEqual(["p"]);
  });

  it("polls all visible project summaries in one bounded request with known etags", async () => {
    const request = vi.fn().mockResolvedValue(changes([]));
    const known = { instanceId: "instance", projects: { p: { etag: "known", sessions: [] } } };
    await readProjectSummaries({ request }, ["p", "q"], known);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toEqual({
      instanceId: "instance",
      sessions: [],
      projects: [
        { projectId: "p", known: "known" },
        { projectId: "q", known: undefined },
      ],
      waitMs: 0,
    });
  });

  it("reads every bounded project on unsupported hosts", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Unsupported host method"), { kind: "unsupported" }),
      )
      .mockResolvedValue([]);
    const result = await readProjectSummaries(
      { request },
      Array.from({ length: 40 }, (_, index) => String(index)),
      undefined,
    );
    expect(result.limited).toBe(true);
    expect(request).toHaveBeenCalledTimes(33);
    expect(request.mock.calls[0][1].projects).toHaveLength(32);
    expect(Object.keys(result.projects)).toHaveLength(32);
  });

  it("keeps other projects when one per-project read fails", async () => {
    const failure = new Error("Host read failed.");
    const request = vi.fn(async (_method: string, params: Record<string, unknown>) => {
      if (params.projectId === "broken") throw failure;
      return [row(`${params.projectId}-session`)];
    }) as unknown as <T>(method: string, params: Record<string, unknown>) => Promise<T>;
    const known = { projects: { broken: { etag: "", sessions: [row("old")] } } };
    const result = await readProjectSummaries({ request }, ["a", "broken", "b"], known, false);
    expect(result.projects.a?.sessions[0]?.id).toBe("a-session");
    expect(result.projects.b?.sessions[0]?.id).toBe("b-session");
    // The failed project keeps its last known rows and is reported as incomplete.
    expect(result.projects.broken?.sessions[0]?.id).toBe("old");
    expect(result.failed).toEqual(["broken"]);
    await expect(
      readProjectSummaries({ request }, ["broken"], undefined, false),
    ).rejects.toBe(failure);
  });

  it("marks a batch with more than thirty-two projects as limited", async () => {
    const request = vi.fn().mockResolvedValue(changes([]));
    const result = await readProjectSummaries(
      { request },
      Array.from({ length: 40 }, (_, index) => String(index)),
      undefined,
    );
    expect(result.limited).toBe(true);
    expect(request.mock.calls[0][1].projects).toHaveLength(32);
  });
});

describe("latestProjectActivity", () => {
  it("keeps the newest non-archived update per project", () => {
    expect(
      latestProjectActivity([
        { project: { id: "a" }, session: { updatedAt: 5 } },
        { project: { id: "a" }, session: { updatedAt: 9 } },
        { project: { id: "a" }, session: { updatedAt: 99, archived: true } },
        { project: { id: "b" }, session: { updatedAt: 3 } },
      ]),
    ).toEqual({ a: 9, b: 3 });
  });
});
