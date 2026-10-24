import { expect, it } from "vitest";
import { privatePreviewUrl, reviewServer, serverReviewMatches } from "./dev-server-recovery";
import type { DevServerDetails } from "./types";
const details: DevServerDetails = { expectedImpact: "a".repeat(64), server: {
  id: "server", projectId: "project", managed: true, association: "managed", name: "Web",
  state: "running", endpoints: [], logsAvailable: true,
  process: { pid: 10, startedAt: "birth", name: "node" },
}, descendants: [{ pid: 11, startedAt: "child", name: "worker" }], affectedPorts: [3000] };
it("freezes the reviewed machine, birth identities and ports for explicit force confirmation", () => {
  const review = reviewServer(details, "machine", "project", "kill", true);
  expect(review.target).toEqual({ id: "server", projectId: "project", tree: true,
    identity: { pid: 10, startedAt: "birth" }, expectedImpact: "a".repeat(64) });
  expect(review.processes.map((entry) => entry.pid)).toEqual([10, 11]);
  expect(review.ports).toEqual([3000]);
  expect(serverReviewMatches(review, "other", "project", "server")).toBe(false);
  expect(serverReviewMatches(review, "machine", "other", "server")).toBe(false);
  expect(serverReviewMatches(review, "machine", "project", "other")).toBe(false);
  expect(serverReviewMatches(review, "machine", "project", "server")).toBe(true);
});
it("refuses old hosts, incomplete restart impact and foreign project targets", () => {
  expect(() => reviewServer({ ...details, expectedImpact: undefined }, "m", "project", "kill", true)).toThrow();
  expect(() => reviewServer(details, "m", "project", "restart", false)).toThrow();
  expect(() => reviewServer(details, "m", "other", "kill", true)).toThrow();
});
it("keeps private preview on a credential-free HTTP endpoint and maps wildcard binding to host loopback", () => {
  expect(privatePreviewUrl("http://0.0.0.0:3000")).toBe("http://127.0.0.1:3000/");
  expect(privatePreviewUrl("http://[::]:3000")).toBe("http://[::1]:3000/");
  expect(() => privatePreviewUrl("http://user:password@localhost:3000")).toThrow();
  expect(() => privatePreviewUrl("file:///secret")).toThrow();
});
