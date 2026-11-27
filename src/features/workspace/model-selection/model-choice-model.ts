import {
  MODEL_ROUTING_DELEGATION_KEYS,
  type ModelRoutingEntry,
  type ModelRoutingItemChoice,
  type ModelRoutingState,
  type ModelRoutingTarget,
} from "../../../../../src/shared/model/host-contracts/model-routing";
import { modelRoutingPoolEntryIds } from "../../../../../src/shared/model/modelRoutingPools";
import { accountName, providerName } from "../provider-choices";
import type { HostModelCatalog } from "../wire";

/**
 * Mobile mirror of desktop `ModelChoiceField` (src/features/model-routing/ui/choice): one item
 * stores `modelChoice`; "Use settings" follows the role binding, "Any model" walks the Host's model
 * order or one model group, "Fixed" uses the item's own harness/model/account/settings.
 */
export type ChoiceMode = "default" | "any" | "fixed";

/** No stored choice predates routing and behaves as `fixed`. */
export function choiceMode(value: ModelRoutingItemChoice | undefined): ChoiceMode {
  if (!value || value.kind === "fixed") return "fixed";
  return value.kind === "default" ? "default" : "any";
}

/**
 * The stored value for a picked mode. Re-picking the current mode keeps the saved value as is, so
 * an item without a stored choice round-trips unchanged; "Any model" starts with the whole order.
 */
export function choiceForMode(
  mode: ChoiceMode,
  current: ModelRoutingItemChoice | undefined,
): ModelRoutingItemChoice | undefined {
  if (choiceMode(current) === mode) return current;
  if (mode === "default") return { kind: "default" };
  if (mode === "any") return { kind: "order" };
  return { kind: "fixed" };
}

/** "" is the whole model order; otherwise the group id. */
export function groupValue(value: ModelRoutingItemChoice | undefined): string {
  return value?.kind === "pool" ? value.poolId : "";
}

export function choiceForGroup(poolId: string): ModelRoutingItemChoice {
  return poolId ? { kind: "pool", poolId } : { kind: "order" };
}

/** Entries an item using this choice walks, in order; undefined for fixed/default. */
export function choiceEntries(
  state: Pick<ModelRoutingState, "entries" | "pools"> | undefined,
  value: ModelRoutingItemChoice | undefined,
): ModelRoutingEntry[] | undefined {
  if (!state || !value || (value.kind !== "order" && value.kind !== "pool")) return undefined;
  if (value.kind === "order") return state.entries;
  const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
  return modelRoutingPoolEntryIds(state.pools, value.poolId).flatMap((id) => byId.get(id) ?? []);
}

const accountOf = (target: Pick<ModelRoutingTarget, "providerAccountId">) =>
  target.providerAccountId && target.providerAccountId !== "default" ? target.providerAccountId : "";

export function sameTarget(
  a: Pick<ModelRoutingTarget, "harness" | "model" | "providerAccountId">,
  b: Pick<ModelRoutingTarget, "harness" | "model" | "providerAccountId">,
): boolean {
  return a.harness === b.harness && a.model === b.model && accountOf(a) === accountOf(b);
}

/** Delegation keys belong to the document's delegation layers, never to an entry (Host rule). */
export function entrySettings(settings: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !(MODEL_ROUTING_DELEGATION_KEYS as readonly string[]).includes(key)),
  );
}

/** "Opus 5.5" and "Claude · Work" for one target, named from the computer's catalog. */
export function targetLabel(
  target: Pick<ModelRoutingTarget, "harness" | "model" | "providerAccountId">,
  catalog: HostModelCatalog | undefined,
  defaultAccountLabel: string,
): { name: string; detail: string } {
  const model = catalog?.models[target.harness]?.find((row) => row.id === target.model || row.nativeId === target.model);
  const accounts = target.harness === "claude" || target.harness === "codex" ? catalog?.accounts?.[target.harness] : undefined;
  const id = target.providerAccountId || "default";
  const account = accounts?.find((row) => row.id === id);
  const accountLabel = account
    ? accountName(account, defaultAccountLabel)
    : target.providerAccountId && target.providerAccountId !== "default" ? target.providerAccountId : accounts?.length ? defaultAccountLabel : "";
  return {
    name: model?.name || target.model.replace(new RegExp(`^${target.harness}:`), ""),
    detail: [providerName(target.harness), accountLabel].filter(Boolean).join(" · "),
  };
}
