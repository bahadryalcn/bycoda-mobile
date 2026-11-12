import type {
  MobilePtyLease,
  MobilePtyList,
  MobilePtyRead,
  MobilePtyTerminal,
} from "../../../../src/features/host-tools/mobilePtyTypes";
export type { MobilePtyLease, MobilePtyList, MobilePtyRead, MobilePtyTerminal };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value);
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const fields = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
export function readMobilePtyTerminal(value: unknown, source: string): MobilePtyTerminal {
  if (
    !record(value) ||
    !fields(value, [
      "terminalId",
      "epoch",
      "sourceSessionId",
      "name",
      "shell",
      "state",
      "cols",
      "rows",
      "exitCode",
      "control",
      "replayStart",
      "replayEnd",
    ]) ||
    !text(value.terminalId) ||
    !text(value.epoch) ||
    value.sourceSessionId !== source ||
    !text(value.name) ||
    !text(value.shell) ||
    !["running", "exited"].includes(String(value.state)) ||
    !["mobile", "none"].includes(String(value.control)) ||
    !integer(value.cols) ||
    Number(value.cols) < 2 ||
    Number(value.cols) > 400 ||
    !integer(value.rows) ||
    Number(value.rows) < 2 ||
    Number(value.rows) > 200 ||
    !(value.exitCode === null || Number.isInteger(value.exitCode)) ||
    !integer(value.replayStart) ||
    !integer(value.replayEnd) ||
    Number(value.replayStart) > Number(value.replayEnd)
  )
    throw new Error("Invalid mobile PTY metadata");
  return value as MobilePtyTerminal;
}
export function readMobilePtyList(value: unknown, source: string): MobilePtyList {
  if (
    !record(value) ||
    !fields(value, ["terminals"]) ||
    !Array.isArray(value.terminals) ||
    value.terminals.length > 16
  )
    throw new Error("Invalid mobile PTY list");
  const terminals = value.terminals.map((row) => readMobilePtyTerminal(row, source));
  if (new Set(terminals.map((row) => row.terminalId)).size !== terminals.length)
    throw new Error("Duplicate mobile PTY identity");
  return { terminals };
}
export function readMobilePtyLease(value: unknown, source: string): MobilePtyLease {
  if (
    !record(value) ||
    !fields(value, ["terminal", "leaseId", "expiresAt"]) ||
    !text(value.leaseId) ||
    !integer(value.expiresAt)
  )
    throw new Error("Mobile PTY creation or control is not confirmed");
  return {
    terminal: readMobilePtyTerminal(value.terminal, source),
    leaseId: value.leaseId,
    expiresAt: Number(value.expiresAt),
  };
}
export function readMobilePtyOutput(
  value: unknown,
  id: string,
  epoch: string,
  after: number,
): MobilePtyRead {
  if (
    !record(value) ||
    !fields(value, [
      "terminalId",
      "epoch",
      "after",
      "next",
      "oldest",
      "end",
      "dataBase64",
      "state",
      "exitCode",
      "gap",
      "hasMore",
    ]) ||
    value.terminalId !== id ||
    value.epoch !== epoch ||
    value.after !== after ||
    ![value.next, value.oldest, value.end].every(integer) ||
    Number(value.next) > Number(value.end) ||
    Number(value.oldest) > Number(value.end) ||
    typeof value.dataBase64 !== "string" ||
    value.dataBase64.length > 43692 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.dataBase64) ||
    typeof value.gap !== "boolean" ||
    typeof value.hasMore !== "boolean" ||
    !["running", "exited"].includes(String(value.state)) ||
    !(value.exitCode === null || Number.isInteger(value.exitCode))
  )
    throw new Error("Invalid PTY output stream");
  const length =
    (value.dataBase64.length / 4) * 3 -
    (value.dataBase64.endsWith("==") ? 2 : value.dataBase64.endsWith("=") ? 1 : 0);
  if (
    value.gap
      ? length !== 0 || value.next !== after || value.hasMore
      : Number(value.next) !== after + length ||
        after < Number(value.oldest) ||
        value.hasMore !== Number(value.next) < Number(value.end)
  )
    throw new Error("PTY byte cursor changed");
  return value as MobilePtyRead;
}

/** Terminal key bytes (base64) for the special-keys row; the PTY write API takes base64 input. */
export const PTY_KEYS = {
  escape: "Gw==",
  tab: "CQ==",
  interrupt: "Aw==",
  up: "G1tB",
  down: "G1tC",
  right: "G1tD",
  left: "G1tE",
} as const;
