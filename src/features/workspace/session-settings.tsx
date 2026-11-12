import type { SessionSettingsProps, SessionSettingsDraft } from "./session-settings-types";
import { View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useModelCatalog } from "@/state/model-catalog";
import {
  Button,
  Field,
  MutationState,
  Notice,
  QueryState,
  Row,
  Section,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import {
  catalogProviders,
  modelDefaults,
  sessionCatalog,
  sessionModel,
  sessionSettings,
} from "./catalog";
import { AgentModelFields } from "./agent-model-fields";
import { PermissionField } from "./agent-option-icons";
import { providerChoices, selectedChoice } from "./provider-choices";
import type { HostSession } from "./wire";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useMobileTheme } from "@/ui/theme";

/** Agent settings save themselves once picking or typing settles. */
const AUTOSAVE_MS = 500;

/** Equal-width pair aligned to the field edges; wraps to full-width rows at large text. */
const ACTION_BUTTON = { flexGrow: 1, flexBasis: 140, alignSelf: "stretch" } as const;

export function SessionSettings({
  onClose,
  value,
  projectId,
  disabled,
  onCommand,
  onUpdated,
}: SessionSettingsProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [initialDraft] = useState<SessionSettingsDraft>(() => ({
    title: value.session.title,
    provider: value.session.harness,
    accountId: value.session.providerAccountId,
    model: value.session.model,
    mode: value.session.runtimeMode,
    modelSettings: value.session.modelSettings,
  }));
  const form = useFormDraft(initialDraft);
  const { title, provider, accountId, model, mode, modelSettings } = form.values;
  const configure = useAsyncAction();
  const [configurationAction, setConfigurationAction] = useState<"configure" | "compact">(
    "configure",
  );
  const catalog = useModelCatalog(projectId);
  const update = useHostMutation<HostSession>("sessions.update", ["sessions", projectId]);
  const providers = [
    ...new Set([value.session.harness, ...catalogProviders(machine?.providers, catalog.data)]),
  ];
  const availableCatalog = sessionCatalog(catalog.data, providers);
  const models = availableCatalog.models[provider] ?? [];
  const selectedModel = sessionModel(availableCatalog, provider, model);
  const switchAllowed = machine?.capabilities?.includes("sessions.harnessSwitch");
  const choices = providerChoices(
    providers.filter((item) => switchAllowed || item === value.session.harness),
    catalog.data?.accounts,
    copy("Varsayılan hesap", "Default account"),
  );
  const choice = selectedChoice(choices, provider, accountId);
  const running = value.status === "running";
  const pending = disabled || configure.isPending || update.isPending;

  const agentKey = JSON.stringify([provider, accountId ?? null, model, mode, modelSettings]);
  const [savedAgentKey, setSavedAgentKey] = useState(agentKey);
  const [savedTitle, setSavedTitle] = useState(value.session.title);
  const failedKey = useRef<string | null>(null);
  const agentDirty = agentKey !== savedAgentKey;
  const titleDirty = !!title.trim() && title.trim() !== savedTitle;

  const saveAgent = async () => {
    const submitted = agentKey;
    setConfigurationAction("configure");
    try {
      await configure.run(async () =>
        onCommand({
          type: "configure",
          sessionId: value.session.id,
          harness: provider,
          ...(provider === "claude" || provider === "codex"
            ? { providerAccountId: accountId ?? null }
            : {}),
          model,
          modelSettings: selectedModel ? sessionSettings(selectedModel, modelSettings) : modelSettings,
          runtimeMode: mode,
        }),
      );
      setSavedAgentKey(submitted);
    } catch {
      failedKey.current = submitted;
    }
  };
  const saveTitle = async () => {
    if (!titleDirty || pending) return;
    const submitted = title.trim();
    try {
      await update.mutateAsync({
        projectId,
        sessionId: value.session.id,
        title: submitted,
        ...captureSessionAuthority(value),
      });
      setSavedTitle(submitted);
      onUpdated();
    } catch {
      /* The mutation state shows the failure. */
    }
  };
  const saveAgentRef = useRef(saveAgent);
  saveAgentRef.current = saveAgent;
  useEffect(() => {
    if (!agentDirty || !model || running || disabled || configure.isPending) return;
    if (failedKey.current === agentKey) return;
    const timer = setTimeout(() => void saveAgentRef.current(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [agentKey, agentDirty, model, running, disabled, configure.isPending]);

  return (
    <Sheet
      visible
      onClose={() => {
        // Closing flushes whatever the delay has not saved yet.
        void saveTitle();
        if (agentDirty && model && !running && !disabled && failedKey.current !== agentKey) void saveAgent();
        onClose();
      }}
      title={copy("Oturum ayarları", "Session settings")}
      size="form"
      dismissible={!configure.isPending && !update.isPending && !disabled}
    >
      <Section title={copy("Oturum", "Session")}>
        <View style={uiStyles.stack}>
          <Field
            label={copy("Başlık", "Title")}
            value={title}
            onChangeText={(text) => form.setField("title", text)}
            onBlur={() => void saveTitle()}
            onSubmitEditing={() => void saveTitle()}
            returnKeyType="done"
          />
          <MutationState mutation={update} success={copy("Kaydedildi.", "Saved.")} />
          <Row>
            <Button
              label={value.pinned ? copy("Sabitlemeyi kaldır", "Unpin") : copy("Sabitle", "Pin")}
              tone="secondary"
              style={ACTION_BUTTON}
              disabled={pending}
              busy={update.isPending && update.variables?.pinned !== undefined}
              onPress={() => {
                void update
                  .mutateAsync({
                    projectId,
                    sessionId: value.session.id,
                    pinned: !value.pinned,
                    ...captureSessionAuthority(value),
                  })
                  .then(onUpdated)
                  .catch(() => {});
              }}
            />
            <Button
              label={
                value.archived ? copy("Arşivden çıkar", "Unarchive") : copy("Arşivle", "Archive")
              }
              tone="secondary"
              style={ACTION_BUTTON}
              disabled={pending}
              busy={update.isPending && update.variables?.archived !== undefined}
              onPress={() => {
                void update
                  .mutateAsync({
                    projectId,
                    sessionId: value.session.id,
                    ...captureSessionAuthority(value),
                    archived: !value.archived,
                  })
                  .then(onUpdated)
                  .catch(() => {});
              }}
            />
          </Row>
        </View>
      </Section>
      <Section title={copy("Agent ve model", "Agent and model")}>
        <QueryState query={catalog} />
        {catalog.data?.errors[provider] ? (
          <Notice tone="danger" message={catalog.data.errors[provider]} />
        ) : null}
        <AgentModelFields
          catalog={availableCatalog}
          models={models}
          model={model}
          settings={modelSettings}
          provider={{
            choices,
            value: choice,
            onChange: (next) => {
              if (next.provider === provider) {
                form.patch({ accountId: next.accountId });
                return;
              }
              const first = sessionModel(availableCatalog, next.provider, "");
              form.patch({
                provider: next.provider,
                accountId: next.accountId,
                model: first?.id ?? "",
                modelSettings: modelDefaults(first),
              });
            },
          }}
          disabled={pending || running}
          onChange={(next, settings) => form.patch({ model: next, modelSettings: settings })}
        />
        <PermissionField
          value={mode}
          disabled={disabled || running}
          onChange={(next) => form.setField("mode", next)}
        />
        <MutationState
          mutation={configure}
          success={copy("Agent ayarları kaydedildi.", "Agent settings saved.")}
        />
      </Section>
      {running ? (
        <Notice
          tone="info"
          message={copy(
            "Model ayarları mevcut çalışma tamamlanınca değiştirilebilir.",
            "Model settings can change after the current run finishes.",
          )}
        />
      ) : null}
      <Button
        label={copy("Bağlamı sıkıştır", "Compact context")}
        tone="secondary"
        disabled={pending || running || agentDirty}
        busy={configure.isPending && configurationAction === "compact"}
        onPress={() => {
          setConfigurationAction("compact");
          void configure.run(async () => {
            const receipt = await onCommand({ type: "compact", sessionId: value.session.id });
            onClose();
            return receipt;
          });
        }}
      />
    </Sheet>
  );
}
