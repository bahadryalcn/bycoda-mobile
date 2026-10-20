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
import { haptic } from "@/ui/motion";
import {
  ActionMenu,
  Body,
  Button,
  FormActions,
  SelectField,
  Sheet,
  SearchField,
  Notice,
  NavigationRow,
  ScreenList,
  QueryState,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { IconTile } from "@/ui/icon-tile";
import {
  CommandError,
  ErrorText,
  GroupedListRow,
  relativeTime,
  rowInset,
  sessionStatus,
  StatusDot,
  useCommands,
  workspaceStyles,
} from "./shared";
import { catalogModel, catalogProvider, catalogProviders, modelDefaults } from "./catalog";
import type { HostSessionSummary, HostModelCatalog } from "./wire";
import { sessionDirectoryRows, toggleSessionDirectoryFolder, type SessionDirectoryRow } from "./session-directory";
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
  const selectedProvider = catalogProvider(providers, catalog.data, provider);
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
  const rows = sessionDirectoryRows(visible, sessionLayout, collapsed, !!search.trim());
  return (
    <ScreenList<SessionDirectoryRow>
      grouped
      data={rows}
      keyExtractor={(row) => row.key}
      query={sessions}
      contentContainerStyle={{ gap: 0 }}
      header={
        <View style={[workspaceStyles.stack, { paddingBottom: space.md }]}>
          <Row style={{ flexWrap: "nowrap" }}>
            <Button
              label={creating ? copy("Kapat", "Close") : copy("Yeni oturum", "New session")}
              disabled={locked}
              tone="primary"
              onPress={() => setCreating((value) => !value)}
            >
              {creating ? null : <Plus size={17} strokeWidth={2.4} color={colors.primaryText} />}
            </Button>
            <View style={uiStyles.grow} />
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
                <Body muted style={uiStyles.caption}>
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
                <FormActions
                  submitLabel={copy("Oturumu başlat", "Start session")}
                  tone="primary"
                  disabled={!selectedModel || !selectedProvider || locked || catalog.isPending || !!catalog.error}
                  busy={command.isPending}
                  onSubmit={() => {
                    if (!selectedModel || !selectedProvider || locked || catalog.isPending || catalog.error ||
                      !machine || useMachines.getState().activeId !== machine.id) return;
                    void creation.run(async () => {
                      const receipt = await command.mutateAsync({
                        type: "create",
                        projectId,
                        ...(cwd ? { worktreeCwd: cwd } : {}),
                        harness: selectedProvider,
                        model: selectedModel,
                        modelSettings: modelDefaults(selectedModelValue),
                        runtimeMode: "supervised",
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
                <IconTile color={status.color}>
                  <MessageSquare size={18} strokeWidth={2} color={status.color} />
                </IconTile>
              }
              trailing={
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <StatusDot color={status.color} />
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
