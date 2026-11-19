import { describe, expect, it } from "vitest";
import { activeCommands } from "../../../modules/bycoda-key-commands/src/commands";
import { movePaletteSelection, searchPalette, showsNoMatches, SHORTCUTS, TAB_ROUTES, type PaletteEntry } from "./keyboard-model";

const entries: PaletteEntry[] = [
  { id: "a", label: "Project Apollo", detail: "Work computer", kind: "project", destination: { pathname: "/project/[id]", params: { id: "a", machineId: "host" } } },
  { id: "b", label: "Apollo", detail: "Chat", kind: "session", destination: { pathname: "/session/[id]", params: { id: "b" } } },
  { id: "c", label: "Settings", kind: "setting", destination: { pathname: "/(tabs)/settings" } },
];
describe("palette search and navigation", () => {
  it("matches all words across title/context and retains exact destination identity", () => {
    expect(searchPalette(entries, "APOLLO work")).toEqual([entries[0]]);
    expect(searchPalette(entries, "Apollo").map((item) => item.id)).toEqual(["b", "a"]);
    expect(searchPalette(entries, "missing")).toEqual([]);
    expect(searchPalette(entries, "")).toEqual(entries);
  });
  it("uses Turkish case folding", () => {
    expect(searchPalette([{ ...entries[0]!, label: "IŞIK" }], "ışık", "tr")).toHaveLength(1);
  });
  it("wraps arrow selection and handles removed/empty results", () => {
    expect(movePaletteSelection(-1, 3, 1)).toBe(0);
    expect(movePaletteSelection(-1, 3, -1)).toBe(2);
    expect(movePaletteSelection(2, 3, 1)).toBe(0);
    expect(movePaletteSelection(0, 3, -1)).toBe(2);
    expect(movePaletteSelection(12, 2, 1)).toBe(0);
    expect(movePaletteSelection(0, 0, 1)).toBe(-1);
    expect(TAB_ROUTES).toEqual(["/(tabs)", "/(tabs)/chats", "/(tabs)/inbox", "/(tabs)/manage", "/(tabs)/settings"]);
  });
});
it("modal chords override editors; Shift and primary remain separate; disabled registrations do not consume keys", () => {
  const base = { id: "editor", key: "Enter", title: "Send" };
  const modal = { ...base, id: "palette", priority: 100 };
  const primary = { ...base, id: "send", primary: true };
  const shifted = { ...base, id: "newline", shift: true };
  expect(activeCommands([base, modal, primary, shifted, { ...base, id: "off", priority: 200, enabled: false }])).toEqual([modal, primary, shifted]);
  expect(activeCommands([modal, base])[0]).toEqual(modal);
  expect(activeCommands([base, { ...base, id: "latest" }])[0]?.id).toBe("latest");
});

describe("palette empty state (#430)", () => {
  it("never shows 'No matches' alongside loading or a failed read", () => {
    expect(showsNoMatches({ pending: true, error: undefined })).toBe(false);
    expect(showsNoMatches({ pending: false, error: new Error("offline") })).toBe(false);
    expect(showsNoMatches({ pending: true, error: new Error("offline") })).toBe(false);
  });
  it("shows 'No matches' only once the read settled cleanly", () => {
    expect(showsNoMatches({ pending: false, error: undefined })).toBe(true);
  });
});

describe("SHORTCUTS", () => {
  it("lists each chord once and covers the new shortcuts", () => {
    const keys = SHORTCUTS.map((entry) => entry.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["⌘,", "⌘F", "⌘/", "Esc", "⌘K", "⌘N", "⌘["]));
    expect(TAB_ROUTES[4]).toBe("/(tabs)/settings");
  });
});
