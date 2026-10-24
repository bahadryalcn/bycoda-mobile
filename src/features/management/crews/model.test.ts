import { describe, expect, it } from "vitest";
import type { CrewDefinition, SavedCrewAgent } from "@/remote/contracts/crews";
import { candidateFromCatalog, copyLibraryMember, crewValidation, memberValidation, newDefinition, validateCrewDirectory } from "./model";

export function validCrew(): CrewDefinition {
  const definition = newDefinition("crew", "project");
  definition.name = "Delivery crew";
  definition.updatedAt = 10;
  definition.agents = definition.agents.map((agent) => ({ ...agent, name: agent.role, candidates: [{ id: `model-${agent.id}`, harness: "codex", model: "codex:model", modelSettings: {}, capabilities: {} }] }));
  return definition;
}

describe("mobile crew contracts", () => {
  it("validates roster and limits with the host's canonical parser", () => {
    const definition = validCrew();
    expect(crewValidation(definition)).toBeUndefined();
    expect(crewValidation({ ...definition, agents: definition.agents.slice(0, 2) })).toContain("3 to 20");
    expect(crewValidation({ ...definition, agents: definition.agents.map((agent) => ({ ...agent, role: "specialist" })) })).toContain("coordinator");
    expect(crewValidation({ ...definition, policy: { ...definition.policy, maxParallel: 5 } })).toBeTruthy();
    expect(memberValidation({ ...definition.agents[0], candidates: [] })).toContain("at least one model");
  });
  it("makes independent library copies and preserves profile provenance only on supporting hosts", () => {
    const original: SavedCrewAgent = { ...validCrew().agents[0], id: "library", projectId: "project", updatedAt: 42, groups: ["Mobile"] };
    const copy = copyLibraryMember(original, "member", true);
    expect(copy.source).toEqual({ id: "library", updatedAt: 42 });
    copy.candidates[0].modelSettings.effort = "high";
    expect(original.candidates[0].modelSettings).toEqual({});
    expect(copyLibraryMember(original, "old-host-member", false)).toMatchObject({ id: "old-host-member", groups: undefined, source: undefined });
  });
  it("starts candidates from catalog defaults without fabricating capability evidence", () => {
    const candidate = candidateFromCatalog({ models: { codex: [{ id: "codex:model", harness: "codex", name: "Model", settings: [{ id: "effort", label: "Effort", kind: "select", value: "medium", options: [] }] }] }, errors: {} }, "codex/codex:model");
    expect(candidate).toMatchObject({ modelSettings: { effort: "medium" }, capabilities: {} });
  });
  it("rejects cross-project and malformed remote records before rendering", () => {
    const directory = { definitions: [validCrew()], agents: [], runs: [] };
    expect(validateCrewDirectory(directory, "project")).toBe(directory);
    expect(() => validateCrewDirectory(directory, "other")).toThrow("another project");
    expect(() => validateCrewDirectory({ definitions: [], agents: null, runs: [] })).toThrow();
    expect(() => validateCrewDirectory({ ...directory, runs: [{ id: "run", projectId: "project", status: "active", definition: validCrew(), tasks: [{}], assignments: [], messages: [] }] }, "project")).toThrow("Invalid crew task");
  });
});
