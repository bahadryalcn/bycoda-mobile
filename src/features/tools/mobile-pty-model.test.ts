import { expect, it } from "vitest";
import { readMobilePtyClosed, readMobilePtyLease, readMobilePtyList, readMobilePtyOutput } from "./mobile-pty-model";

it("accepts only the native physical-exit close confirmation", () => {
  expect(() => readMobilePtyClosed({ closed: true })).not.toThrow();
  for (const result of [{ state: "unknown" }, { closed: false }, { closed: "true" }, { closed: true, state: "unknown" }, {}, null, true])
    expect(() => readMobilePtyClosed(result)).toThrow("Mobile PTY close is not confirmed.");
});
const terminal = {
  terminalId: "sealed-id",
  epoch: "sealed-epoch",
  sourceSessionId: "source",
  name: "Mobile terminal",
  shell: "default",
  state: "running",
  cols: 80,
  rows: 24,
  exitCode: null,
  control: "mobile",
  replayStart: 0,
  replayEnd: 3,
};
it("accepts only scoped fresh PTY metadata, bounded leases and unique owned identities", () => {
  expect(readMobilePtyList({ terminals: [terminal] }, "source").terminals).toHaveLength(1);
  expect(() => readMobilePtyList({ terminals: [terminal] }, "foreign")).toThrow();
  expect(() => readMobilePtyList({ terminals: [terminal, terminal] }, "source")).toThrow();
  expect(() => readMobilePtyLease({ state: "unknown" }, "source")).toThrow();
  expect(
    readMobilePtyLease({ terminal, leaseId: "sealed-lease", expiresAt: 1 }, "source").terminal,
  ).toEqual(terminal);
});
it("preserves byte cursors across split UTF8 and refuses foreign epochs, gap tails and invalid base64", () => {
  const value = {
    terminalId: "id",
    epoch: "epoch",
    after: 0,
    next: 1,
    oldest: 0,
    end: 3,
    dataBase64: "4g==",
    state: "running",
    exitCode: null,
    gap: false,
    hasMore: true,
  };
  expect(readMobilePtyOutput(value, "id", "epoch", 0).next).toBe(1);
  expect(() => readMobilePtyOutput(value, "id", "foreign", 0)).toThrow();
  expect(() => readMobilePtyOutput({ ...value, next: 2 }, "id", "epoch", 0)).toThrow();
  expect(() =>
    readMobilePtyOutput({ ...value, dataBase64: "<script>" }, "id", "epoch", 0),
  ).toThrow();
  expect(() => readMobilePtyOutput({ ...value, gap: true }, "id", "epoch", 0)).toThrow();
  expect(
    readMobilePtyOutput(
      { ...value, gap: true, next: 0, oldest: 2, dataBase64: "", hasMore: false },
      "id",
      "epoch",
      0,
    ).gap,
  ).toBe(true);
});

it("encodes key-bar keys, pasted text and sticky modifiers as the bytes a terminal expects", async () => {
  const { PTY_INTERRUPT, ptyModifiedInput, ptyInput } = await import("./mobile-pty-model");
  const { terminalKeyInput } = await import("./terminal-keys");
  const text = (value: string) => Buffer.from(value, "base64").toString("utf8");
  const base64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
  const ctrl = { ctrl: true, alt: false };
  expect(text(PTY_INTERRUPT)).toBe("\x03");
  expect(text(ptyInput(terminalKeyInput("up")))).toBe("\x1b[A");
  expect(text(ptyInput(terminalKeyInput("up", ctrl)))).toBe("\x1b[1;5A");
  expect(text(ptyInput(terminalKeyInput("tab", ctrl)))).toBe("\t");
  expect(text(ptyInput("ğü ok"))).toBe("ğü ok");
  expect(text(ptyModifiedInput(base64("c"), ctrl))).toBe("\x03");
  expect(text(ptyModifiedInput(base64("dir"), ctrl))).toBe("\x04ir");
  expect(text(ptyModifiedInput(base64("ğ"), ctrl))).toBe("ğ");
  expect(text(ptyModifiedInput(base64("b"), { ctrl: false, alt: true }))).toBe("\x1bb");
});
