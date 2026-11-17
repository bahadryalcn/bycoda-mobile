import { expect, it } from "vitest";
import { cloudAvailable, modelBusy, modelRowState, parseLocalModels, parseModelJob } from "./voice-models-model";

it("parses only well-formed model rows", () => {
  expect(parseLocalModels([{ id: "small", label: "S", installed: true }, { id: 1 }, null])).toEqual([{ id: "small", label: "S", installed: true }]);
  expect(parseLocalModels("x")).toEqual([]);
});
it("derives row state from the running job", () => {
  const model = { id: "small", label: "S", installed: false };
  expect(modelRowState(model, parseModelJob({ state: "working", id: "small", action: "download" }))).toBe("downloading");
  expect(modelRowState(model, parseModelJob({ state: "working", id: "turbo", action: "download" }))).toBe("missing");
  expect(modelRowState({ ...model, installed: true }, parseModelJob({ state: "working", id: "small", action: "delete" }))).toBe("removing");
  expect(modelRowState(model, parseModelJob({ state: "error", id: "small", action: "download", detail: "x" }))).toBe("failed");
  expect(modelRowState({ ...model, installed: true }, parseModelJob(undefined))).toBe("installed");
});
it("detects busy and cloud availability", () => {
  expect(modelBusy(parseModelJob({ state: "working" }))).toBe(true);
  expect(cloudAvailable({ openrouter: true })).toBe(true);
  expect(cloudAvailable({ elevenlabs: true })).toBe(false);
  expect(cloudAvailable(null)).toBe(false);
});

import { downloadPercent, parseLocalModels as parseModels, parseModelJob as parseJob } from "./voice-models-model";
it("keeps optional model size and download progress", () => {
  expect(parseModels([{ id: "a", label: "A", installed: false, sizeBytes: 500 }, { id: "b", label: "B", installed: true, sizeBytes: -1 }])).toEqual([{ id: "a", label: "A", installed: false, sizeBytes: 500 }, { id: "b", label: "B", installed: true }]);
  const job = parseJob({ state: "working", id: "a", action: "download", bytesDone: 250, bytesTotal: 1000 });
  expect(downloadPercent(job)).toBe(25);
  expect(downloadPercent(parseJob({ state: "working" }))).toBeUndefined();
});
