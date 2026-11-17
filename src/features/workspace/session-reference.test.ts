import { describe, expect, it, vi } from "vitest";
import {
  parseSessionReference,
  parsePromptLink,
  rewriteSessionReferencePath,
  referenceMachines,
  resolvedSessionRoute,
  resolveSessionReference,
} from "./session-reference";
import type { HostRequest } from "../../remote/types";

const native = "bycoda://session/v1/native/store/profile/session";
const https = "https://link.bycoda.codes/session/v1/native/store/profile/session";

describe("session reference entry", () => {
  it("validates and rewrites prompt links without sending", () => {
    expect(parsePromptLink("bycoda://new/v1?prompt=Hello%20world&project=demo"))
      .toEqual({ prompt: "Hello world", project: "demo" });
    expect(rewriteSessionReferencePath("/new/v1?prompt=Hello&project=demo"))
      .toBe("/sessions?new=1&prompt=Hello&project=demo");
    expect(rewriteSessionReferencePath("bycoda://new/v1?prompt=a+b%26c&project=my%20app"))
      .toBe("/sessions?new=1&prompt=a%20b%26c&project=my%20app");
    for (const link of ["bycoda://new/v1?prompt=a&prompt=b", "bycoda://new/v1?prompt=%zz", "bycoda://new/v1?prompt=a&project=..", `bycoda://new/v1?prompt=${"a".repeat(8001)}`]) {
      expect(parsePromptLink(link)).toBeNull();
    }
  });
  it("retains exact native identity and cited turn for both supported schemes", () => {
    const expected = {
      locator: {
        kind: "native",
        sourceStoreId: "store",
        sourceProfileId: "profile",
        sessionId: "session",
      },
      turnId: "turn",
    };
    expect(parseSessionReference(`${native}?turn=turn`)).toEqual(expected);
    expect(parseSessionReference(`${https}?turn=turn`)).toEqual(expected);
  });

  it.each([
    "https://example.com/session/v1/native/store/profile/session",
    "https://link.bycoda.codes.evil.test/session/v1/native/store/profile/session",
    "https://user@link.bycoda.codes/session/v1/native/store/profile/session",
    "https://link.bycoda.codes:443/session/v1/native/store/profile/session",
    "http://link.bycoda.codes/session/v1/native/store/profile/session",
    `${https}/extra`,
    `${https}#fragment`,
    `${https}?turn=a&turn=b`,
    `${https}?token=secret`,
    native.replace("profile", "%2E%2E"),
    native.replace("profile", "%00"),
    native.replace("profile", "%zz"),
    native.replace("profile", " profile"),
    native.replace("v1", "v2"),
    `${native}\n`,
  ])("rejects unsupported or ambiguous reference %s", (value) => {
    expect(parseSessionReference(value)).toBeNull();
  });

  it("rewrites cold and warm entry without rewriting existing widget routes", () => {
    expect(rewriteSessionReferencePath(https)).toBe(
      `/session-reference?link=${encodeURIComponent(https)}`,
    );
    expect(rewriteSessionReferencePath(native)).toBe(
      `/session-reference?link=${encodeURIComponent(native)}`,
    );
    expect(rewriteSessionReferencePath("/session/v1/native/store/profile/session")).toContain(
      "/session-reference?link=",
    );
    const widget = "bycoda://session/session?projectId=project&machineId=machine";
    expect(rewriteSessionReferencePath(widget)).toBe(widget);
    expect(rewriteSessionReferencePath("/machines")).toBe("/machines");
    expect(rewriteSessionReferencePath(`${https}?token=secret`)).toBe("/session-reference");
  });

  it("filters Host references by exact environment and never guesses a Native owner", () => {
    const machines = [
      { id: "first", environmentId: "one" },
      { id: "second", environmentId: "two" },
    ];
    expect(
      referenceMachines(
        { locator: { kind: "host", environmentId: "two", sessionId: "session" } },
        machines,
      ),
    ).toEqual([machines[1]]);
    expect(referenceMachines(parseSessionReference(native)!, machines)).toEqual(machines);
  });

  it("only routes a validated resolver response in its captured machine scope", () => {
    expect(
      resolvedSessionRoute(
        { projectId: "project", session: { id: "session" } },
        "machine",
        "session",
      ),
    ).toEqual({
      pathname: "/session/[id]",
      params: { id: "session", projectId: "project", machineId: "machine" },
    });
    expect(
      resolvedSessionRoute(
        { projectId: "project", session: { id: "session" } },
        "machine",
        "session",
        "turn",
      ).params,
    ).toMatchObject({ targetTurnId: "turn" });
    expect(() =>
      resolvedSessionRoute(
        { projectId: "project", session: { id: "other" } },
        "machine",
        "session",
      ),
    ).toThrow();
    expect(() =>
      resolvedSessionRoute({ session: { id: "session" } }, "machine", "session"),
    ).toThrow();
    expect(() =>
      resolvedSessionRoute({ projectId: "project", session: { id: "session" } }, "", "session"),
    ).toThrow();
  });

  it("never sends references to an old Host that could ignore owner identity", async () => {
    const request = vi.fn();
    await expect(
      resolveSessionReference(
        parseSessionReference(native)!,
        { id: "machine", environmentId: "host", capabilities: [] },
        request,
        () => undefined,
      ),
    ).rejects.toMatchObject({ kind: "unsupported" });
    expect(request).not.toHaveBeenCalled();
  });

  it("sends full identity to the authorized Host and refuses a changed scope after the read", async () => {
    const request = vi.fn(async () => ({ projectId: "project", session: { id: "session" } }));
    const reference = parseSessionReference(`${native}?turn=turn`)!;
    const machine = {
      id: "machine",
      environmentId: "host",
      capabilities: ["sessions.references.v1"],
    };
    await expect(
      resolveSessionReference(reference, machine, request as HostRequest, () => undefined),
    ).resolves.toMatchObject({
      params: { machineId: "machine", id: "session", targetTurnId: "turn" },
    });
    expect(request).toHaveBeenCalledWith(
      "sessions.get",
      { sessionId: "session", preview: true, summary: true, reference: reference.locator },
      { signal: undefined, retry: false },
    );
    let checks = 0;
    await expect(
      resolveSessionReference(reference, machine, request as HostRequest, () => {
        if (++checks > 1) throw new Error("Scope changed");
      }),
    ).rejects.toThrow("Scope changed");
    const hostReference = parseSessionReference("bycoda://session/v1/host/other/session")!;
    request.mockClear();
    await expect(
      resolveSessionReference(hostReference, machine, request as HostRequest, () => undefined),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
