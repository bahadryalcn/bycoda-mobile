import { useMobileTheme } from "@/ui/theme";
import type { ProjectFilesProps, FileContentSearch, CreateFileDraft } from "./files-panel-types";
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { ScrollView, Text, View } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import Folder from "lucide-react-native/icons/folder";
import File from "lucide-react-native/icons/file";
import FileText from "lucide-react-native/icons/file-text";
import Plus from "lucide-react-native/icons/plus";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Home from "lucide-react-native/icons/house";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import { ScrollFade } from "panelui-native/components/scroll-fade";
import { useFormDraft } from "@/state/form-draft";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
  ActionMenu,
  Body,
  Button,
  SegmentedControl,
  IdentifierField,
  IconButton,
  MutationState,
  NavigationRow,
  PressableCard,
  QueryState,
  Row,
  ScreenList,
  SearchField,
  Sheet,
  StateView,
} from "@/ui/primitives";
import { queryOwnsRegion } from "./query-region";
import { space } from "@/ui/tokens";
import { SearchToolbar } from "@/ui/search-field";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import { IconTile } from "@/ui/icon-tile";
import type { FileEntry } from "./wire";
import { FileReview } from "./file-review";
import { FileActions } from "./file-actions";
import { filesReducer } from "./workspace-state";
import { defaultFileListOptions, fileParentPath, visibleFileEntries } from "./file-list-model";
import { GroupedListRow, rowInset } from "./shared";

type FileRow =
  | { key: string; entry: FileEntry }
  | { key: string; match: FileContentSearch["matches"][number] };

function Crumb({ label, home, current, onPress }: { label: string; home?: boolean; current: boolean; onPress: () => void }) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <PressableCard label={label} onPress={onPress} hitSlop={{ top: 8, bottom: 8 }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: 0, paddingHorizontal: space.sm, marginHorizontal: 0, minHeight: 32 }}>
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
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const list = useHostQuery<FileEntry[]>(
    ["files", projectId, cwd, path, query],
    query ? "files.search" : "files.list",
    { projectId, cwd, ...(query ? { query } : { path }) },
    { enabled: !searchContent, keepPrevious: true },
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
  const rows: FileRow[] = searchContent
    ? (content.data?.matches ?? []).map((match, index) => ({
        key: match.relative + ":" + match.line + ":" + index,
        match,
      }))
    : entries.map((entry) => ({ key: entry.path, entry }));
  const focused = useIsFocused();
  useBackHandler(focused && state.view.kind === "browse" && (!!path || !!search), () => {
    if (search) dispatch({ type: "search", value: "" });
    else navigate(fileParentPath(path));
  });
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
      />
    ) : null;
  const crumbs = path.split("/").filter(Boolean);
  const activeQuery = searchContent ? content : list;
  const activeOptions =
    searchContent ||
    !options.showHidden ||
    !options.showIgnored ||
    options.order !== defaultFileListOptions.order;
  const visibilityFiltered = !options.showHidden || !options.showIgnored;
  const awaitingContentSearch = searchContent && !query;
  const emptyFiltered = !searchContent && visibilityFiltered;
  const regionOwned = awaitingContentSearch || queryOwnsRegion(activeQuery, !rows.length);
  const clearSearch = () => { setQuery(""); dispatch({ type: "search", value: "" }); };
  const regionState = awaitingContentSearch ? (
    <StateView
      illustration="search-empty"
      title={copy("Dosya içeriğinde ara", "Search file contents")}
      description={copy("Eşleşmeleri görmek için bir arama yaz.", "Enter a search to see matching lines.")}
    />
  ) : (
    <QueryState
      query={activeQuery}
      empty={
        !rows.length
          ? emptyFiltered
            ? copy("Filtrelere uyan dosya yok.", "No files match the filters.")
            : query
              ? copy("Aramana uyan dosya yok.", "No files match your search.")
              : copy("Bu klasörde dosya yok.", "No files in this folder.")
          : undefined
      }
      emptyIllustration={query || emptyFiltered ? "search-empty" : "inbox-empty"}
      emptyAction={query ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
        : emptyFiltered ? { label: copy("Sıfırla", "Reset"), onPress: () => setOptions(defaultFileListOptions) }
        : undefined}
    />
  );
  return (
    <>
      {review}
      <View style={{ flex: 1, display: selected ? "none" : "flex" }}>
      <ScreenList<FileRow>
        grouped
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ gap: 0 }}
        ListEmptyComponent={regionOwned ? regionState : undefined}
        query={searchContent && !query ? undefined : activeQuery}
        header={
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            <Row style={{ flexWrap: "nowrap" }}>
              {path ? (
                <IconButton
                  label={copy("Üst klasör", "Parent folder")}
                  onPress={() => navigate(fileParentPath(path))}
                >
                  <ArrowUp size={19} color={colors.muted} />
                </IconButton>
              ) : null}
              <ScrollFade edges="both" size={24} color={colors.background} style={uiStyles.grow}>
              <ScrollView
                horizontal
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
              <IconButton
                label={copy("Yeni dosya / klasör", "New file / folder")}
                tone="default"
                disabled={create.isPending}
                onPress={() => {
                  create.reset();
                  dispatch({ type: "view", view: { kind: "create" } });
                }}
              >
                <Plus size={20} strokeWidth={2.4} color={colors.accent} />
              </IconButton>
            </Row>
            <SearchToolbar
              search={
                <SearchField
                  label={
                    searchContent
                      ? copy("Dosya içeriğinde ara", "Search file contents")
                      : copy("Dosya ara", "Search files")
                  }
                  value={search}
                  maxLength={200}
                  onChangeText={(value) => {
                    if (!value.trim()) setQuery("");
                    dispatch({ type: "search", value });
                  }}
                  placeholder={
                    searchContent
                      ? copy("Dosya içeriğinde ara", "Search file contents")
                      : copy("Ad veya dosya yolu", "Name or file path")
                  }
                />
              }
              actions={
                <ActionMenu
                  label={copy("Dosya seçenekleri", "File options")}
                  active={activeOptions}
                  trigger={
                    <SlidersHorizontal
                      size={21}
                      strokeWidth={2}
                      color={activeOptions ? colors.accent : colors.muted}
                    />
                  }
                  actions={[
                    {
                      key: "refresh",
                      label: copy("Yenile", "Refresh"),
                      disabled: activeQuery.isFetching || (searchContent && !query),
                      onPress: () => {
                        void activeQuery.refetch();
                      },
                    },
                    {
                      key: "hidden",
                      label: copy("Gizli dosyaları göster", "Show hidden files"),
                      selected: options.showHidden,
                      disabled: searchContent,
                      onPress: () =>
                        setOptions((current) => ({
                          ...current,
                          showHidden: !current.showHidden,
                        })),
                    },
                    {
                      key: "ignored",
                      label: copy(
                        "Git tarafından yok sayılanları göster",
                        "Show Git-ignored files",
                      ),
                      selected: options.showIgnored,
                      disabled: searchContent,
                      onPress: () =>
                        setOptions((current) => ({
                          ...current,
                          showIgnored: !current.showIgnored,
                        })),
                    },
                    {
                      key: "ascending",
                      label: copy("Ada göre A → Z", "Name A → Z"),
                      selected: options.order === "ascending",
                      disabled: searchContent,
                      onPress: () =>
                        setOptions((current) => ({ ...current, order: "ascending" })),
                    },
                    {
                      key: "descending",
                      label: copy("Ada göre Z → A", "Name Z → A"),
                      selected: options.order === "descending",
                      disabled: searchContent,
                      onPress: () =>
                        setOptions((current) => ({ ...current, order: "descending" })),
                    },
                    {
                      key: "reset",
                      label: copy("Sıfırla", "Reset"),
                      disabled: !activeOptions,
                      onPress: () => {
                        setOptions(defaultFileListOptions);
                        dispatch({ type: "search-mode", mode: "names" });
                      },
                    },
                  ]}
                />
              }
            />
            <SegmentedControl hideLabel label={copy("Arama türü", "Search type")} value={state.searchMode}
              options={[
                { value: "names", label: copy("Ad", "Name") },
                { value: "content", label: copy("İçerik", "Content") },
              ]}
              onChange={(mode) => dispatch({ type: "search-mode", mode })} />
            {!creating ? (
              <MutationState
                mutation={create}
                success={copy("Dosya veya klasör oluşturuldu.", "File or folder created.")}
              />
            ) : null}
            {!actions ? (
              <MutationState
                mutation={fileAction}
                success={copy("Dosya işlemi tamamlandı.", "File action completed.")}
              />
            ) : null}
          </View>
        }
        footer={
          searchContent && content.data?.truncated ? (
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
              <GroupedListRow first={first} last={last} inset={rowInset}>
                <NavigationRow
                  variant="plain"
                  label={name + ":" + match.line}
                  detail={match.preview}
                  detailLines={2}
                  metadata={fileParentPath(match.relative)}
                  metadataLines={0}
                  accessibilityLabel={`${match.relative}:${match.line}. ${match.preview}`}
                  icon={
                    <IconTile>
                      <FileText size={18} strokeWidth={2} color={colors.muted} />
                    </IconTile>
                  }
                  onPress={() => openFile(match.relative, match.line)}
                />
              </GroupedListRow>
            );
          }
          const entry = item.entry;
          return (
            <GroupedListRow first={first} last={last} inset={rowInset}>
              <Row style={{ flexWrap: "nowrap", paddingEnd: space.xs }}>
                <View style={uiStyles.grow}>
                  <NavigationRow
                    variant="plain"
                    label={entry.name}
                    intent={root ? "select" : "navigate"}
                    icon={
                      entry.isDir ? (
                        <IconTile>
                          <Folder size={18} strokeWidth={2} color={colors.muted} />
                        </IconTile>
                      ) : (
                        <IconTile>
                          <File size={18} strokeWidth={2} color={colors.muted} />
                        </IconTile>
                      )
                    }
                    detail={
                      query
                        ? fileParentPath(entry.path) || undefined
                        : entry.ignored
                          ? copy("Git tarafından izlenmiyor", "Ignored by Git")
                          : undefined
                    }
                    detailLines={query ? 2 : 1}
                    metadata={query && entry.ignored ? copy("Git tarafından izlenmiyor", "Ignored by Git") : undefined}
                    accessibilityLabel={[entry.name, query ? entry.path : undefined,
                      entry.ignored ? copy("Git tarafından izlenmiyor", "Ignored by Git") : undefined].filter(Boolean).join(". ")}
                    onPress={() => (entry.isDir ? navigate(entry.path) : openFile(entry.path))}
                  />
                </View>
                {root ? (
                  <IconButton
                    label={entry.name + " " + copy("işlemleri", "actions")}
                    onPress={() => {
                      fileAction.reset();
                      dispatch({ type: "view", view: { kind: "actions", entry } });
                    }}
                  >
                    <MoreHorizontal size={18} color={colors.muted} />
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
          onCompleted={() => dispatch({ type: "completed", view: state.view })}
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
