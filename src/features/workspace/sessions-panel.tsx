import type { ProjectSessionsProps, SessionCreationDraft } from "./sessions-panel-types";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Archive from "lucide-react-native/icons/archive";
import { colors } from "@/ui/tokens";
import { stamp } from "../management/shared/format";
import { router } from "expo-router";
import { useFormDraft } from "@/state/form-draft";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import {
  Badge,
  Body,
  Button,
  SelectField,
  Sheet,
  IconButton,
  SearchField,
  Notice,
  NavigationRow,
  ScreenList,
  QueryState,
  Row,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { CommandError, ErrorText, useCommands, workspaceStyles } from "./shared";
import { catalogModel, catalogProviders, modelDefaults } from "./catalog";
import type { HostSessionSummary, HostModelCatalog } from "./wire";

export function ProjectSessions({ projectId, cwd }: ProjectSessionsProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const openSession = (sessionId: string) => {
    if (!mounted.current || !machine || useMachines.getState().activeId !== machine.id) return;
    setCreating(false);
    router.push({
      pathname: "/session/[id]",
      params: { id: sessionId, projectId, machineId: machine.id },
    });
  };
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const form = useFormDraft<SessionCreationDraft>({ provider: undefined, model: "" });
  const { provider, model } = form.values;
  const sessions = useHostQuery<HostSessionSummary[]>(
    ["sessions", projectId],
    "sessions.list",
    { projectId },
    { interval: 5_000 },
  );
  const catalog = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    { projectId },
    { enabled: creating },
  );
  const command = useCommands(["sessions", projectId]);
  const uncertain = command.error instanceof Error && command.error.name === "UncertainCommand";
  const locked = command.isPending || uncertain;
  const providers = catalogProviders(machine?.providers, catalog.data);
  const selectedProvider = provider && providers.includes(provider) ? provider : providers[0];
  const models = selectedProvider ? (catalog.data?.models[selectedProvider] ?? []) : [];
  const selectedModelValue = catalogModel(catalog.data, selectedProvider, model);
  const selectedModel = selectedModelValue?.id ?? "";
  const visible = (sessions.data ?? [])
    .filter(
      (session) =>
        Boolean(session.archived) === archived &&
        `${session.title} ${session.harness} ${session.branch ?? ""}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.needsInput)) - Number(Boolean(a.needsInput)) ||
        Number(b.status === "running") - Number(a.status === "running") ||
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        b.updatedAt - a.updatedAt,
    );
  return (
    <ScreenList<HostSessionSummary>
      data={visible}
      keyExtractor={(session) => session.id}
      query={sessions}
      header={
        <View style={workspaceStyles.stack}>
          <Row>
            <Button
              label={creating ? copy("Kapat", "Close") : copy("Yeni oturum", "New session")}
              disabled={locked}
              tone="primary"
              onPress={() => setCreating((value) => !value)}
            />
            <IconButton
              label={
                archived ? copy("Etkin oturumlar", "Active sessions") : copy("Arşiv", "Archive")
              }
              onPress={() => setArchived(!archived)}
            >
              <Archive size={19} color={archived ? colors.accent : colors.muted} />
            </IconButton>
            <IconButton
              label={copy("Yenile", "Refresh")}
              disabled={sessions.isFetching}
              onPress={() => {
                void sessions.refetch();
              }}
            >
              <RefreshCw size={18} color={colors.muted} />
            </IconButton>
          </Row>
          <SearchField
            label={copy("Oturum ara", "Search sessions")}
            value={search}
            onChangeText={setSearch}
          />
          {creating ? (
            <Sheet
              visible
              size="form"
              dismissible={!locked}
              dirty={form.dirty}
              title={copy("Yeni oturum", "New session")}
              onClose={() => {
                if (!locked) {
                  setCreating(false);
                  form.reset({ provider: undefined, model: "" });
                }
              }}
            >
              <View style={workspaceStyles.stack}>
                <Body muted style={uiStyles.caption}>
                  {copy(
                    "Agent seçtiğin bilgisayarda çalışır.",
                    "The agent runs on your selected computer.",
                  )}
                </Body>
                {cwd ? (
                  <Body
                    mono
                    muted
                    numberOfLines={1}
                    ellipsizeMode="middle"
                    style={uiStyles.caption}
                  >{`${copy("Çalışma klasörü:", "Working folder:")} ${cwd}`}</Body>
                ) : null}
                <QueryState query={catalog} />
                <SelectField
                  label={copy("Agent", "Agent")}
                  value={selectedProvider}
                  options={providers.map((value) => ({ value, label: value }))}
                  disabled={locked || catalog.isPending}
                  onChange={(value) => form.patch({ provider: value, model: "" })}
                />
                {selectedProvider && catalog.data?.errors[selectedProvider] ? (
                  <ErrorText error={catalog.data.errors[selectedProvider]} />
                ) : null}
                {!catalog.isPending &&
                !catalog.error &&
                !models.length &&
                !catalog.data?.errors[selectedProvider!] ? (
                  <Notice
                    tone="warning"
                    message={copy(
                      "Bu agent için kullanılabilir model yok. Bilgisayardaki sağlayıcı bağlantısını kontrol et.",
                      "No models are available for this agent. Check the provider connection on your computer.",
                    )}
                  />
                ) : null}
                <SelectField
                  label={copy("Model", "Model")}
                  value={selectedModel}
                  options={models.map((value) => ({ value: value.id, label: value.name }))}
                  onChange={(value) => form.setField("model", value)}
                  disabled={locked || !models.length}
                />
                <Body muted>
                  {copy(
                    "Başlangıçta komut ve dosya değişiklikleri için onay istenir. Oturum ayarlarından değiştirebilirsin.",
                    "Commands and file changes ask for approval initially. You can change this in session settings.",
                  )}
                </Body>
                <CommandError
                  error={command.error}
                  onDismiss={() => command.reset()}
                  onRecovered={(receipt) => {
                    command.reset();
                    openSession(receipt.sessionId);
                  }}
                />
                <Button
                  label={copy("Oturumu başlat", "Start session")}
                  tone="primary"
                  disabled={!selectedModel || !selectedProvider || locked}
                  busy={command.isPending}
                  onPress={() => {
                    void command
                      .mutateAsync({
                        type: "create",
                        projectId,
                        ...(cwd ? { worktreeCwd: cwd } : {}),
                        harness: selectedProvider,
                        model: selectedModel,
                        modelSettings: modelDefaults(selectedModelValue),
                        runtimeMode: "supervised",
                      })
                      .then((receipt) => {
                        openSession(receipt.sessionId);
                      })
                      .catch(() => {});
                  }}
                />
              </View>
            </Sheet>
          ) : null}
          <QueryState
            query={sessions}
            empty={
              !visible.length
                ? search
                  ? copy("Aramana uyan oturum yok.", "No sessions match your search.")
                  : archived
                    ? copy("Arşivlenmiş oturum yok.", "No archived sessions.")
                    : copy("Henüz oturum yok.", "No sessions yet.")
                : undefined
            }
          />
          {archived ? (
            <Body muted style={uiStyles.caption}>
              {copy("Arşiv", "Archive")}
            </Body>
          ) : null}
        </View>
      }
      renderItem={({ item: session }) => (
        <NavigationRow
          label={session.title || copy("Yeni oturum", "New session")}
          detail={[session.harness, session.branch || session.model, stamp(session.updatedAt)]
            .filter(Boolean)
            .join(" · ")}
          trailing={
            <Badge
              label={
                session.needsInput
                  ? copy("Yanıt", "Reply")
                  : session.status === "running"
                    ? copy("Çalışıyor", "Running")
                    : session.status === "interrupted"
                      ? copy("Durduruldu", "Interrupted")
                      : session.pinned
                        ? copy("Sabit", "Pinned")
                        : copy("Hazır", "Ready")
              }
              tone={
                session.needsInput ? "warning" : session.status === "running" ? "active" : undefined
              }
            />
          }
          onPress={() => openSession(session.id)}
        />
      )}
    />
  );
}
