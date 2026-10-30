import { ActivityBadge } from "@/ui/activity-badge";
import { isRunningSession } from "./activity-model";
import { useMobileTheme } from "@/ui/theme";
import type { ProjectSessionsProps, SessionCreationDraft } from "./sessions-panel-types";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MessageSquare from "lucide-react-native/icons/message-square";
import Plus from "lucide-react-native/icons/plus";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { router } from "expo-router";
import { useFormDraft } from "@/state/form-draft";
import { createSingleFlight } from "@/state/single-flight";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useModelCatalog } from "@/state/model-catalog";
import { haptic } from "@/ui/motion";
import {
  ActionMenu,
  Body,
  FormActions,
  IconButton,
  SelectField,
  Sheet,
  SearchField,
  NavigationRow,
  ScreenList,
  QueryState,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { providerSelectionOption } from "@/ui/provider-identity";
import {
  CommandError,
  ErrorText,
  GroupedListRow,
  relativeTime,
  rowInset,
  sessionStatus,
  useCommands,
  workspaceStyles,
} from "./shared";
import { catalogProvider, catalogProviders, sessionCatalog, sessionModel, sessionSettings } from "./catalog";
import { AgentModelFields } from "./agent-model-fields";
import type { HostSessionSummary } from "./wire";
import { filterSessionDirectory, sessionDirectoryRows, toggleSessionDirectoryFolder, type SessionDirectoryRow } from "./session-directory";
import { SessionFolderRow } from "./session-folder-row";

export function ProjectSessions({ projectId, cwd, initialCreating = false, sessionLayout }: ProjectSessionsProps) {
  useMobileTheme();
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(initialCreating);
  const [creation] = useState(() => createSingleFlight<void>());
  const form = useFormDraft<SessionCreationDraft>({ provider: undefined, model: "" });
  const { provider, model } = form.values;
  const [modelSettings, setModelSettings] = useState<Record<string, string>>({});
  const [runtimeMode, setRuntimeMode] = useState<"supervised" | "auto-accept-edits" | "auto" | "full-access">("supervised");
  const sessions = useHostQuery<HostSessionSummary[]>(
    ["sessions", projectId],
    "sessions.list",
    { projectId },
    { interval: 5_000 },
  );
  const catalog = useModelCatalog(projectId, creating);
  const command = useCommands(["sessions", projectId]);
  const uncertain = command.error instanceof Error && command.error.name === "UncertainCommand";
  const locked = command.isPending || uncertain;
  const providers = catalogProviders(machine?.providers, catalog.data);
  const availableCatalog = sessionCatalog(catalog.data, providers);
  const selectedProvider = catalogProvider(providers, availableCatalog, provider);
  const models = selectedProvider ? availableCatalog.models[selectedProvider] ?? [] : [];
  const selectedModelValue = sessionModel(availableCatalog, selectedProvider, model);
  const selectedModel = model.trim() || selectedModelValue?.id || "";
  const bundled = !!models.length && !catalog.data?.models[selectedProvider!]?.length;
  const visible = filterSessionDirectory(
    (sessions.data ?? []).filter((session) => Boolean(session.archived) === archived),
    sessionLayout,
    search,
  );
  const rows = sessionDirectoryRows(visible, sessionLayout, collapsed, !!search.trim());
  return (
    <ScreenList<SessionDirectoryRow>
      grouped
      data={rows}
      keyExtractor={(row) => row.key}
      query={sessions}
      contentContainerStyle={{ gap: 0 }}
      header={
        <View style={[workspaceStyles.stack, { gap: space.sm, paddingBottom: space.sm }]}>
          <Row style={{ flexWrap: "nowrap", gap: space.xs }}>
            <View style={uiStyles.grow}>
              <SearchField
                label={copy("Oturum ara", "Search sessions")}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <IconButton
              label={copy("Yeni oturum", "New session")}
              disabled={locked}
              tone="default"
              onPress={() => setCreating(true)}
            >
              <Plus size={20} strokeWidth={2} color={colors.accent} />
            </IconButton>
            <ActionMenu
              label={copy("Oturum seçenekleri", "Session options")}
              active={archived}
              actions={[
                {
                  key: "archive",
                  label: archived ? copy("Etkin oturumlar", "Active sessions") : copy("Arşiv", "Archive"),
                  selected: archived,
                  onPress: () => setArchived((value) => !value),
                },
                {
                  key: "refresh",
                  label: copy("Yenile", "Refresh"),
                  disabled: sessions.isFetching,
                  onPress: () => {
                    void sessions.refetch();
                  },
                },
              ]}
            />
          </Row>
          {creating ? (
            <Sheet
              visible
              size="form"
              dismissible={!locked}
              dirty={form.dirty || Object.keys(modelSettings).length > 0 || runtimeMode !== "supervised"}
              title={copy("Yeni oturum", "New session")}
              onClose={() => {
                if (!locked) {
                  setCreating(false);
                  form.reset({ provider: undefined, model: "" });
                  setModelSettings({});
                  setRuntimeMode("supervised");
                }
              }}
            >
              <View style={workspaceStyles.stack}>
                {cwd ? (
                  <Body
                    mono
                    muted
                    numberOfLines={1}
                    ellipsizeMode="middle"
                    style={uiStyles.caption}
                  >{`${copy("Çalışma klasörü:", "Working folder:")} ${cwd}`}</Body>
                ) : null}
                <QueryState query={catalog} loading="inline" />
                <SelectField
                  label={copy("Agent", "Agent")}
                  value={selectedProvider}
                  options={providers.map(providerSelectionOption)}
                  disabled={locked}
                  onChange={(value) => {
                    form.patch({ provider: value, model: "" });
                    setModelSettings({});
                  }}
                />
                {selectedProvider && catalog.data?.errors[selectedProvider] ? (
                  <ErrorText error={catalog.data.errors[selectedProvider]} />
                ) : null}
                {bundled ? <Body muted>{copy("Yerleşik model listesi gösteriliyor. Kullanılabilirlik bilgisayarındaki sağlayıcıya bağlıdır.", "Showing bundled models. Availability depends on the provider on your computer.")}</Body> : null}
                <AgentModelFields
                  models={models}
                  model={selectedModel}
                  settings={sessionSettings(selectedModelValue, modelSettings)}
                  disabled={locked}
                  onChange={(next, settings) => {
                    form.setField("model", next);
                    setModelSettings(settings);
                  }}
                />
                <SelectField
                  label={copy("İzinler", "Permissions")}
                  value={runtimeMode}
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
                  disabled={locked}
                  onChange={(next) =>
                    setRuntimeMode(next as "supervised" | "auto-accept-edits" | "auto" | "full-access")
                  }
                />
                {runtimeMode === "supervised" ? <Body muted style={uiStyles.caption}>
                  {copy(
                    "Başlangıçta komut ve dosya değişiklikleri için onay istenir. Oturum ayarlarından değiştirebilirsin.",
                    "Commands and file changes ask for approval initially. You can change this in session settings.",
                  )}
                </Body> : null}
                <CommandError
                  error={command.error}
                  onDismiss={() => command.reset()}
                  onRecovered={(receipt) => {
                    command.reset();
                    openSession(receipt.sessionId);
                  }}
                />
                <FormActions
                  submitLabel={copy("Oturumu başlat", "Start session")}
                  tone="primary"
                  disabled={!selectedModel || !selectedProvider || locked}
                  busy={command.isPending}
                  onSubmit={() => {
                    if (!selectedModel || !selectedProvider || locked ||
                      !machine || useMachines.getState().activeId !== machine.id) return;
                    void creation.run(async () => {
                      const receipt = await command.mutateAsync({
                        type: "create",
                        projectId,
                        ...(cwd ? { worktreeCwd: cwd } : {}),
                        harness: selectedProvider,
                        model: selectedModel,
                        modelSettings: sessionSettings(selectedModelValue, modelSettings),
                        runtimeMode,
                      });
                      haptic.success();
                      openSession(receipt.sessionId);
                    }).catch(() => {});
                  }}
                />
              </View>
            </Sheet>
          ) : null}
          <QueryState
            query={sessions}
            loading="list"
            loadingLabel={copy("Oturumlar yükleniyor…", "Loading sessions…")}
            empty={
              !visible.length
                ? search.trim()
                  ? copy("Aramana uyan oturum yok.", "No sessions match your search.")
                  : archived
                    ? copy("Arşivlenmiş oturum yok.", "No archived sessions.")
                    : copy("Henüz oturum yok.", "No sessions yet.")
                : undefined
            }
            emptyAction={search.trim() ? {
              label: copy("Aramayı temizle", "Clear search"),
              onPress: () => setSearch(""),
            } : undefined}
          />
        </View>
      }
      renderItem={({ item, index }) => {
        if (item.kind === "folder") return <SessionFolderRow row={item}
          onToggle={() => setCollapsed((current) => toggleSessionDirectoryFolder(current, item, !!search.trim()))} />;
        const session = item.session;
        const status = sessionStatus(session, copy);
        return (
          <GroupedListRow first={index === 0 || rows[index - 1]?.kind === "folder"}
            last={index === rows.length - 1 || rows[index + 1]?.kind === "folder"} inset={rowInset}>
            <View style={{ paddingStart: item.depth * space.md }}>
            <NavigationRow
              variant="plain"
              label={session.title || copy("Yeni oturum", "New session")}
              detail={[status.label, session.harness, session.branch || session.model]
                .filter(Boolean)
                .join(" · ")}
              icon={
                <View accessible={false} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                  <MessageSquare size={20} strokeWidth={1.8} color={colors.muted} />
                </View>
              }
              trailing={
                <View style={{ alignItems: "flex-end", gap: space.xs }}>
                  {isRunningSession(session) ? <ActivityBadge /> : null}
                  <Body muted style={uiStyles.caption}>
                    {relativeTime(session.updatedAt, copy)}
                  </Body>
                </View>
              }
              onPress={() => openSession(session.id)}
            />
            </View>
          </GroupedListRow>
        );
      }}
    />
  );
}
