import { describe, expect, it } from "vitest";
import { activeProjectSessions, deduplicateProjects, projectSessionDirectory, runningProjectCounts } from "./activity-model";
import type { HostProject, HostSessionSummary } from "./wire";

const project = (id: string, cwd = id): HostProject => ({ id, cwd, name: "sampleproject" });
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
      project("a", "G:\\Projects\\SampleProject\\"),
      project("b", "g:/projects/sampleproject"),
      project("c", "/Projects/App"),
      project("d", "/projects/app"),
      project("b", "g:/projects/sampleproject"),
    ];
    expect(deduplicateProjects(rows, "b").map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("collects all batches, deduplicates sessions and prioritizes running work", () => {
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
    expect(rows.map((row) => row.session.id)).toEqual(["running", "waiting"]);
    expect(rows[0]!.project.id).toBe("b");
    expect(runningProjectCounts(rows)).toEqual({ b: 1 });
  });
  it("keeps ready and archived history discoverable without marking it active", () => {
    const projects = [project("a")];
    const summaries = [{ projects: { a: { etag: "a", sessions: [
      session("ready", { status: "idle", updatedAt: 9 }),
      session("archived", { status: "idle", archived: true, updatedAt: 8 }),
      session("running"),
    ] } } }];
    expect(projectSessionDirectory(projects, summaries).map((entry) => entry.session.id))
      .toEqual(["running", "ready", "archived"]);
    expect(activeProjectSessions(projects, summaries).map((entry) => entry.session.id)).toEqual(["running"]);
  });
});
