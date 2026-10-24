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
  Loading,
  QueryState,
  Row,
  Section,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { catalogModel, catalogProviders, modelDefaults } from "./catalog";
import type { HostSession } from "./wire";
import { SelectRow, workspaceStyles } from "./shared";

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
  const [configurationAction, setConfigurationAction] = useState<"configure" | "compact">("configure");
  const catalog = useModelCatalog(projectId);
  const update = useHostMutation<HostSession>("sessions.update", ["sessions", projectId]);
  const models = catalog.data?.models[provider] ?? [];
  const modelPending = !!catalog.data?.pending?.includes(provider);
  const selectedModel = models.find((item) => item.id === model);
  const providers = [
    ...new Set([value.session.harness, ...catalogProviders(machine?.providers, catalog.data)]),
  ];
  const switchAllowed = machine?.capabilities?.includes("sessions.harnessSwitch");
  const running = value.status === "running";
  const pending = disabled || configure.isPending || update.isPending;
  return (
    <Sheet visible onClose={onClose} title={copy("Oturum ayarları", "Session settings")} size="form" dirty={form.dirty} dismissible={!configure.isPending && !update.isPending && !disabled}>
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
                .mutateAsync({ projectId, sessionId: value.session.id, title: title.trim() })
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
                  .mutateAsync({ projectId, sessionId: value.session.id, pinned: !value.pinned })
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
            .map((item) => ({ value: item, label: item }))}
          disabled={disabled || running}
          onChange={(item) => {
            const next = catalogModel(catalog.data, item, "");
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
        {modelPending && !catalog.isError && !models.length ? <Loading /> : null}
        {catalog.isSuccess && !modelPending && !models.length && !catalog.data.errors[provider] ? (
          <Notice
            tone="warning"
            message={copy(
              "Bu agent için model listesi boş. Bilgisayardaki sağlayıcı bağlantısını kontrol et.",
              "The model list is empty for this agent. Check the provider connection on your computer.",
            )}
          />
        ) : null}
        <SelectField
          label={copy("Model", "Model")}
          value={model}
          options={models.map((item) => ({ value: item.id, label: item.name }))}
          disabled={disabled || running || !models.length}
          onChange={(id) => {
            const item = models.find((item) => item.id === id);
            if (item) form.patch({ model: id, modelSettings: modelDefaults(item) });
          }}
        />
        {(selectedModel?.settings ?? []).map((setting) => (
          <SelectField
            key={setting.id}
            label={setting.label}
            value={modelSettings[setting.id] ?? setting.value}
            options={setting.options}
            disabled={disabled || running}
            onChange={(option) =>
              form.patch((current) => ({
                modelSettings: { ...current.modelSettings, [setting.id]: option },
              }))
            }
          />
        ))}
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
              modelSettings,
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
