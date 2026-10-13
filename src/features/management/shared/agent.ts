import { useHostQuery } from "@/state/queries";
import type { HostModelCatalog, RemoteProvider } from "@/domain/types";
import { effectiveAgentModel } from "../agent-model";
import type { AgentDraft } from "./types";

/** Discovery supplies a default without replacing the user's saved model. */
export function useEffectiveAgent<T extends AgentDraft>(value: T, projectId?: string | null): T {
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    { enabled: !!projectId },
  );
  return { ...value, model: effectiveAgentModel(value.model, value.harness, models.data) };
}

export function initialAgent(providers?: RemoteProvider[]): AgentDraft {
  const harness = providers?.[0];
  if (!harness) throw new Error("This computer has not reported any available agents.");
  return { harness, model: "", runtimeMode: "auto", maxRunMinutes: 0, modelSettings: {} };
}
