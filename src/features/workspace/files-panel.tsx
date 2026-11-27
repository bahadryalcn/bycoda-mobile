import { useMobileTheme } from "@/ui/theme";
import type { ProjectFilesProps, FileContentSearch, CreateFileDraft } from "./files-panel-types";
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { ScrollView, Text, View } from "react-native";
import { useScreenBackHandler } from "@/ui/screen-back-handler";
import Folder from "lucide-react-native/icons/folder";
import File from "lucide-react-native/icons/file";
import FileText from "lucide-react-native/icons/file-text";
import Plus from "lucide-react-native/icons/plus";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Home from "lucide-react-native/icons/house";
import { ScrollFade } from "panelui-native/components/scroll-fade";
import { useFormDraft } from "@/state/form-draft";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
  Body,
  Button,
  SectionHeader,
  SegmentedControl,
  ToggleField,
  IdentifierField,
  IconButton,
  MutationState,
  NavigationRow,
  PressableCard,
  RowIcon,
  QueryState,
  Row,
  ScreenList,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { queryOwnsRegion } from "./query-region";
import { iconSize, space } from "@/ui/tokens";
import { useCollapsibleSearch } from "@/ui/search-field";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import type { FileEntry } from "./wire";
import { InScreenBack } from "@/ui/in-screen-back";
import { FileReview } from "./file-review";
import { FileActions } from "./file-actions";
import { filesReducer } from "./workspace-state";
import { useProjectSubpage } from "./subpage-chrome";
import { defaultFileListOptions, fileParentPath, visibleFileEntries } from "./file-list-model";
import { GroupedListRow } from "./shared";

type FileRow =
  | { key: string; entry: FileEntry }
  | { key: string; match: FileContentSearch["matches"][number] };

function Crumb({ label, home, current, onPress }: { label: string; home?: boolean; current: boolean; onPress: () => void }) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <PressableCard label={label} onPress={onPress} hitSlop={{ top: 8, bottom: 8 }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: 0, paddingHorizontal: space.sm, marginHorizontal: 0, marginStart: home ? -space.sm : 0, minHeight: 32 }}>
      {home ? <Home size={14} color={current ? colors.text : colors.muted} /> : null}
      <Text numberOfLines={1} style={[uiStyles.label, { color: current ? colors.text : colors.muted, fontWeight: current ? "700" : "500" }]}>{label}</Text>
    </PressableCard>
  );
}

export function ProjectFiles({
  projectId,
  cwd,
  root,
  initialPath,
  onClearInitialPath,
  onDraftGuard,
  hideDraftWriteWarning,
}: ProjectFilesProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [state, dispatch] = useReducer(filesReducer, {
    path: "",
    search: "",
    searchMode: "names",
    view: initialPath ? { kind: "edit", path: initialPath } : { kind: "browse" },
  });
  const { path, search } = state;
  const searchContent = state.searchMode === "content";
  const selected = state.view.kind === "edit" ? state.view.path : null;
  const actions = state.view.kind === "actions" ? state.view.entry : null;
  const creating = state.view.kind === "create";
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(defaultFileListOptions);
  // Success text names the file and what happened to it ("notes.md created").
  const [createdName, setCreatedName] = useState("");
  const [actionSummary, setActionSummary] = useState("");
  const ignoredLabel = copy("Git tarafından yok sayılıyor", "Ignored by Git");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const list = useHostQuery<FileEntry[]>(
    ["files", projectId, cwd, path, query],
    query ? "files.search" : "files.list",
    { projectId, cwd, ...(query ? { query } : { path }) },
    { enabled: !searchContent || !query, keepPrevious: true },
  );
  // While the next folder loads, the previous rows stay in place (dimmed, inert) instead of
  // the list collapsing into a skeleton and jumping back.
  const switching = list.isPlaceholderData;
  const content = useHostQuery<FileContentSearch>(
    ["file-content", projectId, cwd, query],
    "files.searchContent",
    { projectId, cwd, query },
    { enabled: searchContent && !!query },
  );
  const create = useHostMutation<string>("files.create", ["files", projectId]);
  const fileAction = useHostMutation<unknown>("workspace.run", ["files", projectId]);
  const browse = () => dispatch({ type: "view", view: { kind: "browse" } });
  const openFile = (file: string, line?: number) =>
    dispatch({
      type: "view",
      view: { kind: "edit", path: file, ...(line !== undefined ? { line } : {}) },
    });
  const navigate = useCallback((nextPath: string) => {
    setQuery("");
    dispatch({ type: "search-mode", mode: "names" });
    dispatch({ type: "navigate", path: nextPath });
  }, []);
  const entries = useMemo(() => visibleFileEntries(list.data ?? [], options), [list.data, options]);
  const showMatches = searchContent && !!query;
  const rows: FileRow[] = showMatches
    ? (content.data?.matches ?? []).map((match, index) => ({
        key: match.relative + ":" + match.line + ":" + index,
        match,
      }))
    : entries.map((entry) => ({ key: entry.path, entry }));
  const focused = useIsFocused();
  const browseBack = () => {
    if (search) dispatch({ type: "search", value: "" });
    else navigate(fileParentPath(path));
  };
  useScreenBackHandler(focused && state.view.kind === "browse" && (!!path || !!search), browseBack);
  // A folder level or a search lends its name to the project header, whose one back goes up a level.
  useProjectSubpage(state.view.kind !== "browse" ? null : search ? copy("Arama", "Search") : path ? path.split("/").filter(Boolean).at(-1) ?? null : null, browseBack);
  // The browser stays mounted under an open file so Back returns to the same scroll position.
  const review = selected ? (
      <FileReview
        key={selected}
        projectId={projectId}
        cwd={cwd}
        root={root}
        path={selected}
        initialLine={state.view.kind === "edit" ? state.view.line : undefined}
        onBack={() => {
          browse();
          onClearInitialPath?.();
        }}
        onDraftGuard={onDraftGuard}
        hideDraftWriteWarning={hideDraftWriteWarning}
      />
    ) : null;
  const crumbs = path.split("/").filter(Boolean);
  const activeQuery = showMatches ? content : list;
  // The search type is how the field searches, not a filter on the list, so it never lights the filter icon.
  const appliedFilters =
    Number(!options.showHidden) + Number(!options.showIgnored) + Number(options.order !== defaultFileListOptions.order);
  const visibilityFiltered = !options.showHidden || !options.showIgnored;
  const emptyFiltered = !showMatches && visibilityFiltered;
  const regionOwned = queryOwnsRegion(activeQuery, !rows.length);
  const clearSearch = () => { setQuery(""); dispatch({ type: "search", value: "" }); };
  const regionState = (
    <QueryState
      query={activeQuery}
      noResults={{ searching: !!query, filtered: emptyFiltered,
        title: copy("Aramana uyan dosya yok.", "No files match your search."),
        filtersTitle: copy("Filtrelere uyan dosya yok.", "No files match the filters."),
        onClearSearch: clearSearch, onClearFilters: () => setOptions(defaultFileListOptions) }}
      empty={
        !rows.length
          ? emptyFiltered
            ? copy("Filtrelere uyan dosya yok.", "No files match the filters.")
            : query
              ? copy("Aramana uyan dosya yok.", "No files match your search.")
              : copy("Bu klasörde dosya yok.", "No files in this folder.")
          : undefined
      }
      emptyIllustration={query || emptyFiltered ? "search-empty" : undefined}
      emptyAction={query ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
        : emptyFiltered ? { label: copy("Sıfırla", "Reset"), onPress: () => setOptions(defaultFileListOptions) }
        : undefined}
    />
  );
  const fileSearch = useCollapsibleSearch(
    <SearchField
      label={searchContent ? copy("Dosya içeriğinde ara", "Search file contents") : copy("Dosya ara", "Search files")}
      value={search}
      maxLength={200}
      onChangeText={(value) => {
        if (!value.trim()) setQuery("");
        dispatch({ type: "search", value });
      }}
      placeholder={searchContent ? copy("Dosya içeriğinde ara", "Search file contents") : copy("Ad veya dosya yolu", "Name or file path")}
    />,
    {
      activeFilters: appliedFilters,
      onResetFilters: () => {
        setOptions(defaultFileListOptions);
        dispatch({ type: "search-mode", mode: "names" });
      },
      filters: <>
        {/* How the field searches sits right under it; the folder stays listed until a query is typed. */}
        <SegmentedControl hideLabel label={copy("Arama türü", "Search type")} value={state.searchMode}
          options={[
            { value: "names", label: copy("Ad", "Name") },
            { value: "content", label: copy("İçerik", "Content") },
          ]}
          onChange={(mode) => dispatch({ type: "search-mode", mode })} />
        <SectionHeader title={copy("Görünüm", "View")} />
        <ToggleField label={copy("Gizli dosyaları göster", "Show hidden files")} value={options.showHidden} disabled={showMatches}
          onChange={(showHidden) => setOptions((current) => ({ ...current, showHidden }))} />
        <ToggleField label={copy("Git tarafından yok sayılanları göster", "Show Git-ignored files")} value={options.showIgnored} disabled={showMatches}
          onChange={(showIgnored) => setOptions((current) => ({ ...current, showIgnored }))} />
        <SegmentedControl label={copy("Sıralama", "Sort by")} value={options.order} disabled={showMatches}
          options={[
            { value: "ascending", label: copy("Ada göre A → Z", "Name A → Z") },
            { value: "descending", label: copy("Ada göre Z → A", "Name Z → A") },
          ]}
          onChange={(order) => setOptions((current) => ({ ...current, order }))} />
      </>,
    },
  );
  return (
    <>
      {review}
      {/* An open file, a folder level or a search is in-screen state; the native swipe would reveal the previous route. */}
      <InScreenBack active={!!selected || (state.view.kind === "browse" && (!!path || !!search))}
        onBack={() => {
          if (selected) { browse(); onClearInitialPath?.(); }
          else if (search) dispatch({ type: "search", value: "" });
          else navigate(fileParentPath(path));
        }} />
      <View style={{ flex: 1, display: selected ? "none" : "flex" }}>
      <ScreenList<FileRow>
        grouped
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ gap: 0 }}
        ListEmptyComponent={regionOwned ? regionState : undefined}
        query={activeQuery}
        header={
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            <Row style={{ flexWrap: "nowrap" }}>
              {/* The breadcrumb, Back and the swipe already go up a level; no separate parent arrow. */}
              <ScrollFade edges="both" size={24} color={colors.background} style={uiStyles.grow}>
              <ScrollView
                horizontal
                alwaysBounceHorizontal={false}
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                style={uiStyles.grow}
                contentContainerStyle={{ alignItems: "center", gap: space.xs }}
              >
                <Crumb label={copy("Kök", "Root")} home current={!crumbs.length} onPress={() => navigate("")} />
                {crumbs.map((part, index) => (
                  <Row key={index + ":" + part} style={{ gap: 0, flexWrap: "nowrap" }}>
                    <ChevronRight size={13} color={colors.tertiary} />
                    <Crumb
                      label={part}
                      current={index === crumbs.length - 1}
                      onPress={() => navigate(crumbs.slice(0, index + 1).join("/"))}
                    />
                  </Row>
                ))}
              </ScrollView>
              </ScrollFade>
              {fileSearch.trigger}
              {fileSearch.filterTrigger}
              <IconButton
                label={copy("Yeni dosya / klasör", "New file / folder")}
                tone="default"
                disabled={create.isPending}
                onPress={() => {
                  create.reset();
                  dispatch({ type: "view", view: { kind: "create" } });
                }}
              >
                <Plus size={iconSize.action} strokeWidth={2.4} color={colors.accent} />
              </IconButton>
            </Row>
            {fileSearch.sheet}
            {!creating ? (
              <MutationState
                mutation={create}
                success={copy("{p0} oluşturuldu.", "{p0} created.", { p0: createdName })}
              />
            ) : null}
            {!actions ? (
              <MutationState
                mutation={fileAction}
                success={actionSummary || undefined}
              />
            ) : null}
          </View>
        }
        footer={
          showMatches && content.data?.truncated ? (
            <Body muted>
              {copy(
                "Sonuçlar sınırlandı. Daha belirli bir arama kullan.",
                "Results were limited. Use a more specific search.",
              )}
            </Body>
          ) : null
        }
        renderItem={({ item, index }) => dimWhile(switching, (() => {
          const first = index === 0;
          const last = index === rows.length - 1;
          if ("match" in item) {
            const match = item.match;
            const name = match.relative.replaceAll("\\", "/").split("/").at(-1) || match.relative;
            return (
              <GroupedListRow first={first} last={last}>
                <NavigationRow
                  variant="plain"
                  label={name + ":" + match.line}
                  detail={match.preview}
                  detailLines={2}
                  metadata={fileParentPath(match.relative)}
                  metadataLines={0}
                  accessibilityLabel={`${match.relative}:${match.line}. ${match.preview}`}
                  icon={
                    <RowIcon glyph={FileText} />
                  }
                  onPress={() => openFile(match.relative, match.line)}
                />
              </GroupedListRow>
            );
          }
          const entry = item.entry;
          return (
            <GroupedListRow first={first} last={last}>
              <Row style={{ flexWrap: "nowrap", paddingEnd: space.xs }}>
                <View style={uiStyles.grow}>
                  <NavigationRow
                    variant="plain"
                    label={entry.name}
                    intent={root ? "select" : "navigate"}
                    icon={
                      entry.isDir ? (
                        <RowIcon glyph={Folder} />
                      ) : (
                        <RowIcon glyph={File} />
                      )
                    }
                    detail={
                      query
                        ? fileParentPath(entry.path) || undefined
                        : entry.ignored
                          ? ignoredLabel
                          : undefined
                    }
                    detailLines={query ? 2 : 1}
                    metadata={query && entry.ignored ? ignoredLabel : undefined}
                    accessibilityLabel={[entry.name, query ? entry.path : undefined,
                      entry.ignored ? ignoredLabel : undefined].filter(Boolean).join(". ")}
                    onPress={() => (entry.isDir ? navigate(entry.path) : openFile(entry.path))}
                  />
                </View>
                {root ? (
                  <IconButton
                    label={copy("{p0} seçenekleri", "{p0} options", { p0: entry.name })}
                    onPress={() => {
                      fileAction.reset();
                      dispatch({ type: "view", view: { kind: "actions", entry } });
                    }}
                  >
                    <MoreHorizontal size={iconSize.action} color={colors.muted} />
                  </IconButton>
                ) : null}
              </Row>
            </GroupedListRow>
          );
        })())}
      />
      </View>
      {creating ? (
        <CreateFileSheet
          path={path}
          mutation={create}
          onClose={browse}
          onCreate={(name, isDir) => {
            void create
              .mutateAsync({ projectId, cwd, parent: path, name, isDir })
              .then(() => {
                haptic.success();
                setCreatedName(name);
                dispatch({ type: "completed", view: state.view });
              })
              .catch(() => {});
          }}
        />
      ) : null}
      {actions && root ? (
        <FileActions
          key={actions.path}
          root={root}
          projectId={projectId}
          entry={actions}
          action={fileAction}
          onClose={browse}
          onCompleted={(summary) => {
            setActionSummary(summary);
            dispatch({ type: "completed", view: state.view });
          }}
        />
      ) : null}
    </>
  );
}

function CreateFileSheet({
  path,
  mutation,
  onClose,
  onCreate,
}: {
  path: string;
  mutation: ReturnType<typeof useHostMutation<string>>;
  onClose: () => void;
  onCreate: (name: string, isDir: boolean) => void;
}) {
  useMobileTheme();
  const copy = useCopy();
  const form = useFormDraft<CreateFileDraft>({ name: "", isDir: false });
  return (
    <Sheet
      visible
      size="form"
      title={copy("Yeni dosya / klasör", "New file / folder")}
      dirty={form.dirty}
      dismissible={!mutation.isPending}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      footer={
        <>
          <MutationState mutation={mutation} />
          <Button
            tone="primary"
            fullWidth
            reserveTouchTarget
            label={copy("Oluştur", "Create")}
            disabled={!form.values.name.trim()}
            busy={mutation.isPending}
            onPress={() => onCreate(form.values.name.trim(), form.values.isDir)}
          />
        </>
      }
    >
      <Body mono muted>
        {path || copy("Kök", "Root")}
      </Body>
      <IdentifierField
        label={copy("Ad", "Name")}
        value={form.values.name}
        editable={!mutation.isPending}
        onChangeText={(value) => form.setField("name", value)}
      />
      <SegmentedControl
        label={copy("Tür", "Type")}
        value={form.values.isDir ? "folder" : "file"}
        disabled={mutation.isPending}
        options={[
          { value: "file", label: copy("Dosya", "File") },
          { value: "folder", label: copy("Klasör", "Folder") },
        ]}
        onChange={(value) => form.setField("isDir", value === "folder")}
      />
    </Sheet>
  );
}

/** Rows of the previous folder stay in place, dimmed and inert, until the next one loads. */
function dimWhile(dimmed: boolean, row: ReactNode) {
  return dimmed ? <View style={{ opacity: 0.5 }} pointerEvents="none">{row}</View> : row;
}
