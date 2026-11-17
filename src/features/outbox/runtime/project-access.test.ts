import { expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateProjectPrivacy, projectPrivacyKey } from "../../workspace/project-privacy-cache";
import { outboxProjectVisible } from "./project-access";

it("never authorizes sends from a cached transcript without directory proof", () => {
  const cache = new QueryClient();
  expect(outboxProjectVisible(cache, { id: "machine" }, "project")).toBe(false);
});
it("rejects stale directory proof after backgrounding or lock", async () => {
  const cache = new QueryClient();
  const machine = { id: "machine", capabilities: ["projects.directory.v1"] };
  outboxProjectVisible(cache, machine, "project");
  cache.setQueryData(projectPrivacyKey(machine.id, true), { privacyReady: true, projects: [{ id: "project", registered: true }] });
  expect(outboxProjectVisible(cache, machine, "project")).toBe(true);
  await invalidateProjectPrivacy(cache);
  expect(outboxProjectVisible(cache, machine, "project")).toBe(false);
});
