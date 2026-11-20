import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { RECORD_ACCESS_UNAVAILABLE } from "./record-access-copy";

const srcRoot = fileURLToPath(new URL("../", import.meta.url));
const [turkish, english] = RECORD_ACCESS_UNAVAILABLE;
const owner = "ui/record-access-copy.ts";

/** Callers must read the shared record-access pair; a retyped sentence drifts from the one translated in locales. */
it("keeps the record-access fallback sentence in one shared constant", () => {
  const sources = readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
    .map(name => name.replaceAll("\\", "/"))
    .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith("locales/") && name !== owner);
  const retyped = sources.filter(name => {
    const text = readFileSync(join(srcRoot, name), "utf8");
    return text.includes(turkish) || text.includes(english);
  });
  expect(retyped).toEqual([]);
});

/** Turkish product copy addresses the user informally; a formal `-in` imperative drifts from the dominant register. */
it("keeps the record-access imperative in the informal register", () => {
  expect(turkish).toMatch(/kontrol et\.$/);
  expect(turkish).not.toMatch(/edin\.$/);
});
