import { useState } from "react";
import { createSingleFlight } from "@/state/single-flight";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useModelCatalog } from "@/state/model-catalog";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { catalogProviders, creationSettings } from "./catalog";
import { resolveCreationSelection, type CreationDraft, type RuntimeMode } from "./creation-selection";
import { providerChoices } from "./provider-choices";
import { useCommands } from "./shared";

/**
 * Creates sessions in one project: the shared owner of the model catalog, the command and the
 * single-flight guard. The project panel passes its form draft; the quick flow passes none.
 */
export function useCreateSession(
  projectId: string,
  { cwd, catalogEnabled = true, draft = { model: "" } }: { cwd?: string; catalogEnabled?: boolean; draft?: CreationDraft } = {},
) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [creation] = useState(() => createSingleFlight<boolean>());
  const catalog = useModelCatalog(projectId, catalogEnabled);
  const command = useCommands(["sessions", projectId]);
  const uncertain = command.error instanceof Error && command.error.name === "UncertainCommand";
  const locked = command.isPending || uncertain;
  const providers = catalogProviders(machine?.providers, catalog.data);
  const choices = providerChoices(providers, catalog.data?.accounts, copy("Varsayılan hesap", "Default account"));
  const selection = resolveCreationSelection(providers, catalog.data, choices, draft);
  const { selectedProvider, selectedAccountId, selectedModelValue, selectedModel, models } = selection;
  const canStart = !!selectedModel && !!selectedProvider && !locked;

  /** Resolves true once the Host accepted the command; failures stay in `command.error`. */
  const create = (
    onCreated: (sessionId: string) => void,
    { settings = {}, runtimeMode = "supervised" }: { settings?: Record<string, string>; runtimeMode?: RuntimeMode } = {},
  ): Promise<boolean> => {
    if (!canStart || !machine || useMachines.getState().activeId !== machine.id) return Promise.resolve(false);
    return creation.run(async () => {
      const receipt = await command.mutateAsync({
        type: "create",
        projectId,
        ...(cwd ? { worktreeCwd: cwd } : {}),
        harness: selectedProvider,
        ...(selectedAccountId ? { providerAccountId: selectedAccountId } : {}),
        model: selectedModel,
        modelSettings: creationSettings(selectedModelValue, settings, selectedProvider, models),
        runtimeMode,
      });
      haptic.success();
      onCreated(receipt.sessionId);
      return true;
    }).catch(() => false);
  };

  return { catalog, command, uncertain, locked, providers, choices, selection, canStart, create };
}
