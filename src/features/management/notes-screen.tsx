import { useManagementToolbar } from "./shared/collection-toolbar";
import { useLocalDraftEpoch } from "@/state/use-local-draft-epoch";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { useLocale } from "@/i18n";
import { ManagementList } from "./shared/management-list";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import { Sheet } from "@/ui/primitives";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useProjectList } from "../workspace/use-project-directory";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import History from "lucide-react-native/icons/history";
import Plus from "lucide-react-native/icons/plus";
import { confirmAction } from "@/ui/confirm";
import {
  ActionMenu,
  Body,
  NavigationGroup,
  NavigationRow,
  SectionHeader,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  RowIcon,
  SearchField,
  SegmentedControl,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";

import { useActiveMachine } from "@/state/machines";
import { identifier } from "./shared/format";
import { ProjectScopePill } from "../workspace/project-scope-pill";
import { useLocalProjectScope } from "./shared/local-project-scope";
import { createNoteDraftStore, noteDraftKey, type LocalNoteDraft } from "./note-drafts";
import { initialNoteFlow, noteFlowReducer } from "./note-flow";

import type { Note } from "@/domain/types";
export type { Note } from "@/domain/types";
import type { NoteList } from "./notes/types";
import { ExistingNote, NoteEditor } from "./notes/note-editor";
import { NoteLibraryRow } from "./notes/note-library-row";
import {
  noteDirectory,
  type NoteDirectoryRow,
  type NoteGrouping,
  type NoteOrdering,
} from "./notes/note-directory";

const draftStore = createNoteDraftStore(AsyncStorage);

export function NotesScreen() {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => {
    setSearch("");
    searchInput.current?.focus();
  };
  const [grouping, setGrouping] = useState<NoteGrouping>("none");
  const [ordering, setOrdering] = useState<NoteOrdering>("updated");
  const machine = useActiveMachine();
  // Grouping and order are a per-computer view preference that outlives this page.
  const viewKey = machine ? `bycoda.mobile.notes-view.${machine.id}` : null;
  const viewLoaded = useRef<string | null>(null);
  useEffect(() => {
    if (!viewKey) return;
    let current = true;
    AsyncStorage.getItem(viewKey).then(
      (raw) => {
        if (!current) return;
        viewLoaded.current = viewKey;
        try {
          const saved = raw ? (JSON.parse(raw) as { grouping?: string; ordering?: string }) : {};
          setGrouping(["none", "project", "tag"].includes(saved.grouping ?? "") ? (saved.grouping as NoteGrouping) : "none");
          setOrdering(["updated", "created", "title"].includes(saved.ordering ?? "") ? (saved.ordering as NoteOrdering) : "updated");
        } catch {
          // An unreadable preference falls back to the default view.
        }
      },
      () => {
        if (current) viewLoaded.current = viewKey;
      },
    );
    return () => {
      current = false;
    };
  }, [viewKey]);
  const changeView = (next: { grouping?: NoteGrouping; ordering?: NoteOrdering }) => {
    const value = { grouping: next.grouping ?? grouping, ordering: next.ordering ?? ordering };
    setGrouping(value.grouping);
    setOrdering(value.ordering);
    if (viewKey && viewLoaded.current === viewKey)
      void AsyncStorage.setItem(viewKey, JSON.stringify(value)).catch(() => {});
  };
  const lastDraftMachine = useRef(machine?.id);
  if (machine?.id) lastDraftMachine.current = machine.id;
  const draftKey = lastDraftMachine.current
    ? noteDraftKey(lastDraftMachine.current)
    : "no-note-draft";
  const draftEpoch = useLocalDraftEpoch(draftKey);
  const localDraft = useMemo(
    () => (machine ? draftStore.bind(machine.id) : null),
    [machine?.id, draftEpoch],
  );
  const { projectId, setProjectId } = useLocalProjectScope();
  const projects = useProjectList();
  const query = useHostQuery<NoteList>(
    ["notes", projectId],
    "notes.list",
    projectId ? { projectId } : {},
    { interval: 8000 },
  );
  const save = useHostMutation<Note>("notes.upsert", ["notes"]);
  const remove = useHostMutation("notes.delete", ["notes"]);
  const recovery = useAsyncAction<LocalNoteDraft | null>();
  const [flow, dispatch] = useReducer(noteFlowReducer, initialNoteFlow);
  const sourceCwd = projects.data?.find((project) => project.id === projectId)?.cwd;
  const seenDraft = useRef({ key: draftKey, epoch: draftEpoch });
  useLayoutEffect(() => {
    const previous = seenDraft.current;
    seenDraft.current = { key: draftKey, epoch: draftEpoch };
    if (previous.key === draftKey && previous.epoch !== draftEpoch) {
      dispatch({ type: "close", expected: flow });
    }
  }, [draftKey, draftEpoch]);
  const close = () => dispatch({ type: "close", expected: flow });
  // This computer's saved local drafts (one per note), re-read whenever the editor closes or a draft changes.
  const [savedDrafts, setSavedDrafts] = useState<LocalNoteDraft[]>([]);
  const [draftsRevision, reloadDrafts] = useReducer((value: number) => value + 1, 0);
  const draftClosed = flow.kind === "closed";
  useEffect(() => {
    if (!localDraft || !draftClosed) {
      setSavedDrafts([]);
      return;
    }
    let current = true;
    localDraft.recoverAll().then(
      (drafts) => {
        if (current) setSavedDrafts(drafts);
      },
      () => {
        if (current) setSavedDrafts([]);
      },
    );
    return () => {
      current = false;
    };
  }, [localDraft, draftClosed, draftsRevision]);
  const discardDraft = (draft: LocalNoteDraft) =>
    confirmAction(
      copy("Taslağı sil", "Delete draft"),
      copy(
        "Bu telefondaki kaydedilmemiş değişiklikler silinecek. Bilgisayardaki not değişmez.",
        "The unsaved changes on this phone will be deleted. The note on the computer is unchanged.",
      ),
      copy("Sil", "Delete"),
      () => {
        if (!localDraft) return;
        void localDraft.discard(draft.id).then(reloadDrafts, reloadDrafts);
      },
      copy("Vazgeç", "Cancel"),
    );
  // The open note places its save status, view toggle and menu in the sheet header.
  const [editorHeader, setEditorHeader] = useState<ReactNode>();
  const projectLabel = (cwd?: string) =>
    cwd ? projects.data?.find((project) => project.cwd === cwd)?.name : undefined;
  const editorProps = {
    save,
    remove,
    draftOwner: localDraft,
    onClose: close,
    setHeader: setEditorHeader,
    projectLabel,
    onReopen: (id: string) => {
      save.reset();
      dispatch({ type: "close", expected: flow });
      dispatch({ type: "open", id });
    },
  };
  const editorOpen = flow.kind !== "closed";
  const busy = save.isPending || remove.isPending || recovery.isPending;
  const visible = useMemo(
    () => noteDirectory(query.data?.notes ?? [], search, grouping, ordering, locale),
    [query.data?.notes, search, grouping, ordering, locale],
  );
  const canCreate = !editorOpen && !busy && !(!!projectId && !sourceCwd);
  const offersFirstNote =
    canCreate && !search.trim() && getQueryPresentation(query, visible.length === 0) === "empty";
  const startNew = () => {
    recovery.reset();
    save.reset();
    remove.reset();
    dispatch({
      type: "draft",
      initial: {
        id: identifier(),
        title: "",
        body: "",
        tags: "",
        sourceCwd,
        expectedUpdatedAt: 0,
      },
    });
  };
  const toolbar = useManagementToolbar({
    search: <SearchField
                      placeholder={copy("Ara", "Search")}
                      ref={searchInput}
                      label={copy(
                        "Başlık, metin veya etikette ara",
                        "Search note titles, text and tags",
                      )}
                      value={search}
                      onChangeText={setSearch}
                    />,
    view: {
      label: copy("Görünüm", "View"),
      applied: (grouping !== "none" ? 1 : 0) + (ordering !== "updated" ? 1 : 0),
      onReset: () => changeView({ grouping: "none", ordering: "updated" }),
      filters: (
        <>
          <SectionHeader title={copy("Gruplama", "Grouping")} />
          <SegmentedControl
            hideLabel
            label={copy("Gruplama", "Grouping")}
            value={grouping}
            options={[
              { value: "none", label: copy("Yok", "None") },
              { value: "project", label: copy("Proje", "Project") },
              { value: "tag", label: copy("Etiket", "Tag") },
            ]}
            onChange={(next) => changeView({ grouping: next })}
          />
          <SectionHeader title={copy("Sıralama", "Order")} />
          <SegmentedControl
            hideLabel
            label={copy("Sıralama", "Order")}
            value={ordering}
            options={[
              { value: "updated", label: copy("Düzenleme", "Edited") },
              { value: "created", label: copy("Oluşturma", "Created") },
              { value: "title", label: copy("Başlık", "Title") },
            ]}
            onChange={(next) => changeView({ ordering: next })}
          />
        </>
      ),
    },
  });
  const listState = (
    <QueryState
      size="region"
      query={query}
      empty={visible?.length === 0}
      noResults={{
        searching: !!search.trim() && !!query.data?.notes.length,
        onClearSearch: clearSearch,
        // The computer returns only its latest notes; say what the search covered.
        title:
          query.data && query.data.total > query.data.notes.length
            ? copy("Son {p0} notta eşleşme yok", "No matches in the latest {p0} notes", {
                p0: query.data.notes.length,
              })
            : undefined,
      }}
      emptyTitle={
        search.trim() && query.data?.notes.length
          ? copy("Eşleşen sonuç yok", "No matching results")
          : copy("Henüz not yok", "No notes yet")
      }
      emptyDetail={
        search.trim() && query.data?.notes.length
          ? undefined
          : copy("Notları siz ve ajanlarınız okuyabilir.", "You and your agents can read notes.")
      }
      emptyAction={
        search.trim() && query.data?.notes.length
          ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
          : offersFirstNote
            ? { label: copy("Yeni not", "New note"), onPress: startNew }
            : undefined
      }
    />
  );
  return (
    <SwipeActionsGroup fill>
      <ManagementList<NoteDirectoryRow>
        title={copy("Notlar", "Notes")}
        scopeControl={<ProjectScopePill projectId={projectId} onChange={setProjectId} />}
        query={query}
        ListEmptyComponent={!editorOpen ? listState : undefined}
        data={visible}
        keyExtractor={(row) => row.key}
        actions={
          !editorOpen ? (
            <>
              {toolbar.actions}
              {!offersFirstNote ? (
                <IconButton
                  label={copy("Yeni not", "New note")}
                  disabled={!canCreate}
                  onPress={startNew}
                >
                  <Plus size={iconSize.action} strokeWidth={2} color={colors.accent} />
                </IconButton>
              ) : null}
            </>
          ) : undefined
        }
        header={
          <>
            {!editorOpen ? (
              <>
                {toolbar.sheet}
              </>
            ) : null}
            {/* Saved local drafts are offered where the list starts, one row per note. */}
            {!editorOpen && savedDrafts.length ? (
              <NavigationGroup>
                {savedDrafts.map((saved) => {
                  const open = () => {
                    void recovery.run(async () => {
                      const draft = localDraft ? await localDraft.recover(saved.id) : null;
                      if (draft) dispatch({ type: "recover", initial: draft, expected: flow });
                      return draft;
                    });
                  };
                  return (
                    <NavigationRow
                      key={saved.id}
                      label={copy("Kaydedilmemiş taslak", "Unsaved draft")}
                      detail={saved.title.trim() || saved.body.trim().split("\n")[0] || undefined}
                      icon={<RowIcon glyph={History} />}
                      trailing={
                        <ActionMenu
                          label={copy("Diğer işlemler", "More actions")}
                          subtitle={saved.title.trim() || undefined}
                          reserveTouchTarget
                          actions={[
                            { key: "open", label: copy("Aç", "Open"), disabled: busy, onPress: open },
                            {
                              key: "discard",
                              label: copy("Taslağı sil", "Delete draft"),
                              destructive: true,
                              disabled: busy,
                              onPress: () => discardDraft(saved),
                            },
                          ]}
                        />
                      }
                      busy={recovery.isPending}
                      disabled={busy}
                      onPress={open}
                    />
                  );
                })}
              </NavigationGroup>
            ) : null}
            <MutationState mutation={recovery} />
            {flow.kind === "closed" && recovery.isSuccess && recovery.data === null && (
              <Notice
                tone="info"
                message={copy(
                  "Bu bilgisayar için saklanan taslak yok.",
                  "There is no saved draft for this computer.",
                )}
              />
            )}
            {!editorOpen ? (
              <>
                {/* Notes save automatically; only a failed last save is reported after closing. */}
                <MutationState mutation={save} />
                <MutationState mutation={remove} success={copy("Not silindi.", "Note deleted.")} />
              </>
            ) : null}
            <Sheet
              visible={editorOpen}
              size="full"
              scroll={false}
              headerAction={editorHeader}
              title={
                flow.kind === "draft" && flow.initial.expectedUpdatedAt === 0
                  ? copy("Yeni not", "New note")
                  : copy("Not", "Note")
              }
              onClose={close}
            >
              {flow.kind === "draft" && (
                <NoteEditor key={flow.initial.id} initial={flow.initial} unsaved {...editorProps} />
              )}
              {flow.kind === "existing" && (
                <ExistingNote key={flow.id} id={flow.id} {...editorProps} />
              )}
            </Sheet>
            {!editorOpen ? (
              <>
                {visible?.length ? listState : null}
                {!!query.data && query.data.total > query.data.notes.length && (
                  <Body muted style={uiStyles.caption}>
                    {copy("Son {p0} not gösteriliyor", "Showing the latest {p0} notes", {
                      p0: query.data.notes.length,
                    })}
                  </Body>
                )}
              </>
            ) : null}
          </>
        }
        renderItem={({ item }) =>
          item.kind === "heading" ? (
            <SectionHeader
              count={item.count}
              title={
                item.group === null
                  ? item.grouping === "tag"
                    ? copy("Etiketsiz", "Untagged")
                    : copy("Projesiz notlar", "Notes without a project")
                  : item.grouping === "tag"
                    ? `#${item.group}`
                    : (projects.data?.find((project) => project.cwd === item.group)?.name ??
                      (item.group.split(/[\\/]/).filter(Boolean).at(-1) ||
                        copy("Bilinmeyen proje", "Unknown project")))
              }
            />
          ) : (
            <NoteLibraryRow
              note={item.note}
              projectName={
                !projectId && grouping !== "project"
                  ? projects.data?.find((project) => project.cwd === item.note.sourceCwd)?.name
                  : undefined
              }
              machineName={machine?.name}
              projectId={projectId}
              busy={editorOpen || busy}
              canDelete={
                !!machine &&
                query.isEnabled !== false &&
                query.fetchStatus !== "paused" &&
                !query.error
              }
              onOpen={() => {
                recovery.reset();
                save.reset();
                remove.reset();
                dispatch({ type: "open", id: item.note.id });
              }}
              onDelete={(id, expectedUpdatedAt) => remove.mutate({ id, expectedUpdatedAt })}
            />
          )
        }
      />
    </SwipeActionsGroup>
  );
}
