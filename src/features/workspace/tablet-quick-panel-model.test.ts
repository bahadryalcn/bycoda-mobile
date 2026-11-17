import { describe, expect, it } from "vitest";
import { appCommands } from "../keyboard/command-model";
import { quickPanelActions, quickPanelFrame, quickPanelMemory, quickPanelVisible, sessionHref, VOICE_HREF } from "./tablet-quick-panel-model";

const copy = (_tr: string, en: string) => en;
const recent = (n: number) => ({ id: `s${n}`, projectId: "p 1", machineId: "m", title: `Session ${n}` });

describe("quickPanelActions", () => {
  it("orders new session, voice, search, recents, terminals, settings", () => {
    const actions = quickPanelActions(appCommands(copy), [recent(1), recent(2)], copy);
    expect(actions.map((a) => a.id)).toEqual(["new", "voice", "palette", "session:s1", "session:s2", "tool:terminals", "settings"]);
    expect(actions.find((a) => a.id === "voice")).toMatchObject({ kind: "voice", href: VOICE_HREF });
  });
  it("caps recents at three and encodes session routes", () => {
    const actions = quickPanelActions(appCommands(copy), [1, 2, 3, 4, 5].map(recent), copy);
    expect(actions.filter((a) => a.kind === "session")).toHaveLength(3);
    expect(sessionHref(recent(1))).toBe("/session/s1?projectId=p%201&machineId=m");
  });
  it("works without recents", () => {
    expect(quickPanelActions(appCommands(copy), [], copy).some((a) => a.kind === "session")).toBe(false);
  });
});

describe("quickPanelVisible", () => {
  it("shows only on tablets without the keyboard", () => {
    expect(quickPanelVisible({ tablet: true, keyboardVisible: false })).toBe(true);
    expect(quickPanelVisible({ tablet: false, keyboardVisible: false })).toBe(false);
    expect(quickPanelVisible({ tablet: true, keyboardVisible: true })).toBe(false);
  });
});

describe("quickPanelFrame", () => {
  const base = { width: 1000, height: 800, insetRight: 20, insetTop: 24, bottomInset: 100 };
  it("docks right and above the clearance", () => {
    expect(quickPanelFrame(base)).toMatchObject({ right: 36, bottom: 116 });
  });
  it("stays right of a vertical hinge", () => {
    const frame = quickPanelFrame({ ...base, hinge: { axis: "vertical", start: 700, size: 20 } });
    expect(frame.maxWidth).toBe(1000 - 36 - 720 - 16);
  });
  it("stays below a tabletop hinge", () => {
    const frame = quickPanelFrame({ ...base, tabletop: { axis: "horizontal", start: 400, size: 30 } });
    expect(frame.maxHeight).toBe(800 - 116 - 430 - 16);
  });
});

describe("quickPanelMemory", () => {
  it("remembers in memory", () => {
    quickPanelMemory.write(true);
    expect(quickPanelMemory.read()).toBe(true);
    quickPanelMemory.write(false);
  });
});
