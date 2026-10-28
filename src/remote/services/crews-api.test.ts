import { expect, it, vi } from "vitest";
import type { HostRequest } from "../types";
import { createCrewsApi } from "./crews-api";
import { readonlyRequest } from "../request-policy";

it("scopes lifecycle operations to the requested project and keeps start request identity", async () => {
  const request = vi.fn(async () => ({}));
  const api = createCrewsApi(request as HostRequest);
  await api.crews.list("project");
  await api.crews.start("project", "definition", "Deliver this", "one-stable-request");
  await api.crews.control("project", "run", "stop");
  await api.crews.delete("project", "definition", 42);
  await api.crews.deleteRun("project", "run", 43);
  expect(request.mock.calls).toEqual([
    ["crews.list", { projectId: "project" }, undefined],
    ["crews.start", { projectId: "project", definitionId: "definition", prompt: "Deliver this", requestId: "one-stable-request" }, undefined],
    ["crews.stop", { projectId: "project", runId: "run" }, undefined],
    ["crews.delete", { projectId: "project", definitionId: "definition", expectedUpdatedAt: 42 }, undefined],
    ["crews.deleteRun", { projectId: "project", runId: "run", expectedUpdatedAt: 43 }, undefined],
  ]);
  for (const method of ["crews.list", "crews.get", "crews.schema", "crews.inspect"]) expect(readonlyRequest(method, {})).toBe(true);
  for (const method of ["crews.save", "crews.agent.save", "crews.agent.delete", "crews.start", "crews.resume", "crews.stop"]) expect(readonlyRequest(method, {})).toBe(false);
});
