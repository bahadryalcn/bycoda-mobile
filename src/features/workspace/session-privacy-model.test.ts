import { expect, it } from "vitest";
import { sessionPrivacy } from "./session-privacy-model";
const normal = { readable: true, pending: false, projects: [{ id: "visible" }], sessionId: "session", routeProjectId: "visible", cached: { projectId: "visible", session: { id: "session" } } };
it("allows the exact visible project/session and permits a normal uncached project-scoped read", () => {
  expect(sessionPrivacy(normal)).toEqual({ canRead: true, visible: true, projectId: "visible" });
  expect(sessionPrivacy({ ...normal, cached: undefined })).toEqual({ canRead: true, visible: false, projectId: "visible" });
  expect(sessionPrivacy({ ...normal, routeProjectId: undefined })).toEqual({ canRead: true, visible: true, projectId: "visible" });
});
it("conceals wrong-project cached deep links, hidden projects, pending privacy and absent project identity", () => {
  for (const value of [{ ...normal, cached: { ...normal.cached, projectId: "hidden" } }, { ...normal, projects: [] }, { ...normal, pending: true }, { ...normal, projects: undefined },
    { ...normal, cached: { ...normal.cached, session: { id: "other" } } }, { ...normal, routeProjectId: undefined, cached: undefined }])
    expect(sessionPrivacy(value)).toMatchObject({ canRead: false, visible: false });
});
it("lock, background and revoked consent/access fail closed even with a complete cached transcript", () => {
  expect(sessionPrivacy({ ...normal, readable: false })).toEqual({ canRead: false, visible: false, reason: "access" });
});
