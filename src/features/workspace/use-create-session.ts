import { useConnectionScope } from "@/state/connection-scope";
import { createSingleFlight } from "@/state/single-flight";
import { useActiveMachine } from "@/state/machines";
import { useModelCatalog } from "@/state/model-catalog";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { catalogProviders, creationSettings } from "./catalog";
import { resolveCreationSelection, type CreationDraft, type RuntimeMode } from "./creation-selection";
import { providerChoices } from "./provider-choices";
import { useCommands } from "./shared";
import type { NewChatAttachmentReference } from "./new-chat-attachments";

/**
 * Creates sessions in one project: the shared owner of the model catalog, the command and the
 * single-flight guard. Each entry point passes the settings from its own draft.
 */
export function useCreateSession(
  projectId: string,
  { cwd, catalogEnabled = true, draft = { model: "" } }: { cwd?: string; catalogEnabled?: boolean; draft?: CreationDraft } = {},
) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const connection = useConnectionScope(() => createSingleFlight<boolean>());
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
    {
      settings = {},
      runtimeMode = "supervised",
      commandId,
      firstTurn,
    }: {
      settings?: Record<string, string>;
      runtimeMode?: RuntimeMode;
      /** A stable ID makes a retry of the same payload idempotent: the Host replays its receipt. */
      commandId?: string;
      /**
       * The first prompt, created atomically with the session (`sessions.createFirstTurn`), with
       * the attachments it already uploaded.
       */
      firstTurn?: { type: "send"; commandId: string; sessionId: ""; text: string; attachments?: NewChatAttachmentReference[] };
    } = {},
  ): Promise<boolean> => {
    if (!canStart || !machine || !connection.isCurrent()) return Promise.resolve(false);
    return connection.resource.run(async () => {
      if (!connection.isCurrent()) return false;
      const params = {
        type: "create",
        projectId,
        ...(cwd ? { worktreeCwd: cwd } : {}),
        harness: selectedProvider,
        ...(selectedAccountId ? { providerAccountId: selectedAccountId } : {}),
        model: selectedModel,
        modelSettings: creationSettings(selectedModelValue, settings, selectedProvider, models),
        runtimeMode,
        ...(firstTurn ? { firstTurn } : {}),
      };
      const receipt = await (commandId ? command.mutateAsync(params, { commandId }) : command.mutateAsync(params));
      if (connection.isCurrent()) {
        haptic.success();
        onCreated(receipt.sessionId);
      }
      return true;
    }).catch(() => false);
  };

  return { catalog, command, uncertain, locked, providers, choices, selection, canStart, create };
}
