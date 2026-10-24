import { expect, it } from "vitest";
import { readOrganization, readOrganizationStatus, validateOrganizationChange, moveOrganizationId } from "./project-organization-model";
export const organizationFixture = { environmentId: "env", sourceSessionId: "source", projectCwd: "/project", workingCwd: "/project/worktree", revision: "a".repeat(64), atomic: false, name: "Project", customName: "", groupId: null, groups: [{ id: "group", name: "Available" }], projectPosition: 0, projectCount: 1, folders: [{ id: "folder", name: "Notes", sessionIds: ["s1"], collapsed: true }, { id: "child", name: "Child", sessionIds: ["s2"], parentId: "folder", collapsed: false }], sessions: [{ id: "s1", title: "First" }, { id: "s2", title: "Second" }], order: { loose: ["s1", "s2"] } };
it("accepts only source-bound bounded canonical metadata with explicit optimistic semantics", () => {
 expect(readOrganization(organizationFixture, "env", "source").atomic).toBe(false);
 expect(() => readOrganization(organizationFixture, "foreign", "source")).toThrow();
 expect(() => readOrganization({ ...organizationFixture, atomic: true }, "env", "source")).toThrow();
 expect(() => readOrganization({ ...organizationFixture, command: "invoke" }, "env", "source")).toThrow();
 expect(() => readOrganization({ ...organizationFixture, folders: [{ ...organizationFixture.folders[0], sessionIds: ["foreign"] }] }, "env", "source")).toThrow();
});
it("checks form selections before a durable mutation claim", () => {
 const snapshot = readOrganization(organizationFixture, "env", "source");
 expect(() => validateOrganizationChange(snapshot, { kind: "folderCreate", name: "", sessionIds: [] })).toThrow();
 expect(() => validateOrganizationChange(snapshot, { kind: "sessionMove", sessionId: "foreign", folderId: null })).toThrow();
 expect(() => validateOrganizationChange(snapshot, { kind: "folderMove", folderId: "folder", target: { kind: "into", id: "child" } })).toThrow();
 expect(validateOrganizationChange(snapshot, { kind: "projectName", name: "" })).toEqual({ kind: "projectName", name: "" });
 expect(moveOrganizationId(["s1", "s2"], "s2", -1)).toEqual(["s2", "s1"]);
});
it("keeps unknown status distinct from applied and validates its current snapshot", () => {
 expect(readOrganizationStatus({ state: "unknown" }, "env", "source")).toEqual({ state: "unknown" });
 expect(() => readOrganizationStatus({ state: "applied" }, "env", "source")).toThrow();
 expect(readOrganizationStatus({ state: "applied", snapshot: organizationFixture }, "env", "source").snapshot?.projectCwd).toBe("/project");
});
