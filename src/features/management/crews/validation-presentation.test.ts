import { describe, expect, it } from "vitest";
import type { CrewAgent, CrewDefinition } from "@/remote/contracts/crews";
import {
  crewMemberPresentation, crewNameError, crewValidation, crewValidationMessage,
  memberValidation, memberValidationFeedback, newDefinition,
} from "./model";

const tr = (turkish: string, _english: string) => turkish;
const en = (_turkish: string, english: string) => english;
function member(): CrewAgent {
  return {
    id: "member", name: "Implementation", role: "specialist", instructions: "",
    selection: "fixed", candidates: [{ id: "codex/model", harness: "codex", model: "model", modelSettings: {}, capabilities: {} }],
  };
}
function crew(): CrewDefinition {
  const value = newDefinition("crew", "project");
  return { ...value, name: "Release team", agents: value.agents.map((agent) => ({ ...member(), id: agent.id, role: agent.role })) };
}

describe("crew validation presentation", () => {
  it("keeps a new roster incomplete without marking untouched members as errors", () => {
    const draft = newDefinition("crew", "project");
    expect(crewValidation(draft)).toBeTruthy();
    const row = crewMemberPresentation(draft.agents[0], "Koordinatör", tr);
    expect(row).toEqual({ label: "Koordinatör", detail: "Model seçilmedi", error: undefined });
    const touched = crewMemberPresentation(draft.agents[0], "Koordinatör", tr, true);
    expect(touched.error).toBe("Üye adı girin.");
    expect(touched.detail).not.toContain("Koordinatör");
    expect(draft.agents[0].candidates).toEqual([]);
  });

  it("waits for model interaction rather than showing a model error while the user names a member", () => {
    const draft = { ...member(), candidates: [] };
    const editingName = { name: true, models: false, dirty: true, submitted: false };
    expect(memberValidation(draft)).toContain("at least one model");
    expect(memberValidationFeedback(draft, tr, editingName)).toBeUndefined();
    expect(memberValidationFeedback(draft, tr, { ...editingName, models: true })).toBe("Bu üyeye en az bir model seçin.");
    expect(memberValidationFeedback(draft, en, { ...editingName, submitted: true })).toBe("Choose at least one model for this member.");
    expect(memberValidationFeedback(member(), tr, { ...editingName, models: true })).toBeUndefined();
  });

  it("shows the required name error after leaving that field while keeping untouched drafts neutral", () => {
    const draft = { ...member(), name: " " };
    const untouched = { name: false, models: false, dirty: false, submitted: false };
    expect(memberValidationFeedback(draft, tr, untouched)).toBeUndefined();
    expect(memberValidationFeedback(draft, tr, { ...untouched, name: true })).toBe("Üye adı girin.");
    expect(crewNameError("x".repeat(201), en)).toContain("200");
    expect(crewNameError("Release team", tr)).toBeUndefined();
    expect(crewNameError(` ${"x".repeat(200)} `, en)).toBeUndefined();
  });

  it("uses model/completeness information rather than repeating an unnamed member's role", () => {
    expect(crewMemberPresentation({ ...member(), name: "" }, "Uzman", tr)).toMatchObject({ label: "Uzman", detail: "model" });
    expect(crewMemberPresentation({ ...member(), name: "Uzman" }, "Uzman", tr).detail).toBe("model");
    expect(crewMemberPresentation(member(), "Uzman", tr).detail).toBe("Uzman · model");
    const automatic = { ...member(), selection: "automatic" as const, candidates: [member().candidates[0], { ...member().candidates[0], id: "second", model: "second" }] };
    expect(crewMemberPresentation(automatic, "Specialist", en).detail).toBe("Specialist · 2 models");
  });

  it("keeps the host parser authoritative while translating actionable role and numeric errors", () => {
    const valid = crew();
    expect(crewValidation(valid)).toBeUndefined();
    const wrongRoles = { ...valid, agents: valid.agents.map((agent) => ({ ...agent, role: "specialist" as const })) };
    const rolesError = crewValidation(wrongRoles);
    expect(rolesError).toContain("coordinator");
    expect(crewValidationMessage(rolesError, tr)).toContain("koordinatör");
    const limitsError = crewValidation({ ...valid, policy: { ...valid.policy, maxParallel: 5 } });
    expect(crewValidationMessage(limitsError, tr)).toContain("Çalışma sınırlarını");
    const invalidEstimate = { ...member(), candidates: [{ ...member().candidates[0], cost: NaN }] };
    expect(crewValidationMessage(memberValidation(invalidEstimate), tr, true)).toContain("maliyet");
    expect(crewValidationMessage("Internal parser diagnostic", tr)).not.toContain("Internal parser diagnostic");
  });
});
