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
import { ChoiceChip, PressableCard } from "../../ui/primitives";
import { commandId, Loading, ProjectScreenProps, styles, workspaceKey } from "./shared";

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
  const [mode, setMode] = useState<"supervised" | "auto-accept-edits">("supervised");
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
  const selectedModel = model || models[0]?.id || "";
  const create = useMutation({
    mutationFn: () => {
      if (!client || !selectedProvider || !selectedModel)
        throw new Error("Bir sağlayıcı ve model seçin.");
      return client.sessions.create({
        commandId: commandId(),
        projectId,
        harness: selectedProvider,
        model: selectedModel,
        runtimeMode: mode,
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
          onPress={() => setCreating(!creating)}
        />
        {creating && (
          <Card>
            <View style={styles.stack}>
              <SectionTitle
                title="Yeni oturum"
                detail="Seçtiğiniz projenin bilgisayarında başlar."
              />
              <View style={styles.row}>
                {providers.map((p) => (
                  <ChoiceChip
                    key={p}
                    label={p}
                    selected={selectedProvider === p}
                    onPress={() => {
                      setProvider(p);
                      setModel("");
                    }}
                  />
                ))}
              </View>
              {catalog.isPending ? (
                <Loading />
              ) : (
                <>
                  {catalog.error && (
                    <ErrorNotice
                      error={catalog.error}
                      onRetry={() => {
                        void catalog.refetch();
                      }}
                    />
                  )}
                  <View style={styles.row}>
                    {models.map((m) => (
                      <ChoiceChip
                        key={m.id}
                        label={m.name}
                        selected={selectedModel === m.id}
                        onPress={() => setModel(m.id)}
                      />
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.muted}>İzinler</Text>
              <View style={styles.row}>
                <ChoiceChip
                  label="Onay iste"
                  selected={mode === "supervised"}
                  onPress={() => setMode("supervised")}
                />
                <ChoiceChip
                  label="Düzenlemeleri kabul et"
                  selected={mode === "auto-accept-edits"}
                  onPress={() => setMode("auto-accept-edits")}
                />
              </View>
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
