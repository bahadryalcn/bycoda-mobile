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
    expect(readonlyRequest("social.request", { action: "policy.saveReviewed" })).toBe(false);
  });

  it("retries host tool reads but never replays process control", () => {
    for (const method of [
      "runtimeLogs.read",
      "usage.sessions.read",
      "providers.center.read",
      "history.import.preview",
      "history.import.status",
      "projects.organization.read",
      "projects.organization.status",
      "worktrees.removal.review",
      "worktrees.removal.status",
      "preferences.desktop.read",
      "preferences.desktop.template.read",
      "preferences.desktop.status",
      "providers.desktop.read",
      "providers.desktop.status",
      "ssh.workspace.catalog.read",
      "ssh.workspace.review",
      "ssh.workspace.close.review",
      "ssh.workspace.status",
      "terminals.pty.desktop.list",
      "terminals.pty.desktop.read",
      "terminals.pty.desktop.status",
      "host.access.read",
      "runtimeLogs.sources",
      "devServers.list",
      "devServers.details",
      "devServers.logs",
      "devices.status",
      "devices.list",
      "devices.capture",
      "devices.preview.mobile.status",
      "devices.preview.impact",
      "browser.status",
      "browser.frame",
      "terminals.list",
      "terminals.read",
    ])
      expect(readonlyRequest(method, {})).toBe(true);
    for (const method of [
      "devServers.start",
      "providers.acp.patchMetadata",
      "shell.setProfileReviewed",
      "devices.revokeOther",
      "devices.revokeSelf",
      "history.import.commit",
      "history.import.cancel",
      "projects.organization.patch",
      "worktrees.removal.approve",
      "preferences.desktop.patch",
      "providers.desktop.patch",
      "providers.desktop.quota.refresh",
      "ssh.workspace.approve",
      "ssh.workspace.close.approve",
      "terminals.pty.desktop.create",
      "terminals.pty.desktop.attach",
      "terminals.pty.desktop.write",
      "terminals.pty.desktop.resize",
      "terminals.pty.desktop.detach",
      "terminals.pty.desktop.close",
      "tunnels.start",
      "tunnels.stop",
      "devServers.stop",
      "devServers.restart",
      "devServers.kill",
      "devices.boot",
      "devices.preview.mobile.start",
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
