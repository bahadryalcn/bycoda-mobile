import { describe, expect, it } from "vitest";
import { activeProjectSessions, deduplicateProjects, projectSessionDirectory, runningProjectCounts, sessionDirectoryView } from "./activity-model";
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

describe("session directory view", () => {
  it("is shared while the cache data is unchanged and keeps unchanged rows", () => {
    const projects = [project("a")];
    const one = session("one", { updatedAt: 2 });
    const two = session("two", { updatedAt: 1, status: "idle" });
    const summaries = [{ projects: { a: { etag: "1", sessions: [one, two] } } }] as never[];
    const view = sessionDirectoryView(projects, summaries);
    expect(sessionDirectoryView(projects, [...summaries])).toBe(view);
    expect(view.sessions.map((row) => row.session.id)).toEqual(["one"]);
    const moved = session("two", { updatedAt: 3, status: "idle" });
    const next = sessionDirectoryView(projects, [{ projects: { a: { etag: "2", sessions: [one, moved] } } }] as never[]);
    expect(next).not.toBe(view);
    expect(next.directory[0]).toBe(view.directory[0]);
    expect(next.sessions).toBe(view.sessions);
    expect(next.directory[1]!.session).toBe(moved);
  });
});
