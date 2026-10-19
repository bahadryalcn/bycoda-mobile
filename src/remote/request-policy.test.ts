import { describe, expect, it } from "vitest";
import { readonlyRequest } from "./request-policy";

describe("mobile media retry policy", () => {
  it("retries queue reads without replaying edits or queue consumption", () => {
    expect(readonlyRequest("sessions.queue.get", {})).toBe(true);
    for (const method of ["sessions.queue.change", "sessions.queue.claim", "sessions.queue.finish"])
      expect(readonlyRequest(method, {})).toBe(false);
  });
  it("can retry status, attachment chunks and artifact reads after transport failures", () => {
    for (const method of [
      "attachments.status",
      "attachments.read",
      "html.artifacts.list",
      "html.artifacts.read",
    ])
      expect(readonlyRequest(method, {})).toBe(true);
  });

  it("never automatically replays uploads, commands or arbitrary workspace actions", () => {
    for (const method of ["attachments.upload", "commands.dispatch", "workspace.run"])
      expect(readonlyRequest(method, {})).toBe(false);
    expect(readonlyRequest("social.request", { action: "messages.send" })).toBe(false);
  });

  it("retries host tool reads but never replays process control", () => {
    for (const method of [
      "runtimeLogs.read",
      "runtimeLogs.sources",
      "devServers.list",
      "devServers.details",
      "devServers.logs",
      "devices.status",
      "devices.list",
      "devices.capture",
      "browser.status",
      "browser.frame",
      "terminals.list",
      "terminals.read",
    ])
      expect(readonlyRequest(method, {})).toBe(true);
    for (const method of [
      "devServers.start",
      "devServers.stop",
      "devServers.restart",
      "devServers.kill",
      "devices.boot",
      "devices.action",
      "browser.open",
      "browser.input",
      "browser.claim",
      "browser.release",
      "terminals.create",
      "terminals.write",
      "terminals.interrupt",
      "terminals.close",
    ])
      expect(readonlyRequest(method, {})).toBe(false);
  });
});
