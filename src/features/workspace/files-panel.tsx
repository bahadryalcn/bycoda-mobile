import type { ProjectFilesProps, FileContentSearch, CreateFileDraft } from "./files-panel-types";
import { useCallback, useEffect, useReducer, useState } from "react";
import { useFocusEffect } from "expo-router";
import { BackHandler, ScrollView, View } from "react-native";
import Folder from "lucide-react-native/icons/folder";
import File from "lucide-react-native/icons/file";
import Plus from "lucide-react-native/icons/plus";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useFormDraft } from "@/state/form-draft";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
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
  Sheet,
} from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import type { FileEntry } from "./wire";
import { FileEditor } from "./file-editor";
import { FileActions } from "./file-actions";
import { filesReducer } from "./workspace-state";

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
  const entries = (list.data ?? []).filter((entry) => entry.name !== ".git");
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
        else dispatch({ type: "navigate", path: path.split("/").slice(0, -1).join("/") });
        return true;
      });
      return () => subscription.remove();
    }, [state.view.kind, path, search]),
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
  return (
    <>
      <ScreenList<FileRow>
        data={rows}
        keyExtractor={(row) => row.key}
        query={searchContent && !query ? undefined : activeQuery}
        header={
          <View style={{ gap: space.sm }}>
            <Row style={{ flexWrap: "nowrap" }}>
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
                  onPress={() => dispatch({ type: "navigate", path: "" })}
                />
                {crumbs.map((part, index) => (
                  <Row key={index + ":" + part} style={{ gap: space.xs }}>
                    <Body muted>/</Body>
                    <Button
                      tone="quiet"
                      density="compact"
                      label={part}
                      onPress={() =>
                        dispatch({ type: "navigate", path: crumbs.slice(0, index + 1).join("/") })
                      }
                    />
                  </Row>
                ))}
              </ScrollView>
              <IconButton
                label={copy("Yenile", "Refresh")}
                disabled={activeQuery.isFetching || (searchContent && !query)}
                onPress={() => {
                  void activeQuery.refetch();
                }}
              >
                <RefreshCw size={18} color={colors.muted} />
              </IconButton>
              <IconButton
                label={copy("Yeni dosya / klasör", "New file / folder")}
                disabled={create.isPending}
                onPress={() => {
                  create.reset();
                  dispatch({ type: "view", view: { kind: "create" } });
                }}
              >
                <Plus size={20} color={colors.accent} />
              </IconButton>
            </Row>
            <IdentifierField
              label={copy("Dosya ara", "Search files")}
              value={search}
              onChangeText={(value) => dispatch({ type: "search", value })}
              placeholder={copy("Ad veya dosya yolu", "Name or file path")}
            />
            <Row>
              <ChoiceChip
                selected={!searchContent}
                label={copy("Dosya adları", "File names")}
                onPress={() => dispatch({ type: "search-mode", mode: "names" })}
              />
              <ChoiceChip
                selected={searchContent}
                label={copy("İçerik", "Content")}
                onPress={() => dispatch({ type: "search-mode", mode: "content" })}
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
                    ? query
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
        renderItem={({ item }) =>
          "match" in item ? (
            <NavigationRow
              label={item.match.relative + ":" + item.match.line}
              detail={item.match.preview}
              onPress={() => openFile(item.match.relative)}
            />
          ) : (
            <Row style={{ flexWrap: "nowrap" }}>
              <View style={uiStyles.grow}>
                <NavigationRow
                  label={item.entry.name}
                  icon={
                    item.entry.isDir ? (
                      <Folder size={19} color={colors.muted} />
                    ) : (
                      <File size={19} color={colors.muted} />
                    )
                  }
                  detail={
                    query
                      ? item.entry.path
                      : item.entry.ignored
                        ? copy("Git tarafından izlenmiyor", "Ignored by Git")
                        : undefined
                  }
                  onPress={() =>
                    item.entry.isDir
                      ? dispatch({ type: "navigate", path: item.entry.path })
                      : openFile(item.entry.path)
                  }
                />
              </View>
              {root ? (
                <IconButton
                  label={item.entry.name + " " + copy("işlemleri", "actions")}
                  onPress={() => {
                    fileAction.reset();
                    dispatch({ type: "view", view: { kind: "actions", entry: item.entry } });
                  }}
                >
                  <MoreHorizontal size={21} color={colors.muted} />
                </IconButton>
              ) : null}
            </Row>
          )
        }
      />
      {creating ? (
        <CreateFileSheet
          path={path}
          mutation={create}
          onClose={browse}
          onCreate={(name, isDir) => {
            void create
              .mutateAsync({ projectId, cwd, parent: path, name, isDir })
              .then(() => dispatch({ type: "completed", view: state.view }))
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
