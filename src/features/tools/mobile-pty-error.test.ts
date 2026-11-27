import { expect, it } from "vitest";
import { ptyRecoveryMessage } from "./mobile-pty-error";
it("gives explicit status recovery without replaying an unconfirmed terminal close", () => {
  const message = ptyRecoveryMessage(new Error("Mobile PTY close is not confirmed."), (_tr, en) => en);
  expect(message).toBe("Terminal closure is not confirmed. Keep this view open and check the close status.");
});
const english = (_tr: string, en: string) => en;

it("explains the exact desktop conversation guard without suggesting a connection failure", () => {
  const guard = "Terminal lifecycle requires the calling conversation active in its local project workspace.";
  const recovery = "Open this session in its local project in bycoda's main desktop window and keep it selected. Then reopen the terminal on your phone.";
  expect(ptyRecoveryMessage(new Error(guard), english)).toBe(recovery);
  expect(ptyRecoveryMessage(guard, english)).toBe(recovery);
  expect(ptyRecoveryMessage(new Error(guard), (tr) => tr)).toBe(
    "Bu oturumu bilgisayarda bycoda'nın ana penceresinde, kendi yerel projesinde aç ve seçili bırak. Ardından telefonda terminali yeniden aç.",
  );
  expect(ptyRecoveryMessage(new Error(`${guard} Permission denied.`), english)).toBeUndefined();
  expect(ptyRecoveryMessage(new Error("Conversation workspace is unavailable or locked."), english)).toBeUndefined();
  expect(ptyRecoveryMessage(new Error("Terminal lifecycle is unavailable in this window."), english)).toBeUndefined();
});

it("provides connection recovery for known local guards without relabeling host errors", () => {
  expect(ptyRecoveryMessage(new Error("Reviewed machine is unavailable"), english)).toBe("Connect a computer first, then reopen the terminal.");
  expect(ptyRecoveryMessage(new Error("Mobile PTY source changed; never replay input"), english)).toContain("Previous input was not replayed");
  expect(ptyRecoveryMessage(new Error("Mobile PTY source is unavailable"), english)).toContain("Unlock the app");
  expect(ptyRecoveryMessage(new Error("Host PTY protocol rejected: capability unavailable"), english)).toBeUndefined();
  expect(ptyRecoveryMessage(null, english)).toBeUndefined();
});
