import { useMobileTheme } from "@/ui/theme";
import type { ProjectFilesProps, FileContentSearch, CreateFileDraft } from "./files-panel-types";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useFocusEffect } from "expo-router";
import { BackHandler, ScrollView, View } from "react-native";
import Folder from "lucide-react-native/icons/folder";
import File from "lucide-react-native/icons/file";
import FileText from "lucide-react-native/icons/file-text";
import Plus from "lucide-react-native/icons/plus";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import { useFormDraft } from "@/state/form-draft";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
  ActionMenu,
  Body,
  Button,
  ChoiceChip,
  Empty,
  IdentifierField,
  IconButton,
  MutationState,
  NavigationRow,
  QueryState,
  Row,
  ScreenList,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import { IconTile } from "@/ui/icon-tile";
import type { FileEntry } from "./wire";
import { FileEditor } from "./file-editor";
import { FileActions } from "./file-actions";
import { filesReducer } from "./workspace-state";
import { defaultFileListOptions, fileParentPath, visibleFileEntries } from "./file-list-model";
import { GroupedListRow, rowInset } from "./shared";

type FileRow =
  | { key: string; entry: FileEntry }
  | { key: string; match: FileContentSearch["matches"][number] };

export function ProjectFiles({
  projectId,
  cwd,
  root,
  initialPath,
  onClearInitialPath,
  onDraftGuard,
}: ProjectFilesProps) {
  useMobileTheme();
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
    { enabled: !searchContent },
  );
  const content = useHostQuery<FileContentSearch>(
    ["file-content", projectId, cwd, query],
    "files.searchContent",
    { projectId, cwd, query },
    { enabled: searchContent && !!query },
  );
  const create = useHostMutation<string>("files.create", ["files", projectId]);
  const fileAction = useHostMutation<unknown>("workspace.run", ["files", projectId]);
  const browse = () => dispatch({ type: "view", view: { kind: "browse" } });
  const openFile = (file: string) => dispatch({ type: "view", view: { kind: "edit", path: file } });
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
  useFocusEffect(
    useCallback(() => {
      if (state.view.kind !== "browse" || (!path && !search)) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (search) dispatch({ type: "search", value: "" });
        else navigate(fileParentPath(path));
        return true;
      });
      return () => subscription.remove();
    }, [state.view.kind, path, search, navigate]),
  );
  if (selected)
    return (
      <FileEditor
        key={selected}
        projectId={projectId}
        cwd={cwd}
        root={root}
        path={selected}
        onBack={() => {
          browse();
          onClearInitialPath?.();
        }}
        onDraftGuard={onDraftGuard}
      />
    );
  const crumbs = path.split("/").filter(Boolean);
  const activeQuery = searchContent ? content : list;
  const activeOptions =
    searchContent ||
    !options.showHidden ||
    !options.showIgnored ||
    options.order !== defaultFileListOptions.order;
  const visibilityFiltered = !options.showHidden || !options.showIgnored;
  return (
    <>
      <ScreenList<FileRow>
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ gap: 0 }}
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={uiStyles.grow}
                contentContainerStyle={{ alignItems: "center", gap: space.xs }}
              >
                <Button
                  tone="quiet"
                  density="compact"
                  label={copy("Kök", "Root")}
                  onPress={() => navigate("")}
                />
                {crumbs.map((part, index) => (
                  <Row key={index + ":" + part} style={{ gap: space.xs }}>
                    <Body muted>/</Body>
                    <Button
                      tone="quiet"
                      density="compact"
                      label={part}
                      onPress={() => navigate(crumbs.slice(0, index + 1).join("/"))}
                    />
                  </Row>
                ))}
              </ScrollView>
              <IconButton
                label={copy("Yeni dosya / klasör", "New file / folder")}
                tone="primary"
                disabled={create.isPending}
                onPress={() => {
                  create.reset();
                  dispatch({ type: "view", view: { kind: "create" } });
                }}
              >
                <Plus size={20} strokeWidth={2.4} color={colors.primaryText} />
              </IconButton>
            </Row>
            <Row style={{ flexWrap: "nowrap" }}>
              <View style={uiStyles.grow}>
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
              </View>
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
                    key: "search-names",
                    label: copy("Dosya adlarında ara", "Search file names"),
                    selected: !searchContent,
                    onPress: () => dispatch({ type: "search-mode", mode: "names" }),
                  },
                  {
                    key: "search-content",
                    label: copy("Dosya içeriğinde ara", "Search file contents"),
                    selected: searchContent,
                    onPress: () => dispatch({ type: "search-mode", mode: "content" }),
                  },
                  {
                    key: "hidden",
                    label: copy("Gizli dosyaları göster", "Show hidden files"),
                    selected: options.showHidden,
                    disabled: searchContent,
                    onPress: () =>
                      setOptions((current) => ({ ...current, showHidden: !current.showHidden })),
                  },
                  {
                    key: "ignored",
                    label: copy("Git tarafından yok sayılanları göster", "Show Git-ignored files"),
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
                    onPress: () => setOptions((current) => ({ ...current, order: "ascending" })),
                  },
                  {
                    key: "descending",
                    label: copy("Ada göre Z → A", "Name Z → A"),
                    selected: options.order === "descending",
                    disabled: searchContent,
                    onPress: () => setOptions((current) => ({ ...current, order: "descending" })),
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
            </Row>
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
            {searchContent && !query ? (
              <Empty
                title={copy("Dosya içeriğinde ara", "Search file contents")}
                detail={copy(
                  "Eşleşmeleri görmek için bir arama yaz.",
                  "Enter a search to see matching lines.",
                )}
              />
            ) : (
              <QueryState
                query={activeQuery}
                empty={
                  !rows.length
                    ? !searchContent && visibilityFiltered
                      ? copy("Filtrelere uyan dosya yok.", "No files match the filters.")
                      : query
                        ? copy("Aramana uyan dosya yok.", "No files match your search.")
                        : copy("Bu klasörde dosya yok.", "No files in this folder.")
                    : undefined
                }
              />
            )}
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
        renderItem={({ item, index }) => {
          const first = index === 0;
          const last = index === rows.length - 1;
          if ("match" in item)
            return (
              <GroupedListRow first={first} last={last} inset={rowInset}>
                <NavigationRow
                  variant="plain"
                  label={item.match.relative + ":" + item.match.line}
                  detail={item.match.preview}
                  icon={
                    <IconTile>
                      <FileText size={18} strokeWidth={2} color={colors.muted} />
                    </IconTile>
                  }
                  onPress={() => openFile(item.match.relative)}
                />
              </GroupedListRow>
            );
          const entry = item.entry;
          return (
            <GroupedListRow first={first} last={last} inset={rowInset}>
              <Row style={{ flexWrap: "nowrap", paddingEnd: space.xs }}>
                <View style={uiStyles.grow}>
                  <NavigationRow
                    variant="plain"
                    label={entry.name}
                    icon={
                      entry.isDir ? (
                        <IconTile color={colors.accent}>
                          <Folder size={18} strokeWidth={2} color={colors.accent} />
                        </IconTile>
                      ) : (
                        <IconTile>
                          <File size={18} strokeWidth={2} color={colors.muted} />
                        </IconTile>
                      )
                    }
                    detail={
                      query
                        ? entry.path
                        : entry.ignored
                          ? copy("Git tarafından izlenmiyor", "Ignored by Git")
                          : undefined
                    }
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
                    <MoreHorizontal size={21} color={colors.muted} />
                  </IconButton>
                ) : null}
              </Row>
            </GroupedListRow>
          );
        }}
      />
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
      <Row>
        <ChoiceChip
          selected={!form.values.isDir}
          disabled={mutation.isPending}
          label={copy("Dosya", "File")}
          onPress={() => form.setField("isDir", false)}
        />
        <ChoiceChip
          selected={form.values.isDir}
          disabled={mutation.isPending}
          label={copy("Klasör", "Folder")}
          onPress={() => form.setField("isDir", true)}
        />
      </Row>
    </Sheet>
  );
}
