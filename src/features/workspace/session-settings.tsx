import type { SessionSettingsProps, SessionSettingsDraft } from "./session-settings-types";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import { View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { sameFormValue, useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useModelCatalog } from "@/state/model-catalog";
import {
  Button,
  FormActions,
  Field,
  MutationState,
  Notice,
  QueryState,
  ErrorText,
  Row,
  Section,
  Sheet,
} from "@/ui/primitives";
import { useLocalDraft } from "./use-local-draft";
import { decodeSessionSettingsDraft, encodeSessionSettingsDraft } from "./session-settings-draft";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  catalogProviders,
  modelDefaults,
  sessionCatalog,
  sessionModel,
  sessionSettings,
} from "./catalog";
import { AgentModelFields } from "./agent-model-fields";
import { PermissionField } from "./agent-option-icons";
import { choiceKey, providerChoices, selectedChoice } from "./provider-choices";
import type { HostSession } from "./wire";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useMobileTheme } from "@/ui/theme";

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
  const [openingMachine] = useState(() => ({
    id: machine?.id,
    environmentId: machine?.environmentId,
  }));
  const targetChanged =
    openingMachine.id !== machine?.id || openingMachine.environmentId !== machine?.environmentId;
  const [draftKey] = useState(
    () =>
      `bycoda.mobile.session-settings.v1:${JSON.stringify([machine?.id, machine?.environmentId, projectId, value.session.id])}`,
  );
  const localDraft = useLocalDraft(
    draftKey,
    decodeSessionSettingsDraft,
    encodeSessionSettingsDraft,
  );
  const [hydrated, setHydrated] = useState(false);
  const savedBaseline = useRef(initialDraft);
  const latestValues = useRef(form.values);
  latestValues.current = form.values;
  const { title, provider, accountId, model, mode, modelSettings } = form.values;
  const configure = useAsyncAction<boolean>();
  const saving = useRef(false);
  const [savingPending, setSavingPending] = useState(false);
  const [reviewed, setReviewed] = useState(value);
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
  const savedChoice = choices.find((entry) => entry.key === choiceKey(provider, accountId));
  const unavailableAccount =
    (provider === "claude" || provider === "codex") &&
    Array.isArray(catalog.data?.accounts?.[provider]) &&
    !savedChoice;
  const choice = unavailableAccount
    ? {
        key: choiceKey(provider, accountId),
        provider,
        label: copy("Hesap kullanılamıyor", "Account unavailable"),
      }
    : (savedChoice ?? selectedChoice(choices, provider, accountId));
  const running = value.status === "running";
  const pending =
    disabled ||
    targetChanged ||
    !hydrated ||
    !localDraft.ready ||
    savingPending ||
    configure.isPending ||
    update.isPending;
  const uncertain = !!(update.error as { uncertain?: boolean } | null)?.uncertain;

  const keyOf = (draft: SessionSettingsDraft) =>
    JSON.stringify([
      draft.provider,
      draft.accountId ?? null,
      draft.model,
      draft.mode,
      draft.modelSettings,
    ]);
  const agentKey = keyOf(form.values);
  const [savedAgentKey, setSavedAgentKey] = useState(agentKey);
  const [savedTitle, setSavedTitle] = useState(value.session.title);
  const titleFlight = useRef<{ text: string; promise: Promise<boolean> } | null>(null);

  // Restore the scoped phone draft before enabling edits or Host writes.
  useEffect(() => {
    if (!localDraft.ready || hydrated) return;
    const stored = localDraft.value;
    if (stored) {
      savedBaseline.current = stored.baseline;
      form.reset(stored.baseline);
      form.patch(stored.values);
      setSavedAgentKey(keyOf(stored.baseline));
      setSavedTitle(stored.baseline.title);
      setReviewed({
        ...value,
        authorityGeneration: stored.authorityGeneration,
        revision: stored.revision ?? value.revision,
        session: {
          ...value.session,
          title: stored.baseline.title,
          harness: stored.baseline.provider,
          providerAccountId: stored.baseline.accountId,
          model: stored.baseline.model,
          runtimeMode: stored.baseline.mode,
          modelSettings: stored.baseline.modelSettings,
        },
      });
    }
    setHydrated(true);
  }, [localDraft.ready, hydrated]);
  const patchForm = (patch: Partial<SessionSettingsDraft>) => {
    if (pending) return;
    const values = { ...latestValues.current, ...patch };
    latestValues.current = values;
    form.patch(patch);
    localDraft.setValue({
      baseline: savedBaseline.current,
      values,
      authorityGeneration: reviewed.authorityGeneration,
      revision: reviewed.revision,
    });
  };
  const acknowledge = (patch: Partial<SessionSettingsDraft>) => {
    savedBaseline.current = { ...savedBaseline.current, ...patch };
    localDraft.setValue({
      baseline: savedBaseline.current,
      values: latestValues.current,
      authorityGeneration: reviewed.authorityGeneration,
      revision: reviewed.revision,
    });
  };
  const clearAndClose = async () => {
    try {
      localDraft.setValue(null);
      await localDraft.persist();
      onClose();
    } catch {
      /* Storage error remains visible and editor stays open. */
    }
  };
  const agentDirty = agentKey !== savedAgentKey;
  const titleDirty = title.trim() !== savedTitle;
  const conflict =
    value.authorityGeneration !== reviewed.authorityGeneration ||
    (!sameFormValue(
      [
        value.session.harness,
        value.session.providerAccountId,
        value.session.model,
        value.session.runtimeMode,
        value.session.modelSettings,
        value.session.title,
      ],
      [
        reviewed.session.harness,
        reviewed.session.providerAccountId,
        reviewed.session.model,
        reviewed.session.runtimeMode,
        reviewed.session.modelSettings,
        reviewed.session.title,
      ],
    ) &&
      !sameFormValue(
        [
          value.session.harness,
          value.session.providerAccountId,
          value.session.model,
          value.session.runtimeMode,
          value.session.modelSettings,
          value.session.title,
        ],
        [
          savedBaseline.current.provider,
          savedBaseline.current.accountId,
          savedBaseline.current.model,
          savedBaseline.current.mode,
          savedBaseline.current.modelSettings,
          savedBaseline.current.title,
        ],
      ));
  const { requestClose: discardChanges } = useSheetGuard({
    dirty: agentDirty || titleDirty,
    pending,
    onClose: () => {
      void clearAndClose();
    },
  });

  const saveAgent = async () => {
    if (unavailableAccount || disabled || running || conflict) return false;
    const submitted = agentKey;
    setConfigurationAction("configure");
    try {
      const saved = await configure.run(async () => {
        await onCommand({
          type: "configure",
          sessionId: reviewed.session.id,
          ...captureSessionAuthority(reviewed),
          ...(reviewed.revision !== undefined ? { expectedRevision: reviewed.revision } : {}),
          harness: provider,
          ...(provider === "claude" || provider === "codex"
            ? { providerAccountId: accountId ?? null }
            : {}),
          model,
          modelSettings: selectedModel
            ? sessionSettings(selectedModel, modelSettings)
            : modelSettings,
          runtimeMode: mode,
        });
        return true;
      });
      if (saved !== true) {
        return false;
      }
      setSavedAgentKey(submitted);
      acknowledge({ provider, accountId, model, mode, modelSettings });
      return true;
    } catch {
      return false;
    }
  };
  const saveTitle = async () => {
    if (!title.trim()) return false;
    if (!titleDirty) return true;
    const submitted = title.trim();
    if (titleFlight.current)
      return titleFlight.current.text === submitted ? titleFlight.current.promise : false;
    if (disabled || configure.isPending || update.isPending) return false;
    const promise = (async () => {
      try {
        await update.mutateAsync({
          projectId,
          sessionId: value.session.id,
          title: submitted,
          ...captureSessionAuthority(reviewed),
        });
        setSavedTitle(submitted);
        acknowledge({ title: submitted });
        onUpdated();
        return true;
      } catch {
        /* The mutation state shows the failure. */
        return false;
      }
    })();
    titleFlight.current = { text: submitted, promise };
    try {
      return await promise;
    } finally {
      if (titleFlight.current?.promise === promise) titleFlight.current = null;
    }
  };
  const save = async () => {
    if (
      saving.current ||
      pending ||
      uncertain ||
      conflict ||
      !title.trim() ||
      (agentDirty && (!model || running || unavailableAccount))
    )
      return;
    saving.current = true;
    setSavingPending(true);
    const submittedValues = form.values;
    try {
      await localDraft.persist();
      // Title and configuration use separate RPCs; acknowledge each successful part.
      if (agentDirty && !(await saveAgent())) return;
      if (!(await saveTitle())) return;
      if (sameFormValue(latestValues.current, submittedValues)) await clearAndClose();
    } catch {
      /* Draft storage errors stay visible; no implicit retry. */
    } finally {
      saving.current = false;
      setSavingPending(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={() => {
        if (!hydrated) onClose();
        else void clearAndClose();
      }}
      title={copy("Oturum ayarları", "Session settings")}
      size="form"
      dismissible={!pending || (!hydrated && !!localDraft.error)}
      dirty={agentDirty || titleDirty}
      footer={
        <FormActions
          submitLabel={copy("Kaydet", "Save")}
          onSubmit={() => {
            void save();
          }}
          busy={savingPending || configure.isPending || update.isPending}
          dirty={agentDirty || titleDirty}
          disabled={
            pending ||
            uncertain ||
            conflict ||
            !(agentDirty || titleDirty) ||
            !title.trim() ||
            (agentDirty && (!model || running || unavailableAccount))
          }
        />
      }
    >
      {localDraft.error ? (
        <>
          <ErrorText error={localDraft.error} />
          {!hydrated ? (
            <Button
              label={copy("Yeniden dene", "Retry")}
              onPress={() => {
                void localDraft.load();
              }}
            />
          ) : null}
        </>
      ) : null}
      {uncertain ? (
        <Notice
          tone="warning"
          message={copy(
            "Sonuç belirsiz. Yeniden göndermeden önce bilgisayardaki oturumu kontrol edin.",
            "The result is uncertain. Check the session on the computer before sending again.",
          )}
        />
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
      <Section title={copy("Oturum", "Session")}>
        <View style={uiStyles.stack}>
          <Field
            label={copy("Başlık", "Title")}
            value={title}
            error={
              !title.trim() ? copy("Bu alan gereklidir.", "This field is required.") : undefined
            }
            editable={!pending}
            onChangeText={(text) => patchForm({ title: text })}
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
        {unavailableAccount ? (
          <Notice
            tone="warning"
            message={copy(
              "Kaydedilmiş hesap kullanılamıyor. Modeli değiştirmek için kullanılabilir bir hesap seçin.",
              "The saved account is unavailable. Choose an available account to change the model.",
            )}
          />
        ) : null}
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
                patchForm({ accountId: next.accountId });
                return;
              }
              const first = sessionModel(availableCatalog, next.provider, "");
              patchForm({
                provider: next.provider,
                accountId: next.accountId,
                model: first?.id ?? "",
                modelSettings: carryCrossDelegation(modelSettings, modelDefaults(first)),
              });
            },
          }}
          disabled={pending || running}
          unavailableAccount={unavailableAccount}
          onChange={(next, settings) => patchForm({ model: next, modelSettings: settings })}
        />
        <PermissionField
          value={mode}
          disabled={pending || running || unavailableAccount}
          onChange={(next) => patchForm({ mode: next })}
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
      {(agentDirty || titleDirty) &&
      (configure.isError ||
        update.isError ||
        unavailableAccount ||
        !model ||
        !title.trim() ||
        running ||
        conflict) ? (
        <Button
          label={copy("Değişiklikleri bırak", "Discard changes")}
          tone="quiet"
          disabled={pending}
          onPress={discardChanges}
        />
      ) : null}
      <Button
        label={copy("Bağlamı sıkıştır", "Compact context")}
        tone="secondary"
        disabled={pending || running || agentDirty || titleDirty || conflict || uncertain}
        busy={configure.isPending && configurationAction === "compact"}
        onPress={() => {
          setConfigurationAction("compact");
          void configure.run(async () => {
            const receipt = await onCommand({ type: "compact", sessionId: value.session.id });
            onClose();
            return !!receipt;
          });
        }}
      />
    </Sheet>
  );
}
