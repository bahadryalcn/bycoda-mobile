import { expect, it } from "vitest";
import { readDesktopManagement } from "./provider-desktop-model";
export const managementFixture = () => ({
  environmentId: "host",
  sourceSessionId: "session",
  projectCwd: "/project",
  workingCwd: "/project/worktree",
  sampledAt: 7,
  revision: "a".repeat(64),
  accountRevision: "a".repeat(64),
  accounts: [
    {
      provider: "claude",
      id: "default",
      label: "Work",
      color: null,
      isDefault: true,
      quota: {
        status: "ok",
        updatedAt: 1,
        session: { usedPercent: 30, windowMinutes: 300, resetsAt: null },
        weekly: null,
        monthly: null,
        renewalPending: false,
      },
    },
  ],
  mcp: [{ provider: "claude", name: "Docs", scope: "project", transport: "stdio", enabled: false }],
  coverage: {
    accountMetadata: "desktop-owner",
    quotaSource: "desktop-cache",
    mcpSource: "desktop-cache",
    truncated: false,
  },
});
it("accepts only the exact safe desktop response for the requested host/session", () => {
  const f = managementFixture();
  expect(readDesktopManagement(f, { environmentId: "host", sessionId: "session" })).toEqual(f);
  for (const field of ["configPath", "error", "command", "url", "token"])
    expect(() =>
      readDesktopManagement(
        { ...f, mcp: [{ ...f.mcp[0], [field]: "secret" }] },
        { environmentId: "host", sessionId: "session" },
      ),
    ).toThrow();
  expect(() =>
    readDesktopManagement(f, { environmentId: "other", sessionId: "session" }),
  ).toThrow();
  expect(() => readDesktopManagement(f, { environmentId: "host", sessionId: "other" })).toThrow();
});
it("rejects malformed quota, duplicate accounts and unbounded lists before caching", () => {
  const f = managementFixture();
  const expected = { environmentId: "host", sessionId: "session" };
  for (const value of [
    { ...f, accounts: [f.accounts[0], f.accounts[0]] },
    { ...f, accounts: Array(129).fill(f.accounts[0]) },
    {
      ...f,
      accounts: [
        {
          ...f.accounts[0],
          quota: {
            ...f.accounts[0].quota,
            session: { ...f.accounts[0].quota.session, usedPercent: 101 },
          },
        },
      ],
    },
    { ...f, coverage: { ...f.coverage, raw: "secret" } },
  ])
    expect(() => readDesktopManagement(value, expected)).toThrow();
});
