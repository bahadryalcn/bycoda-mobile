import { expect, it } from "vitest";
import type { CrewAgent } from "@/remote/contracts/crews";
import { memberChoice, memberChoicePatch, memberFixedModel, withMemberFixedModel } from "./member-model";

const candidate = { id: "codex/a", harness: "codex" as const, model: "a", modelSettings: { effort: "high" }, capabilities: { tools: { state: "available" as const, observedAt: 1 } } } as CrewAgent["candidates"][number];

it("maps crew selection onto the shared choice like desktop", () => {
  expect(memberChoice({ selection: "fixed", modelChoice: { kind: "pool", poolId: "x" } })).toEqual({ kind: "fixed" });
  expect(memberChoice({ selection: "automatic", modelChoice: { kind: "order" } })).toEqual({ kind: "order" });
  // An older automatic member has no stored choice and reads as Fixed (the Host runs its first candidate).
  expect(memberChoice({ selection: "automatic" })).toBeUndefined();
});

it("writes only real changes", () => {
  expect(memberChoicePatch({ selection: "automatic" }, undefined)).toBeUndefined();
  expect(memberChoicePatch({ selection: "fixed" }, { kind: "fixed" })).toBeUndefined();
  expect(memberChoicePatch({ selection: "automatic", modelChoice: { kind: "order" } }, { kind: "order" })).toBeUndefined();
  expect(memberChoicePatch({ selection: "fixed" }, { kind: "pool", poolId: "p" })).toEqual({ selection: "automatic", modelChoice: { kind: "pool", poolId: "p" } });
  expect(memberChoicePatch({ selection: "automatic", modelChoice: { kind: "default" } }, { kind: "fixed" })).toEqual({ selection: "fixed", modelChoice: { kind: "fixed" } });
});

it("edits the first candidate as the fixed model and keeps the others", () => {
  expect(memberFixedModel({ candidates: [] }, ["claude"])).toEqual({ harness: "claude", model: "", modelSettings: {} });
  expect(memberFixedModel({ candidates: [candidate] }, [])).toEqual({ harness: "codex", model: "a", modelSettings: { effort: "high" } });
  const other = { ...candidate, id: "codex/b", model: "b" };
  // The same model keeps its id and capability evidence; only the effort changes.
  expect(withMemberFixedModel([candidate, other], { harness: "codex", model: "a", modelSettings: { effort: "low" } }))
    .toEqual([{ ...candidate, modelSettings: { effort: "low" } }, other]);
  // Picking a saved extra candidate makes it the fixed model without a duplicate entry.
  expect(withMemberFixedModel([candidate, other], { harness: "codex", model: "b", modelSettings: {} })!.map((row) => row.id))
    .toEqual(["codex/b"]);
  expect(withMemberFixedModel([candidate], { harness: "claude", model: "" })).toBeUndefined();
});
