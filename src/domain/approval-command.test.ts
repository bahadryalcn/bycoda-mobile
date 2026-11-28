import { expect, it, vi } from "vitest";
import { ApprovalCommandRefused, assertApprovalCommand, canAllowForSession, captureApprovalCommand } from "./approval-command";
import { dispatchCommand, UncertainCommand } from "../features/workspace/commands";
import type { HostTransport } from "../remote/transport";

const a = "12345678-1234-4123-8123-123456789abc";
const b = "abcdef12-1234-4123-9123-123456789abc";
const caps = ["sessions.approvalOccurrence.v1"];

it("captures the visible source tuple and never substitutes the next same-ID occurrence", () => {
  const approval = { requestId: 7, occurrenceId: a };
  const command = captureApprovalCommand("session", "run", approval, "allow");
  approval.occurrenceId = b;
  expect(command).toMatchObject({ requestId: 7, approvalOccurrenceId: a, decision: "allow" });
  expect(Object.isFrozen(command)).toBe(true);
  expect(captureApprovalCommand("session", "run", approval, "deny").approvalOccurrenceId).toBe(b);
});

it("refuses unsupported or missing source identity before any mobile transport attempt", async () => {
  const request = vi.fn();
  const client = {
    machine: { id: "original", capabilities: [] as string[] },
    request,
  } as unknown as HostTransport;
  const command = captureApprovalCommand(
    "session",
    "run",
    { requestId: 7, occurrenceId: a },
    "allow",
  );
  await expect(dispatchCommand(client, "command", command)).rejects.toThrow("Update the Host");
  client.machine.capabilities = caps;
  for (const approvalOccurrenceId of [undefined, "request-7", b.toUpperCase()]) {
    await expect(
      dispatchCommand(client, "command", { ...command, approvalOccurrenceId }),
    ).rejects.toThrow("cannot be verified");
  }
  expect(request).not.toHaveBeenCalled();
  expect(() => assertApprovalCommand([], { type: "cancel" })).not.toThrow();
});

it("retains the original occurrence, choice, authority and machine through uncertain receipt-only reconciliation", async () => {
  let reject!: (error: unknown) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValueOnce(null);
  const client = {
    machine: { id: "original", capabilities: caps },
    request,
  } as unknown as HostTransport;
  const input = {
    ...captureApprovalCommand("session", "run", { requestId: 7, occurrenceId: a }, "allow"),
    authorityGeneration: 2,
  };
  const pending = dispatchCommand(client, "same-command", input).catch((error) => error);
  input.approvalOccurrenceId = b;
  input.authorityGeneration = 9;
  client.machine.id = "replacement";
  reject({ kind: "network", uncertain: true });
  const error = await pending;
  expect(error).toBeInstanceOf(UncertainCommand);
  expect(error).toMatchObject({
    commandId: "same-command",
    machineId: "original",
    authorityGeneration: 2,
    approval: { requestId: 7, occurrenceId: a, decision: "allow" },
  });
  expect(request.mock.calls.map((call) => call[0])).toEqual([
    "commands.dispatch",
    "commands.status",
  ]);
  expect(request.mock.calls[0][1]).toMatchObject({
    commandId: "same-command",
    approvalOccurrenceId: a,
    authorityGeneration: 2,
  });
  expect(request.mock.calls[1][1]).toEqual({ commandId: "same-command" });
});

it("offers and sends Allow for this session only for a Host-scoped request on a Host with grants", () => {
  const grants = [...caps, "sessions.approvalGrants.v1"];
  const scoped = { occurrenceId: a, sessionApprovalScope: "claude:Glob:workspace-filename-search" };
  expect(canAllowForSession(grants, scoped)).toBe(true);
  expect(canAllowForSession(caps, scoped)).toBe(false);
  expect(canAllowForSession(grants, { occurrenceId: a })).toBe(false);
  expect(canAllowForSession(grants, { ...scoped, occurrenceId: "request-7" })).toBe(false);
  expect(canAllowForSession(grants, { ...scoped, decided: "allow" })).toBe(false);

  const command = captureApprovalCommand("session", "run", { requestId: 7, occurrenceId: a }, "allow", true);
  expect(command).toMatchObject({ decision: "allow", allowForSession: true });
  expect(captureApprovalCommand("session", "run", { requestId: 7, occurrenceId: a }, "deny", true)).not.toHaveProperty("allowForSession");
  expect(() => assertApprovalCommand(grants, command)).not.toThrow();
  expect(() => assertApprovalCommand(caps, command)).toThrow(ApprovalCommandRefused);
  expect(() => assertApprovalCommand(grants, { ...command, decision: "deny" })).toThrow("whole session");
});
