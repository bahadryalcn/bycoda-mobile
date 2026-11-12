import { describe, expect, it } from "vitest";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { contextLabel, modelRows, settingsSummary } from "./model-picker-model";
import { settingControl, toggleSides } from "./model-picker-model";

const model = (extra: Partial<AgentModel> = {}): AgentModel => ({ id: "claude:a", harness: "claude", name: "Opus", nativeId: "claude-a", ...extra });

describe("model picker model", () => {
  it("formats context windows", () => {
    expect(contextLabel(200_000)).toBe("200K");
    expect(contextLabel(1_000_000)).toBe("1M");
    expect(contextLabel(1_500_000)).toBe("1.5M");
    expect(contextLabel(undefined)).toBeUndefined();
  });
  it("lists rows with id and context, marking the selection", () => {
    const rows = modelRows([model({ contextWindow: 200_000 }), model({ id: "b", name: "same", nativeId: "SAME" })], "claude-a", "context");
    expect(rows[0]).toMatchObject({ detail: "claude-a · 200K context", selected: true });
    expect(rows[1]).toMatchObject({ detail: undefined, selected: false });
  });
  it("keeps an unknown saved id first", () => {
    const rows = modelRows([model()], "custom", "context");
    expect(rows[0]).toMatchObject({ value: "custom", selected: true });
    expect(rows).toHaveLength(2);
  });
  it("summarizes reasoning and fast", () => {
    const m = model({ settings: [
      { id: "effort", label: "Effort", kind: "select", value: "high", options: [{ value: "high", label: "High" }, { value: "low", label: "Low" }] },
      { id: "fast", label: "Fast", kind: "toggle", value: "off", options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }] },
    ] });
    expect(settingsSummary(m, {}, {})).toBe("High");
    const codex = model({ settings: [
      { id: "effort", label: "Effort", kind: "select", value: "low", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }] },
      { id: "serviceTier", label: "Service Tier", kind: "select", value: "standard", options: [{ value: "standard", label: "Standard" }, { value: "fast", label: "Fast" }] },
    ] });
    expect(settingsSummary(codex, {}, {})).toBe("Low");
    expect(settingsSummary(codex, { serviceTier: "fast" }, {})).toBe("Low · Fast");
    expect(settingsSummary(m, { fast: "on", effort: "low" }, { Low: "Düşük", Fast: "Hızlı" })).toBe("Düşük · Hızlı");
  });
});

describe("settingControl", () => {
  const options = (...labels: string[]) => labels.map((label) => ({ value: label.toLowerCase(), label }));
  it("uses a switch for on/off, a slider for the reasoning scale and segments or chips otherwise", () => {
    expect(settingControl({ id: "fast", options: options("Off", "On") })).toBe("toggle");
    expect(settingControl({ id: "effort", options: options("Low", "Medium", "High", "Max") })).toBe("slider");
    expect(settingControl({ id: "effort", options: options("Low", "Medium", "High") })).toBe("segments");
    expect(settingControl({ id: "variant", options: options("A", "B", "C", "D") })).toBe("select");
    expect(settingControl({ id: "serviceTier", options: options("Standard", "Fast") })).toBe("toggle");
    expect(toggleSides({ id: "serviceTier", options: options("Standard", "Fast") })?.on.value).toBe("fast");
    expect(settingControl({ id: "thinking", options: options("Adaptive", "Off") })).toBe("segments");
  });
});
