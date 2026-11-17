import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import licenses from "./open-source-licenses.json";

const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

it("lists every runtime dependency of package.json with a license", () => {
  const listed = new Set(licenses.map((entry) => entry.name));
  const missing = Object.keys(manifest.dependencies).filter((name) => !listed.has(name));
  expect(missing).toEqual([]);
  for (const entry of licenses) expect(entry.license.trim()).not.toBe("");
});

it("has no duplicate or removed packages", () => {
  const names = licenses.map((entry) => entry.name);
  expect(new Set(names).size).toBe(names.length);
  expect(names.filter((name) => !(name in manifest.dependencies))).toEqual([]);
});
