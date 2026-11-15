import { useState } from "react";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import { useFormDraft, sameFormValue } from "@/state/form-draft";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useModelCatalog } from "@/state/model-catalog";
import { Notice, QueryState } from "@/ui/primitives";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import {
  catalogProviders,
  modelDefaults,
  sessionCatalog,
  sessionModel,
  sessionSettings,
} from "./catalog";
import { ComposerModelMark } from "./composer-model-mark";
import { ModelPicker } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import { settingLabels } from "./setting-labels";
import { choiceKey, providerChoices, selectedChoice } from "./provider-choices";
import type { SessionCommand } from "./session-types";
import type { HostSession } from "./wire";

/**
 * Composer toolbar chip: provider mark, model and effort of the session. Tapping it opens the model
 * picker sheet; choices stay local until explicitly saved while the agent is idle.
 */
export function ComposerModelChip({
  session,
  blocked,
  onCommand,
}: {
  session: HostSession;
  blocked: boolean;
  onCommand: SessionCommand;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const catalog = useModelCatalog(session.projectId);
  const configure = useAsyncAction();
  const [open, setOpen] = useState(false);
  const draftOf = (value: HostSession) => ({
    provider: value.session.harness,
    accountId: value.session.providerAccountId,
    model: value.session.model,
    settings: value.session.modelSettings,
  });
  const form = useFormDraft(() => draftOf(session));
  const [reviewed, setReviewed] = useState(session);
  const {
    provider: harness,
    accountId: providerAccountId,
    model,
    settings: modelSettings,
  } = form.values;
  const conflict =
    open &&
    (!sameFormValue(draftOf(session), draftOf(reviewed)) ||
      session.authorityGeneration !== reviewed.authorityGeneration ||
      session.session.runtimeMode !== reviewed.session.runtimeMode);
  const running = session.status === "running";
  const providers = [...new Set([harness, ...catalogProviders(machine?.providers, catalog.data)])];
  const available = sessionCatalog(catalog.data, providers);
  const switchAllowed = machine?.capabilities?.includes("sessions.harnessSwitch");
  const choices = providerChoices(
    providers.filter((item) => switchAllowed || item === harness),
    catalog.data?.accounts,
    copy("Varsayılan hesap", "Default account"),
  );
  const savedChoice = choices.find((entry) => entry.key === choiceKey(harness, providerAccountId));
  const unavailableAccount =
    (harness === "claude" || harness === "codex") &&
    Array.isArray(catalog.data?.accounts?.[harness]) &&
    !savedChoice;
  const choice = unavailableAccount
    ? {
        key: choiceKey(harness, providerAccountId),
        provider: harness,
        label: copy("Hesap kullanılamıyor", "Account unavailable"),
      }
    : (savedChoice ?? selectedChoice(choices, harness, providerAccountId));
  const apply = (next: typeof form.values) => {
    if (blocked || running || configure.isPending) return;
    form.patch(next);
  };
  const save = async () => {
    if (
      !form.dirty ||
      blocked ||
      running ||
      configure.isPending ||
      unavailableAccount ||
      conflict ||
      !model
    )
      return;
    const submitted = form.values;
    const selected = sessionModel(available, harness, model);
    const saved = await configure.run(async () => {
      await onCommand({
        type: "configure",
        sessionId: reviewed.session.id,
        ...captureSessionAuthority(reviewed),
        ...(reviewed.revision !== undefined ? { expectedRevision: reviewed.revision } : {}),
        harness,
        ...(harness === "claude" || harness === "codex"
          ? { providerAccountId: providerAccountId ?? null }
          : {}),
        model,
        modelSettings: selected ? sessionSettings(selected, modelSettings) : modelSettings,
        runtimeMode: reviewed.session.runtimeMode,
      });
      return true;
    });
    if (saved === true) {
      form.markSaved(submitted);
      setOpen(false);
    }
  };
  const models = available.models[harness] ?? [];
  const current = (available.models[session.session.harness] ?? []).find(
    (entry) => entry.id === session.session.model || entry.nativeId === session.session.model,
  );
  const name = current?.name ?? session.session.model.replace(/^[^:]+:/, "");
  const summary = settingsSummary(current, session.session.modelSettings, settingLabels(copy));
  const shown = summary ? `${name} · ${summary}` : name;
  return (
    <>
      <ChatToolbarAction
        label={shown}
        accessibilityLabel={copy("Model ve akıl yürütme", "Model and reasoning") + ": " + shown}
        disabled={blocked}
        onPress={() => {
          configure.reset();
          form.reset(draftOf(session));
          setReviewed(session);
          setOpen(true);
        }}
      >
        <ComposerModelMark session={session} />
      </ChatToolbarAction>
      <ModelPicker
        visible={open}
        onClose={() => setOpen(false)}
        dirty={form.dirty}
        pending={configure.isPending || blocked}
        onSave={() => {
          void save();
        }}
        saveDisabled={conflict || !model}
        catalog={available}
        choices={choices}
        choice={choice}
        unavailableAccount={unavailableAccount}
        onChooseProvider={(next) => {
          if (next.provider === harness)
            return apply({
              provider: harness,
              accountId: next.accountId,
              model,
              settings: modelSettings,
            });
          const first = sessionModel(available, next.provider, "");
          apply({
            provider: next.provider,
            accountId: next.accountId,
            model: first?.id ?? "",
            settings: carryCrossDelegation(modelSettings, modelDefaults(first)),
          });
        }}
        models={models}
        model={model}
        settings={modelSettings}
        disabled={blocked || running || configure.isPending}
        notice={
          <>
            <QueryState query={catalog} />
            {catalog.data?.errors?.[harness] ? (
              <Notice tone="danger" message={catalog.data.errors[harness]} />
            ) : null}
            {conflict ? (
              <Notice
                tone="warning"
                message={copy(
                  "Oturum değişti. Ayarları kapatıp yeniden inceleyin.",
                  "Session changed. Close settings and review again.",
                )}
              />
            ) : null}
            {running ? (
              <Notice
                tone="info"
                message={copy(
                  "Model, mevcut çalışma tamamlanınca değiştirilebilir.",
                  "The model can change after the current run finishes.",
                )}
              />
            ) : configure.error ? (
              <Notice tone="danger" message={configure.error.message} />
            ) : unavailableAccount ? (
              <Notice
                tone="warning"
                message={copy(
                  "Kaydedilmiş hesap kullanılamıyor. Modeli değiştirmek için kullanılabilir bir hesap seçin.",
                  "The saved account is unavailable. Choose an available account to change the model.",
                )}
              />
            ) : undefined}
          </>
        }
        onChange={(next, settings) => {
          if (!unavailableAccount)
            apply({ provider: harness, accountId: providerAccountId, model: next, settings });
        }}
      />
    </>
  );
}
