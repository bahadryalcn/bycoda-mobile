import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./new-session-sheet.tsx", import.meta.url), "utf8");
describe("new session sheet", () => {
  it("requires an explicit start after project selection", () => {
    expect(source).not.toMatch(/started\.current|run\(\);\s*\}, \[ready/);
    expect(source).toContain('label={copy("Oturumu başlat", "Start session")}');
    expect(source).toContain("onPress={run}");
  });
  it("offers all visible projects and an always available add action", () => {
    expect(source).toContain('copy("Tüm projeler", "All projects")');
    expect(source).toContain('label={copy("Proje ekle", "Add project")}');
    expect(source).toMatch(
      /showAll\s*\?\s*ordered\s*:\s*ordered\.slice\(0, RECENT_PROJECT_LIMIT\)/,
    );
  });
});
