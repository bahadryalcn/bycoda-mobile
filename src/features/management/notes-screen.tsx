import { ManagementToolbar } from "./shared/collection-toolbar";
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
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import ArrowDownUp from "lucide-react-native/icons/arrow-down-up";
import History from "lucide-react-native/icons/history";
import Plus from "lucide-react-native/icons/plus";
import {
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
import { Scope } from "./shared/scope";
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
  const [viewDraft, setViewDraft] = useState<{
    grouping: NoteGrouping;
    ordering: NoteOrdering;
  } | null>(null);
  const machine = useActiveMachine();
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
  // Whether this computer has a saved local draft, re-read whenever the editor closes or the draft changes.
  const [savedDraft, setSavedDraft] = useState<LocalNoteDraft | null>(null);
  const draftClosed = flow.kind === "closed";
  useEffect(() => {
    if (!localDraft || !draftClosed) {
      setSavedDraft(null);
      return;
    }
    let current = true;
    localDraft.recover().then(
      (draft) => {
        if (current) setSavedDraft(draft);
      },
      () => {
        if (current) setSavedDraft(null);
      },
    );
    return () => {
      current = false;
    };
  }, [localDraft, draftClosed]);
  const editorProps = { save, remove, draftOwner: localDraft, onClose: close };
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
  const listState = (
    <QueryState
      size="region"
      query={query}
      empty={visible?.length === 0}
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
        query={query}
        ListEmptyComponent={!editorOpen ? listState : undefined}
        data={visible}
        keyExtractor={(row) => row.key}
        actions={
          !editorOpen ? (
            <>
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
                <FilterSheet
                  visible={viewDraft !== null}
                  title={copy("Gruplama ve sıralama", "Grouping and sorting")}
                  onClose={() => setViewDraft(null)}
                  onReset={() => setViewDraft({ grouping: "none", ordering: "updated" })}
                  onApply={() => {
                    if (viewDraft) {
                      setGrouping(viewDraft.grouping);
                      setOrdering(viewDraft.ordering);
                    }
                    setViewDraft(null);
                  }}
                >
                  <SegmentedControl
                    label={copy("Gruplama", "Grouping")}
                    value={(viewDraft ?? { grouping }).grouping}
                    options={[
                      { value: "none", label: copy("Yok", "None") },
                      { value: "project", label: copy("Proje", "Project") },
                      { value: "tag", label: copy("Etiket", "Tag") },
                    ]}
                    onChange={(next) =>
                      setViewDraft({
                        grouping: next,
                        ordering: (viewDraft ?? { ordering }).ordering,
                      })
                    }
                  />
                  <SegmentedControl
                    label={copy("Sıralama", "Order")}
                    value={(viewDraft ?? { ordering }).ordering}
                    options={[
                      { value: "updated", label: copy("Düzenleme", "Edited") },
                      { value: "created", label: copy("Oluşturma", "Created") },
                      { value: "title", label: copy("Başlık", "Title") },
                    ]}
                    onChange={(next) =>
                      setViewDraft({
                        grouping: (viewDraft ?? { grouping }).grouping,
                        ordering: next,
                      })
                    }
                  />
                </FilterSheet>
                <ManagementToolbar
                  project={<Scope allowAll projectId={projectId} onChange={setProjectId} />}
                  search={
                    <SearchField
                      placeholder={copy("Ara", "Search")}
                      ref={searchInput}
                      label={copy(
                        "Başlık, metin veya etikette ara",
                        "Search note titles, text and tags",
                      )}
                      value={search}
                      onChangeText={setSearch}
                    />
                  }
                  actions={
                    <FilterButton
                      label={copy("Gruplama ve sıralama", "Grouping and sorting")}
                      icon={ArrowDownUp}
                      count={(grouping !== "none" ? 1 : 0) + (ordering !== "updated" ? 1 : 0)}
                      onPress={() => setViewDraft({ grouping, ordering })}
                    />
                  }
                />
                <AppliedFilters
                  filters={[
                    grouping !== "none" &&
                      (grouping === "project"
                        ? copy("Projeye göre grupla", "Group by project")
                        : copy("Etikete göre grupla", "Group by tag")),
                    ordering !== "updated" &&
                      (ordering === "created"
                        ? copy("Son oluşturulanlar", "Recently created")
                        : copy("Başlığa göre sırala", "Sort by title")),
                  ]}
                />
              </>
            ) : null}
            {/* A saved local draft is offered where the list starts instead of behind a one-item menu. */}
            {!editorOpen && savedDraft ? (
              <NavigationGroup>
                <NavigationRow
                  label={copy("Kaydedilmemiş taslak", "Unsaved draft")}
                  detail={savedDraft.title.trim() || undefined}
                  icon={<RowIcon glyph={History} />}
                  trailing={<Body style={{ color: colors.accent }}>{copy("Aç", "Open")}</Body>}
                  busy={recovery.isPending}
                  disabled={busy}
                  onPress={() => {
                    void recovery.run(async () => {
                      const draft = localDraft ? await localDraft.recover() : null;
                      if (draft) dispatch({ type: "recover", initial: draft, expected: flow });
                      return draft;
                    });
                  }}
                />
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
                <MutationState
                  mutation={save}
                  success={copy("Not bilgisayara kaydedildi.", "Note saved to computer.")}
                />
                <MutationState mutation={remove} success={copy("Not silindi.", "Note deleted.")} />
              </>
            ) : null}
            <Sheet
              visible={editorOpen}
              size="full"
              title={
                flow.kind === "draft" && flow.initial.expectedUpdatedAt === 0
                  ? copy("Yeni not", "New note")
                  : copy("Notu düzenle", "Edit note")
              }
              onClose={close}
            >
              {flow.kind === "draft" && (
                <NoteEditor key={flow.initial.id} initial={flow.initial} {...editorProps} />
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
                      item.group)
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
