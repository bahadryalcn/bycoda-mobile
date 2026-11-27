import { useMobileTheme } from "@/ui/theme";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import Paperclip from "lucide-react-native/icons/paperclip";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import {
  Badge,
  Body,
  Button,
  ErrorText,
  FormActions,
  Empty,
  IconButton,
  Row,
  ScreenList,
  SearchField,
  SelectField,
  Sheet,
  NoResults,
} from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { RecordAccessUnavailable } from "./unavailable-state";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { PrivateContentBoundary, PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-content";
import type { ScreenListProps } from "@/ui/screen-list";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { ScreenChromeProvider } from "@/ui/layout";
import { normalizeSearch } from "../management/shared/search";
import { metrics, space } from "@/ui/tokens";
import { AttachmentFile } from "./transcript-attachments";
import { useEarlierSession } from "./session-queries";
import {
  defaultSessionFileFilters,
  filterSessionFiles,
  sessionFileIndexWhileOpen,
  type SessionFile,
  type SessionFileFilters,
} from "./session-file-model";
import type { HostSession } from "./wire";
import type { SessionScope } from "./session-types";

/** A session index reuses the same authenticated viewer as each message. */
export function SessionFiles(props: { scope: SessionScope; session: HostSession }) {
  const connection = useConnectionScope();
  const { scope, session } = props;
  return <SessionFilesScope key={JSON.stringify([connection.token, scope.machineId, scope.sessionId, session.projectId, session.session.id, session.session.worktreeCwd || session.session.cwd])} {...props} connection={connection} />;
}

function SessionFilesScope({ scope, session, connection }: { scope: SessionScope; session: HostSession; connection: ConnectionScope }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const client = useHostClient();
  const active = useHostReadActive(), access = usePrivateContentAccess(), machine = useActiveMachine();
  const [opening] = useState(() => ({ ...scope, connection, projectId: session.projectId, cwd: session.session.worktreeCwd || session.session.cwd, machineName: machine?.name ?? scope.machineId }));
  const mounted = useRef(false), denied = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SessionFileFilters>(defaultSessionFileFilters);
  const earlier = useEarlierSession(scope, session);
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && machine?.id === opening.machineId && useMachines.getState().activeId === opening.machineId &&
    scope.machineId === opening.machineId && scope.sessionId === opening.sessionId && session.session.id === opening.sessionId && session.projectId === opening.projectId && (session.session.worktreeCwd || session.session.cwd) === opening.cwd;
  const available = scopeCurrent && active && access.allowed && access.check() && !!client && isReviewedMachine(reviewedMachine(client.machine), useMachines.getState());
  const kind = (earlier.error as { kind?: string } | null)?.kind;
  if (kind === "auth" || kind === "identity") denied.current = true;
  else if (earlier.isSuccess && !earlier.error && !earlier.isPending) denied.current = false;
  const readable = open && available && !denied.current;
  // Indexing is deferred until the sheet opens; reopening re-reads the current blocks.
  const files = useMemo(() => sessionFileIndexWhileOpen(open, session.session.blocks), [open, session.session.blocks]);
  const filtered = useMemo(
    () => filterSessionFiles(files, search, filters, locale),
    [files, search, filters, locale],
  );
  const activeFilters = filters.source !== "all" || filters.kind !== "all";
  const searchKey = normalizeSearch(search, locale);
  const filterKey = !searchKey && !activeFilters ? "" : JSON.stringify([searchKey, filters.source, filters.kind]);
  const position = useFilteredListScrollMemory<SessionFile>(filterKey, readable, filtered.length, { suspended: !readable });
  const readPort = useMemo(() => ({ valid: true }), [open, readable, client]);
  const controls = useMemo(() => ({ active: false }), [readPort]);
  const filterControls = useMemo(() => ({ active: false }), [readPort, filtersOpen]);
  useLayoutEffect(() => { controls.active = true; return () => { controls.active = false; }; }, [controls]);
  useLayoutEffect(() => { filterControls.active = true; return () => { filterControls.active = false; }; }, [filterControls]);
  const live = useRef({ open, filtersOpen, available, active, access, client, readPort, pending: earlier.isPending, before: session.history?.before });
  live.current = { open, filtersOpen, available, active, access, client, readPort, pending: earlier.isPending, before: session.history?.before };
  const current = () => mounted.current && live.current.open && live.current.available && live.current.active && opening.connection.isCurrent() &&
    useMachines.getState().activeId === opening.machineId && live.current.access.allowed && live.current.access.check() && !!live.current.client &&
    isReviewedMachine(reviewedMachine(live.current.client.machine), useMachines.getState());
  const canRead = () => current() && !denied.current;
  const scopedAccess = useMemo(() => ({ allowed: readable, check: () => readPort.valid && live.current.readPort === readPort && canRead() }), [readPort, readable]);
  useLayoutEffect(() => { if (!readable) setFiltersOpen(false); }, [readable]);
  const changeSearch = (value: string) => { if (controls.active && canRead()) setSearch(value); };
  const close = () => { if (mounted.current && live.current.open) { readPort.valid = false; live.current.open = false; setFiltersOpen(false); setOpen(false); } };
  const changeFilters = (value: Partial<SessionFileFilters>) => { if (filterControls.active && canRead() && live.current.filtersOpen) setFilters(current => ({ ...current, ...value })); };
  const resetFilters = () => { if (controls.active && canRead()) setFilters(defaultSessionFileFilters); };
  const paging = useRef<Promise<unknown> | null>(null);
  const loadEarlier = () => {
    if (!controls.active || !current() || live.current.pending || paging.current || live.current.before === undefined || live.current.before !== session.history?.before) return;
    const request = earlier.mutateAsync(); paging.current = request;
    void request.catch(() => {}).finally(() => { if (paging.current === request) paging.current = null; });
  };
  return (
    <>
      <ChatAction label={copy("Oturum dosyaları", "Session files")} onPress={() => setOpen(true)}>
        <Paperclip size={19} color={colors.muted} />
      </ChatAction>
      <Sheet
        visible={open}
        title={copy("Oturum dosyaları", "Session files")}
        size="full"
        scroll={false}
        onClose={close}
      >
        {open && !readable ? <ScrollView contentContainerStyle={{ padding: space.screen, gap: space.sm, flexGrow: 1, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
          <RecordAccessUnavailable />
          {available && denied.current ? <><ErrorText error={earlier.error} /><Button label={copy("Önceki mesajları yükle", "Load earlier messages")} busy={earlier.isPending} onPress={loadEarlier} /></> : null}
        </ScrollView> : null}
        <PrivateContentBoundary visible={readable} isAllowed={canRead}><PrivateContentAccessProvider value={scopedAccess}>
          <View style={{ flex: 1 }}>
            <View style={{ gap: space.xs, paddingHorizontal: space.screen, paddingTop: space.sm }}>
              <Row>
                <View style={[uiStyles.grow, { flexBasis: 160 }]}>
                  <SearchField label={copy("Oturum dosyalarında ara", "Search session files")} value={readable ? search : ""} editable={readable} onChangeText={changeSearch} />
                </View>
                <IconButton label={copy("Dosya filtreleri", "File filters")} expanded={filtersOpen}
                  onPress={() => { if (controls.active && canRead()) setFiltersOpen(true); }}>
                  <SlidersHorizontal size={19} color={activeFilters ? colors.accent : colors.muted} />
                </IconButton>
              </Row>
              {files.length || activeFilters ? (
                <Row>
                  {files.length ? <Body muted style={uiStyles.caption}>{copy("{p0} / {p1} dosya", "{p0} / {p1} files", { p0: filtered.length, p1: files.length })}</Body> : null}
                  {activeFilters ? <Badge label={copy("Filtre etkin", "Filter active")} tone="active" /> : null}
                </Row>
              ) : null}
            </View>
          <ScreenChromeProvider nativeTitle bottomSafeArea={false}><ScopedFileList scope={scope} session={session}
            {...position.listProps}
            style={{ backgroundColor: colors.panel }}
            data={readable ? filtered : []}
            keyExtractor={(file) => file.key}
            ListEmptyComponent={files.length && (searchKey || activeFilters) ? (
              <NoResults searching={!!searchKey} filtered={!!activeFilters}
                title={copy("Aramana uyan dosya yok", "No files match your search")}
                onClearSearch={() => changeSearch("")} onClearFilters={resetFilters} />
            ) : (
              <Empty
                compact={false}
                illustration={files.length ? "search-empty" : "inbox-empty"}
                title={
                  files.length
                    ? copy("Aramana uyan dosya yok", "No files match your search")
                    : copy("Yüklenen mesajlarda dosya yok", "No files in loaded messages")
                }
                action={searchKey ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => changeSearch("") }
                  : activeFilters ? { label: copy("Filtreleri temizle", "Clear filters"), onPress: resetFilters } : undefined}
              />
            )}
            footer={
              session.history?.before !== undefined ? (
                <>
                  <Body muted style={uiStyles.caption}>
                    {copy(
                      "Daha eski dosyalar için önceki mesajları yükle.",
                      "Load earlier messages to find older files.",
                    )}
                  </Body>
                  <ErrorText error={earlier.error} />
                  <Button
                    tone="quiet"
                    label={copy("Önceki mesajları yükle", "Load earlier messages")}
                    busy={earlier.isPending}
                    onPress={loadEarlier}
                  />
                </>
              ) : null
            }
          /></ScreenChromeProvider></View>
      <Sheet
        visible={readable && filtersOpen}
        title={copy("Dosya filtreleri", "File filters")}
        size="compact"
        onClose={() => { if (filterControls.active && live.current.open) setFiltersOpen(false); }}
        footer={<FormActions submitLabel={copy("Bitti", "Done")} onSubmit={() => { if (filterControls.active && live.current.open) setFiltersOpen(false); }}
          cancelLabel={copy("Sıfırla", "Reset")} onCancel={() => { if (filterControls.active) resetFilters(); }} cancelDisabled={!activeFilters} />}
      >
        <SelectField
          label={copy("Gönderen", "Sender")}
          value={filters.source}
          onChange={(source) => changeFilters({ source })}
          options={[
            { value: "all", label: copy("Tümü", "All") },
            { value: "user", label: copy("Siz", "You") },
            { value: "agent", label: copy("Ajan", "Agent") },
          ]}
        />
        <SelectField
          label={copy("Dosya türü", "File type")}
          value={filters.kind}
          onChange={(kind) => changeFilters({ kind })}
          options={[
            { value: "all", label: copy("Tümü", "All") },
            { value: "image", label: copy("Resimler", "Images") },
            { value: "audio", label: copy("Ses", "Audio") },
            { value: "file", label: copy("Belgeler", "Documents") },
          ]}
        />
      </Sheet>
        </PrivateContentAccessProvider></PrivateContentBoundary>
      </Sheet>
    </>
  );
}

/** The existing transport owner captures the original collection's private check. */
function ScopedFileList({ scope, session, ...props }: Omit<ScreenListProps<SessionFile>, "renderItem"> & { scope: SessionScope; session: HostSession }) {
  const { uiStyles } = useMobileTheme();
  const client = useHostClient(), copy = useCopy();
  const context = client ? { client, machineId: scope.machineId, projectId: session.projectId, sessionId: scope.sessionId, cwd: session.session.worktreeCwd || session.session.cwd } : undefined;
  return <ScreenList<SessionFile> {...props} renderItem={({ item }) => <View style={{ gap: space.xs }}>
    <Body muted style={uiStyles.caption}>{item.source === "user" ? copy("Siz", "You") : copy("Ajan", "Agent")}</Body>
    {context ? <AttachmentFile id={item.id} name={item.name} size={item.size} mimeType={item.mimeType} image={item.kind === "image"} context={context} /> : null}
  </View>} />;
}
