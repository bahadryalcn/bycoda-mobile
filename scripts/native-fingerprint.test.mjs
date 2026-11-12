import assert from "node:assert/strict";
import test from "node:test";
import { compareNative } from "./native-fingerprint.mjs";

const report = () => ({
  status: "measured",
  expoVersion: "58.0.23",
  tool: { version: "0.20.14" },
  settings: { sourceSkips: 0 },
  nativeHash: "abc",
  sources: [{ type: "file", id: "app.json", hash: "123" }],
  sourceIdentity: { mobile: { treeSha256: "js-before" } },
});

test("equal complete native inputs remain advisory even when JS/source identity changes", () => {
  const current = report();
  current.sourceIdentity.mobile.treeSha256 = "js-after";
  const result = compareNative(report(), current);
  assert.equal(result.status, "no-native-input-change");
  assert.equal(result.nativeRebuild, "not-indicated-by-this-fingerprint");
});
test("only an SDK-confirmed generated CNG directory may be excluded without making comparison unknown", () => {
  const before = report();
  before.sources.push({
    type: "dir",
    id: "android",
    hash: null,
    state: "generated-native-excluded",
  });
  assert.equal(compareNative(before, structuredClone(before)).status, "no-native-input-change");
  const unknown = structuredClone(before);
  unknown.sources[1].state = "unknown-excluded";
  assert.equal(compareNative(before, unknown).status, "unknown");
});
test("changed, added and removed actual SDK sources advise a native rebuild", () => {
  for (const sources of [
    [{ type: "file", id: "app.json", hash: "changed" }],
    [{ type: "file", id: "plugin.cjs", hash: "new" }],
  ]) {
    const current = { ...report(), sources };
    assert.equal(compareNative(report(), current).nativeRebuild, "advised");
  }
});
test("missing sources, excluded hashes, absent baseline, changed tool/SDK/settings and failures are unknown", () => {
  assert.equal(compareNative(null, report()).nativeRebuild, "unknown");
  for (const change of [
    { status: "unknown" },
    { sources: [] },
    { sources: [{ type: "file", id: "x", hash: null }] },
    { tool: { version: "other" } },
    { expoVersion: "other" },
    { settings: { sourceSkips: 1 } },
  ])
    assert.equal(compareNative(report(), { ...report(), ...change }).nativeRebuild, "unknown");
});
