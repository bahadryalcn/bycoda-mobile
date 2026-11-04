import { expect, it } from "vitest";
import { readShellChoices, shellChoiceRequest } from "./shell-profile-model";
const snapshot = { profiles: [{ id: "sh", name: "Shell", path: "/bin/sh", kind: "sh" }], defaultId: "sh", chosenId: "removed" };
it("retains a missing saved shell for explicit comparison and validates installed selection", () => {
  expect(shellChoiceRequest(readShellChoices(snapshot), "sh")).toEqual({ profile: "sh", expectedChosenId: "removed" });
  expect(shellChoiceRequest(snapshot, "")).toEqual({ profile: null, expectedChosenId: "removed" });
  expect(() => shellChoiceRequest(snapshot, "missing")).toThrow(/installed/);
});
it("refuses malformed and duplicate shell responses", () => {
  for (const value of [null, { ...snapshot, defaultId: "missing" }, { ...snapshot, profiles: [snapshot.profiles[0], snapshot.profiles[0]] }, { ...snapshot, chosenId: "bad\nvalue" }])
    expect(() => readShellChoices(value)).toThrow(/Invalid/);
});

it("accepts installed Unix executable-path IDs without altering their identity", () => {
  const unix = { profiles: [{ id: "/bin/bash", name: "Bash", path: "/bin/bash", kind: "bash" }], defaultId: "/bin/bash", chosenId: "/opt/old shell/bin/zsh" };
  expect(shellChoiceRequest(readShellChoices(unix), "/bin/bash")).toEqual({ profile: "/bin/bash", expectedChosenId: "/opt/old shell/bin/zsh" });
});
it.each(["", " ", "bad\tvalue", "bad\u007fvalue", "x".repeat(4097)])("rejects invalid shell IDs %j", id => {
  expect(() => readShellChoices({ ...snapshot, chosenId: id })).toThrow("Invalid command shell preferences");
});
