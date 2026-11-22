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
  it("shows the catalog name for the model that will start the session", () => {
    expect(source).toContain('selection.selectedModelValue?.name || selection.selectedModel || "—"');
    expect(source).toContain("${modelName}");
  });
  it("fits short lists and keeps the controls inside the only scrollable list", () => {
    expect(source).toContain('size="compact"');
    expect(source).toContain('ListHeaderComponent={');
    expect(source).toContain('flex: 0, flexShrink: 1');
    expect(source).toMatch(/footer=\{selected \? \(\s*<QuickStart/);
  });
});
