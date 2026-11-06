import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHostClient } from "../../state/host-context";
import { useConnectionStore } from "../../state/connection-store";
import type { HostModelCatalog, HostSessionSummary, RemoteProvider } from "../../domain/types";
import { REMOTE_PROVIDERS } from "../../domain/providers";
import { Button, Card, Empty, ErrorNotice, Field, Screen, SectionTitle } from "../../ui/components";
import { colors } from "../../ui/theme";
import { Body, ChoiceChip, IdentifierField, NavigationRow, PressableCard, ScreenList, SearchField, SelectField, Sheet } from "../../ui/primitives";
import { commandId, Loading, ProjectScreenProps, styles, workspaceKey } from "./shared";
import { creationModel, creationSettings } from "../../features/workspace/catalog";
import { filterSelection } from "@/ui/selection-model";

export function SessionsScreen({
  machineId,
  projectId,
  onOpenSession,
}: ProjectScreenProps & { onOpenSession: (id: string) => void }) {
  useMobileTheme();
  const client = useHostClient(machineId);
  const machine = useConnectionStore((s) => s.machines.find((m) => m.id === machineId));
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState<RemoteProvider | null>(null);
  const [model, setModel] = useState("");
  const [modelSettings, setModelSettings] = useState<Record<string, string>>({});
  const [runtimeMode, setRuntimeMode] = useState<"supervised" | "auto-accept-edits" | "auto" | "full-access">("supervised");
  const [choosingModel, setChoosingModel] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const key = workspaceKey(machineId, projectId, "sessions");
  const sessions = useQuery({
    queryKey: key,
    queryFn: () => client!.sessions.list(projectId),
    enabled: !!client,
    refetchInterval: 5000,
  });
  const catalog = useQuery({
    queryKey: workspaceKey(machineId, projectId, "models"),
    queryFn: () => client!.models.list(projectId),
    enabled: !!client && creating,
  });
  const providers = (machine?.providers ?? []).filter((value): value is RemoteProvider =>
    REMOTE_PROVIDERS.includes(value as RemoteProvider),
  );
  const selectedProvider = provider ?? providers[0];
  const models = selectedProvider ? (catalog.data?.models[selectedProvider] ?? []) : [];
  const exactModel = creationModel(catalog.data, selectedProvider, model);
  const selectedModel = model.trim() || exactModel?.id || "";
  const modelChoices = filterSelection(
    models.map((item) => ({
      value: item.id,
      label: item.name || item.id,
      detail: item.name && item.name !== item.id ? item.id : undefined,
    })),
    modelSearch,
  );
  const create = useMutation({
    mutationFn: () => {
      if (!client || !selectedProvider || !selectedModel)
        throw new Error("Bir sağlayıcı ve model seçin.");
      return client.sessions.create({
        commandId: commandId(),
        projectId,
        harness: selectedProvider,
        model: selectedModel,
        modelSettings: creationSettings(exactModel, modelSettings, selectedProvider, models),
        runtimeMode,
      });
    },
    onSuccess: (receipt) => {
      void cache.invalidateQueries({ queryKey: key });
      setCreating(false);
      onOpenSession(receipt.sessionId);
    },
  });
  const list: HostSessionSummary[] = sessions.data ?? [];
  const visible = list.filter(
    (s) =>
      !s.archived &&
      `${s.title} ${s.harness} ${s.branch ?? ""}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  if (!client)
    return (
      <Screen>
        <Empty title="Bilgisayara bağlanın" detail="Oturumlar seçtiğiniz bilgisayarda çalışır." />
      </Screen>
    );
  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.stack}
        refreshControl={
          <RefreshControl
            refreshing={sessions.isRefetching}
            onRefresh={() => {
              void sessions.refetch();
            }}
            tintColor={colors.accent}
          />
        }
      >
        <SectionTitle
          title="Oturumlar"
          detail={`${visible.length} oturum · ${machine?.name ?? ""}`}
        />
        <Button
          title={creating ? "Vazgeç" : "Yeni oturum"}
          onPress={() => {
            if (creating) {
              setProvider(null);
              setModel("");
              setModelSettings({});
              setRuntimeMode("supervised");
              setChoosingModel(false);
              setModelSearch("");
            }
            setCreating(!creating);
          }}
        />
        {creating && (
          <Card>
            <View style={styles.stack}>
              <SectionTitle
                title="Yeni oturum"
                detail="Seçtiğiniz projenin bilgisayarında başlar."
              />
              <SelectField
                label="Agent"
                value={selectedProvider}
                options={providers.map((value) => ({ value, label: value }))}
                disabled={catalog.isPending}
                onChange={(value) => {
                  setProvider(value as RemoteProvider);
                  setModel("");
                  setModelSettings({});
                  setModelSearch("");
                }}
              />
              {catalog.error && (
                <ErrorNotice
                  error={catalog.error}
                  onRetry={() => {
                    void catalog.refetch();
                  }}
                />
              )}
              {catalog.isPending ? <Loading /> : null}
              <IdentifierField
                label="Model"
                value={model}
                onChangeText={(next) => {
                  setModel(next);
                  setModelSettings({});
                }}
                editable={!catalog.isPending}
                placeholder="Bilgisayardaki model kimliği"
                hint="Model kimliği girin veya katalogdan seçin. Özel model kimlikleri kullanılabilir."
              />
              <Button
                title="Katalogdan seç"
                disabled={!models.length}
                onPress={() => {
                  setModelSearch("");
                  setChoosingModel(true);
                }}
              />
              <Sheet
                visible={choosingModel}
                title="Model seç"
                size="full"
                scroll={false}
                onClose={() => setChoosingModel(false)}
              >
                <ScreenList
                  data={modelChoices}
                  keyExtractor={(item) => item.value}
                  header={
                    <SearchField
                      label="Model ara"
                      value={modelSearch}
                      onChangeText={setModelSearch}
                    />
                  }
                  ListEmptyComponent={
                    <Body muted>
                      Eşleşen model yok. Model kimliğini doğrudan girmek için bu listeyi kapatın.
                    </Body>
                  }
                  renderItem={({ item }) => (
                    <NavigationRow
                      label={item.label}
                      detail={item.detail}
                      selected={model === item.value}
                      onPress={() => {
                        setModel(item.value);
                        setModelSettings({});
                        setChoosingModel(false);
                      }}
                    />
                  )}
                />
              </Sheet>
              {(exactModel?.settings ?? []).map((setting) => (
                <SelectField
                  key={setting.id}
                  label={setting.label}
                  value={modelSettings[setting.id] ?? (["advisor", "subagentModel", "subagentPolicy"].includes(setting.id) ? "" : setting.value)}
                  options={[
                    ...(["advisor", "subagentModel", "subagentPolicy"].includes(setting.id) ? [{ value: "", label: "Ürün varsayılanı" }] : []),
                    ...setting.options,
                  ]}
                  onChange={(option) =>
                    setModelSettings((current) => ({ ...current, [setting.id]: option }))
                  }
                />
              ))}
              <SelectField
                label="İzinler"
                value={runtimeMode}
                options={[
                  { value: "supervised", label: "Onay iste" },
                  { value: "auto-accept-edits", label: "Düzenlemeleri otomatik kabul et" },
                  { value: "auto", label: "Otomatik inceleme" },
                  { value: "full-access", label: "Tam erişim" },
                ]}
                onChange={(next) =>
                  setRuntimeMode(next as "supervised" | "auto-accept-edits" | "auto" | "full-access")
                }
              />
              {create.error && <ErrorNotice error={create.error} />}
              <Button
                title="Oturumu oluştur"
                disabled={!selectedModel}
                busy={create.isPending}
                onPress={() => create.mutate()}
              />
            </View>
          </Card>
        )}
        <Field
          label="Oturum ara"
          value={search}
          onChangeText={setSearch}
          placeholder="Başlık, sağlayıcı veya dal"
        />
        {sessions.isPending && <Loading />}
        {sessions.error && (
          <ErrorNotice
            error={sessions.error}
            onRetry={() => {
              void sessions.refetch();
            }}
          />
        )}
        {!sessions.isPending && !sessions.error && !visible.length && (
          <Empty
            title="Henüz oturum yok"
            detail="Yeni bir oturum açarak bilgisayarınızda çalışmaya başlayın."
          />
        )}
        {visible.map((s) => (
          <PressableCard
            key={s.id}
            label={`${s.title}, ${s.status === "running" ? "çalışıyor" : "hazır"}`}
            onPress={() => onOpenSession(s.id)}
          >
            <View style={styles.row}>
              <Text
                style={[
                  styles.muted,
                  {
                    color: s.needsInput
                      ? colors.accent
                      : s.status === "running"
                        ? colors.success
                        : colors.muted,
                  },
                ]}
              >
                {s.needsInput
                  ? "Yanıt bekliyor"
                  : s.status === "running"
                    ? "● Çalışıyor"
                    : s.status === "interrupted"
                      ? "Kesildi"
                      : "Hazır"}
              </Text>
              <Text style={styles.muted}>{s.harness}</Text>
            </View>
            <Text style={styles.title}>{s.title || "Yeni oturum"}</Text>
            <Text style={styles.muted}>
              {s.branch || s.model} · {new Date(s.updatedAt).toLocaleString("tr-TR")}
            </Text>
          </PressableCard>
        ))}
      </ScrollView>
    </Screen>
  );
}
