import type { SessionSettingsProps, SessionSettingsDraft } from "./session-settings-types";
import { View } from "react-native";
import { useState } from "react";
import { useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useModelCatalog } from "@/state/model-catalog";
import {
  Button,
  Card,
  SelectField,
  Field,
  MutationState,
  Notice,
  QueryState,
  Row,
  Section,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { providerSelectionOption } from "@/ui/provider-identity";
import {
  catalogProviders,
  modelDefaults,
  sessionCatalog,
  sessionModel,
  sessionSettings,
} from "./catalog";
import { AgentModelFields } from "./agent-model-fields";
import type { HostSession } from "./wire";
import { SelectRow, workspaceStyles } from "./shared";
import { captureSessionAuthority } from "@/domain/session-authority";

export function SessionSettings({
  onClose,
  value,
  projectId,
  disabled,
  onCommand,
  onUpdated,
}: SessionSettingsProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const form = useFormDraft<SessionSettingsDraft>(() => ({
    title: value.session.title,
    provider: value.session.harness,
    model: value.session.model,
    mode: value.session.runtimeMode,
    modelSettings: value.session.modelSettings,
  }));
  const { title, provider, model, mode, modelSettings } = form.values;
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
  const running = value.status === "running";
  const pending = disabled || configure.isPending || update.isPending;
  return (
    <Sheet
      visible
      onClose={onClose}
      title={copy("Oturum ayarları", "Session settings")}
      size="form"
      dirty={form.dirty}
      dismissible={!configure.isPending && !update.isPending && !disabled}
    >
      <Card>
        <View style={workspaceStyles.stack}>
          <Field
            label={copy("Başlık", "Title")}
            value={title}
            onChangeText={(text) => form.setField("title", text)}
          />
          <Button
            label={copy("Başlığı kaydet", "Save title")}
            density="compact"
            tone="quiet"
            disabled={!title.trim() || pending || title.trim() === value.session.title}
            busy={update.isPending && update.variables?.title !== undefined}
            onPress={() => {
              void update
                .mutateAsync({
                  projectId,
                  sessionId: value.session.id,
                  title: title.trim(),
                  ...captureSessionAuthority(value),
                })
                .then(onUpdated)
                .catch(() => {});
            }}
          />
          <Row>
            <Button
              label={value.pinned ? copy("Sabitlemeyi kaldır", "Unpin") : copy("Sabitle", "Pin")}
              density="compact"
              tone="quiet"
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
              density="compact"
              tone="quiet"
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
          <MutationState
            mutation={update}
            success={copy("Oturum güncellendi.", "Session updated.")}
          />
        </View>
      </Card>
      <Section title={copy("Agent ve model", "Agent and model")}>
        <QueryState query={catalog} />
        <SelectField
          label={copy("Agent", "Agent")}
          value={provider}
          options={providers
            .filter((item) => switchAllowed || item === value.session.harness)
            .map(providerSelectionOption)}
          disabled={disabled || running}
          onChange={(item) => {
            const next = sessionModel(availableCatalog, item, "");
            form.patch({
              provider: item,
              model: next?.id ?? "",
              modelSettings: modelDefaults(next),
            });
          }}
        />
        {catalog.data?.errors[provider] ? (
          <Notice tone="danger" message={catalog.data.errors[provider]} />
        ) : null}
        {models.length > 0 && !catalog.data?.models[provider]?.length ? (
          <Notice
            tone="info"
            message={copy(
              "Yerleşik model listesi gösteriliyor. Kullanılabilirlik bilgisayarındaki sağlayıcıya bağlıdır.",
              "Showing bundled models. Availability depends on the provider on your computer.",
            )}
          />
        ) : null}
        <AgentModelFields
          models={models}
          model={model}
          settings={modelSettings}
          disabled={pending || running}
          onChange={(next, settings) => form.patch({ model: next, modelSettings: settings })}
        />
      </Section>
      <SelectField
        label={copy("İzinler", "Permissions")}
        value={mode}
        disabled={disabled || running}
        options={[
          { value: "supervised", label: copy("Onay iste", "Ask for approval") },
          {
            value: "auto-accept-edits",
            label: copy("Düzenlemeleri otomatik kabul et", "Auto-accept edits"),
          },
          { value: "auto", label: copy("Otomatik inceleme", "Automatic review") },
          {
            value: "full-access",
            label: copy("Tam erişim", "Full access"),
            detail: copy(
              "Agent komutları ve düzenlemeleri onay beklemeden uygulayabilir.",
              "The agent may run commands and edits without waiting for approval.",
            ),
          },
        ]}
        onChange={(next) => form.setField("mode", next)}
      />
      <MutationState mutation={configure} />
      <Button
        label={copy("Agent ayarlarını kaydet", "Save agent settings")}
        tone="primary"
        density="compact"
        disabled={pending || !model || running}
        busy={configure.isPending && configurationAction === "configure"}
        onPress={() => {
          setConfigurationAction("configure");
          void configure.run(async () => {
            const receipt = await onCommand({
              type: "configure",
              sessionId: value.session.id,
              harness: provider,
              model,
              modelSettings: selectedModel
                ? sessionSettings(selectedModel, modelSettings)
                : modelSettings,
              runtimeMode: mode,
            });
            onClose();
            return receipt;
          });
        }}
      />
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
        tone="quiet"
        density="compact"
        disabled={pending || running}
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
