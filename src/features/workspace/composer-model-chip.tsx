import { useState } from "react";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useModelCatalog } from "@/state/model-catalog";
import { Notice } from "@/ui/primitives";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { catalogProviders, modelDefaults, sessionCatalog, sessionModel, sessionSettings } from "./catalog";
import { ComposerModelMark } from "./composer-model-mark";
import { ModelPicker } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import { settingLabels } from "./setting-labels";
import { providerChoices, selectedChoice } from "./provider-choices";
import type { SessionCommand } from "./session-types";
import type { HostSession } from "./wire";

/**
 * Composer toolbar chip: provider mark, model and effort of the session. Tapping it opens the model
 * picker sheet; each choice is applied to the session straight away while the agent is idle.
 */
export function ComposerModelChip({ session, blocked, onCommand }: {
  session: HostSession;
  blocked: boolean;
  onCommand: SessionCommand;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const catalog = useModelCatalog(session.projectId);
  const configure = useAsyncAction();
  const [open, setOpen] = useState(false);
  const { harness, providerAccountId, model, modelSettings } = session.session;
  const running = session.status === "running";
  const providers = [...new Set([harness, ...catalogProviders(machine?.providers, catalog.data)])];
  const available = sessionCatalog(catalog.data, providers);
  const switchAllowed = machine?.capabilities?.includes("sessions.harnessSwitch");
  const choices = providerChoices(
    providers.filter((item) => switchAllowed || item === harness),
    catalog.data?.accounts,
    copy("Varsayılan hesap", "Default account"),
  );
  const apply = (next: { provider: typeof harness; accountId?: string; model: string; settings: Record<string, string> }) => {
    const selected = sessionModel(available, next.provider, next.model);
    void configure.run(async () => onCommand({
      type: "configure",
      sessionId: session.session.id,
      harness: next.provider,
      ...(next.provider === "claude" || next.provider === "codex" ? { providerAccountId: next.accountId ?? null } : {}),
      model: next.model,
      modelSettings: selected ? sessionSettings(selected, next.settings) : next.settings,
      runtimeMode: session.session.runtimeMode,
    }));
  };
  const models = available.models[harness] ?? [];
  const current = models.find((entry) => entry.id === model || entry.nativeId === model);
  const name = current?.name ?? model.replace(/^[^:]+:/, "");
  const summary = settingsSummary(current, modelSettings, settingLabels(copy));
  const shown = summary ? `${name} · ${summary}` : name;
  return (
    <>
      <ChatToolbarAction
        label={shown}
        accessibilityLabel={copy("Model ve akıl yürütme", "Model and reasoning") + ": " + shown}
        disabled={blocked}
        onPress={() => { configure.reset(); setOpen(true); }}
      >
        <ComposerModelMark session={session} />
      </ChatToolbarAction>
      <ModelPicker
        visible={open}
        onClose={() => setOpen(false)}
        catalog={available}
        choices={choices}
        choice={selectedChoice(choices, harness, providerAccountId)}
        onChooseProvider={(next) => {
          if (next.provider === harness) return apply({ provider: harness, accountId: next.accountId, model, settings: modelSettings });
          const first = sessionModel(available, next.provider, "");
          apply({ provider: next.provider, accountId: next.accountId, model: first?.id ?? "", settings: modelDefaults(first) });
        }}
        models={models}
        model={model}
        settings={modelSettings}
        disabled={running || configure.isPending}
        notice={running ? (
          <Notice tone="info" message={copy("Model, mevcut çalışma tamamlanınca değiştirilebilir.", "The model can change after the current run finishes.")} />
        ) : configure.error ? <Notice tone="danger" message={configure.error.message} /> : undefined}
        onChange={(next, settings) => apply({ provider: harness, accountId: providerAccountId, model: next, settings })}
      />
    </>
  );
}
