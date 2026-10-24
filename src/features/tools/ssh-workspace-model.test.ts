import { expect, it } from "vitest";
import {
  readSshCatalog,
  readSshWorkspaceReview,
  readSshWorkspaceStatus,
} from "./ssh-workspace-model";
const connection = {
  id: "saved",
  name: "Fixture",
  host: "fixture.invalid",
  port: 22,
  hasIdentity: true,
  hasJump: false,
  hasProxy: false,
};
const review = {
  reviewId: "v1." + "r".repeat(97),
  expiresAt: 100,
  operation: "connect",
  connection,
  configurationDigest: "a".repeat(64),
  terminalCount: 1,
  nativeApprovalRequired: true,
  phoneTerminal: false,
};
it("allows bounded opaque sealed review and workspace handles", () => {
  expect(
    readSshCatalog({
      connections: [connection],
      phoneTerminal: false,
      sftp: false,
      forwards: false,
      runbooks: false,
    }),
  ).toEqual([connection]);
  expect(readSshWorkspaceReview(review, "connect", "saved")).toEqual(review);
  expect(
    readSshWorkspaceStatus({
      state: "opened-on-computer",
      workspaceId: "h1." + "w".repeat(83),
      terminalCount: 1,
    }),
  ).toMatchObject({ state: "opened-on-computer" });
});
it("refuses private fields, raw endpoint config, inconsistent targets and fabricated full mobile capabilities", () => {
  for (const value of [
    {
      connections: [{ ...connection, identityFile: "/private" }],
      phoneTerminal: false,
      sftp: false,
      forwards: false,
      runbooks: false,
    },
    {
      connections: [connection],
      phoneTerminal: true,
      sftp: false,
      forwards: false,
      runbooks: false,
    },
  ])
    expect(() => readSshCatalog(value)).toThrow();
  expect(() =>
    readSshWorkspaceReview({ ...review, actorId: "injected" }, "connect", "saved"),
  ).toThrow();
  expect(() => readSshWorkspaceReview(review, "connect", "foreign")).toThrow();
  expect(() =>
    readSshWorkspaceReview(
      { ...review, operation: "close", workspaceId: "foreign" },
      "close",
      "wanted",
    ),
  ).toThrow();
  expect(() => readSshWorkspaceStatus({ state: "connected", prompt: "private" })).toThrow();
});
