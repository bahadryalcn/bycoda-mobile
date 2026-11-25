import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { settingsRoutes } from "./settings-routes";

const source = readFileSync(new URL("./settings-screen.tsx", import.meta.url), "utf8");
const app = (path: string) => new URL(`../../../app${path}.tsx`, import.meta.url);

it("keeps the Settings root an index: navigation rows only, no switches or selects", () => {
  expect(source).not.toMatch(/\b(SelectField|ToggleField|SegmentedRow|SegmentedControl|Sheet)\b/);
  for (const group of ['"Bilgisayar", "Computer"', '"Uygulama", "App"', '"Gizlilik ve güvenlik", "Privacy and security"', '"Destek", "Support"'])
    expect(source).toContain(`<Section title={copy(${group})}>`);
});

it("gives every settings page a pushed route and so a deep link", () => {
  for (const route of Object.values(settingsRoutes)) {
    if (route === settingsRoutes.root) continue;
    // Voice is linked when its page exists; the row falls back to the voice sheet meanwhile.
    if (route === settingsRoutes.voice && !existsSync(app(route))) continue;
    expect(existsSync(app(route)), route).toBe(true);
  }
});
