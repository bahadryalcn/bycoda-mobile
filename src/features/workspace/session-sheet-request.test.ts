import { beforeEach, expect, it } from "vitest";
import { openSessionSheet, useSessionSheetRequest } from "./session-sheet-request";

beforeEach(() => useSessionSheetRequest.setState({ request: null }));

it("is consumed once by the toolbar of the session that asked", () => {
  openSessionSheet("machine", "session", "moveToFolder");
  expect(useSessionSheetRequest.getState().consume("machine", "other")).toBeUndefined();
  expect(useSessionSheetRequest.getState().consume("other", "session")).toBeUndefined();
  expect(useSessionSheetRequest.getState().consume("machine", "session")).toBe("moveToFolder");
  expect(useSessionSheetRequest.getState().consume("machine", "session")).toBeUndefined();
});

it("keeps only the latest request", () => {
  openSessionSheet("machine", "session", "moveToFolder");
  openSessionSheet("machine", "session", "importHistory");
  expect(useSessionSheetRequest.getState().consume("machine", "session")).toBe("importHistory");
});
