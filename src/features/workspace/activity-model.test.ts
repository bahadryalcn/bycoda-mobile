import { describe, expect, it } from "vitest";
import { activeProjectSessions, deduplicateProjects } from "./activity-model";
import type { HostProject, HostSessionSummary } from "./wire";

const project = (id: string, cwd = id): HostProject => ({ id, cwd, name: "monocode" });
const session = (id: string, fields: Partial<HostSessionSummary> = {}): HostSessionSummary => ({
  id,
  title: id,
  projectId: "a",
  harness: "codex",
  revision: 1,
  status: "running",
  updatedAt: 1,
  ...fields,
});
describe("workspace activity", () => {
  it("retains distinct host IDs for folder aliases and only removes repeated IDs", () => {
    const rows = [
      project("a", "G:\\Projects\\MonoCode\\"),
      project("b", "g:/projects/monocode"),
      project("c", "/Projects/App"),
      project("d", "/projects/app"),
      project("b", "g:/projects/monocode"),
    ];
    expect(deduplicateProjects(rows, "b").map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("collects all batches, deduplicates sessions and prioritizes answers", () => {
    const projects = [project("a"), project("b")];
    const rows = activeProjectSessions(projects, [
      {
        projects: {
          a: {
            etag: "a",
            sessions: [
              session("running"),
              session("archived", { archived: true }),
              session("idle", { status: "idle" }),
            ],
          },
        },
      },
      {
        projects: {
          b: {
            etag: "b",
            sessions: [
              session("running", { updatedAt: 2 }),
              session("waiting", { needsInput: true, status: "idle" }),
            ],
          },
        },
      },
    ]);
    expect(rows.map((row) => row.session.id)).toEqual(["waiting", "running"]);
    expect(rows[1]!.project.id).toBe("b");
  });
});
