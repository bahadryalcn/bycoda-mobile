import { describe, expect, it } from "vitest";
import { readonlyRequest } from "./request-policy";

describe("mobile media retry policy", () => {
  it("can retry status, attachment chunks and artifact reads after transport failures", () => {
    for (const method of ["attachments.status", "attachments.read", "html.artifacts.list", "html.artifacts.read"])
      expect(readonlyRequest(method, {})).toBe(true);
  });

  it("never automatically replays uploads, commands or arbitrary workspace actions", () => {
    for (const method of ["attachments.upload", "commands.dispatch", "workspace.run"])
      expect(readonlyRequest(method, {})).toBe(false);
    expect(readonlyRequest("social.request", { action: "messages.send" })).toBe(false);
  });
});
