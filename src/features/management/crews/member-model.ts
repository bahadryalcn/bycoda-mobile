import type { CrewAgent, CrewCandidate } from "@/remote/contracts/crews";
import type { RemoteProvider } from "@/domain/types";
import type { ModelRoutingItemChoice } from "../../../../../src/shared/model/host-contracts/model-routing";
import type { FixedModel } from "../../workspace/model-selection/fixed-model";
import { memberRoutingPatch } from "./model";

/**
 * A crew member on the shared model selection, as desktop `MemberModelSection` maps it:
 * `selection: "fixed"` is Fixed; `automatic` shows its `modelChoice`. An older automatic member
 * without a `modelChoice` runs its first candidate (the Host resolves it as fixed), so it reads as
 * Fixed and stays stored as it is until the owner picks another mode.
 */
export function memberChoice(agent: Pick<CrewAgent, "selection" | "modelChoice">): ModelRoutingItemChoice | undefined {
  return agent.selection === "fixed" ? { kind: "fixed" } : agent.modelChoice;
}

/** The fields to write for a picked choice; undefined when nothing the Host reads would change. */
export function memberChoicePatch(
  agent: Pick<CrewAgent, "selection" | "modelChoice">,
  choice: ModelRoutingItemChoice | undefined,
): Pick<CrewAgent, "selection" | "modelChoice"> | undefined {
  if (!choice) return undefined;
  if (choice.kind === "fixed" && agent.selection === "fixed") return undefined;
  if (agent.selection === "automatic" && JSON.stringify(agent.modelChoice) === JSON.stringify(choice)) return undefined;
  return memberRoutingPatch(choice);
}

/** The first candidate is the member's fixed model, and the fallback of every other mode. */
export function memberFixedModel(agent: Pick<CrewAgent, "candidates">, providers: readonly RemoteProvider[]): FixedModel {
  const first = agent.candidates[0];
  return first
    ? {
        harness: first.harness,
        model: first.model,
        ...(first.providerAccountId ? { providerAccountId: first.providerAccountId } : {}),
        modelSettings: first.modelSettings,
      }
    : { harness: providers[0] ?? "claude", model: "", modelSettings: {} };
}

/**
 * Candidates after a fixed-model change: the first becomes the picked model (same id and
 * capability evidence when the model is unchanged, desktop's `harness/model` id otherwise);
 * further saved candidates are kept. Undefined while no model is picked.
 */
export function withMemberFixedModel(
  candidates: readonly CrewCandidate[],
  next: FixedModel,
): CrewCandidate[] | undefined {
  if (!next.model) return undefined;
  const first = candidates[0];
  const same = first?.harness === next.harness && first.model === next.model;
  const id = same ? first.id : `${next.harness}/${next.model}`;
  const candidate: CrewCandidate = {
    id,
    harness: next.harness,
    model: next.model,
    ...(next.providerAccountId ? { providerAccountId: next.providerAccountId } : {}),
    modelSettings: next.modelSettings ?? {},
    capabilities: same ? first.capabilities : {},
  };
  return [candidate, ...candidates.slice(1).filter((row) => row.id !== id)];
}
