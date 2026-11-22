import { useLocalDraftEpoch } from "@/state/use-local-draft-epoch";
import { useMobileTheme } from "@/ui/theme";
import { useLocale } from "@/i18n";
import { ScreenList } from "@/ui/screen-list";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import { Sheet } from "@/ui/primitives";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useProjectList } from "../workspace/use-project-directory";
import { useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import History from "lucide-react-native/icons/history";
import Plus from "lucide-react-native/icons/plus";
import {
  ActionMenu,
  Body,
  SectionHeader,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  SearchField,
  SearchToolbar,
  SelectField,
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
import { noteDirectory, type NoteDirectoryRow, type NoteGrouping, type NoteOrdering } from "./notes/note-directory";

const draftStore = createNoteDraftStore(AsyncStorage);

export function NotesScreen() {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [grouping, setGrouping] = useState<NoteGrouping>("none");
  const [ordering, setOrdering] = useState<NoteOrdering>("updated");
  const [viewDraft, setViewDraft] = useState<{ grouping: NoteGrouping; ordering: NoteOrdering } | null>(null);
  const machine = useActiveMachine();
  const lastDraftMachine = useRef(machine?.id); if (machine?.id) lastDraftMachine.current = machine.id;
  const draftKey = lastDraftMachine.current ? noteDraftKey(lastDraftMachine.current) : "no-note-draft";
  const draftEpoch = useLocalDraftEpoch(draftKey);
  const localDraft = useMemo(() => machine ? draftStore.bind(machine.id) : null, [machine?.id, draftEpoch]);
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
    const previous = seenDraft.current; seenDraft.current = { key: draftKey, epoch: draftEpoch };
    if (previous.key === draftKey && previous.epoch !== draftEpoch) {
      dispatch({ type: "close", expected: flow });
    }
  }, [draftKey, draftEpoch]);
  const close = () => dispatch({ type: "close", expected: flow });
  const editorProps = { save, remove, draftOwner: localDraft, onClose: close };
  const editorOpen = flow.kind !== "closed";
  const busy = save.isPending || remove.isPending || recovery.isPending;
  const visible = useMemo(() => noteDirectory(query.data?.notes ?? [], search, grouping, ordering, locale), [query.data?.notes, search, grouping, ordering, locale]);
  const canCreate = !editorOpen && !busy && !(!!projectId && !sourceCwd);
  const offersFirstNote = canCreate && !search.trim() && getQueryPresentation(query, visible.length === 0) === "empty";
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
  return (
    <SwipeActionsGroup fill><ScreenList<NoteDirectoryRow> title={copy("Notlar", "Notes")} query={query} data={visible} keyExtractor={(row) => row.key}
      context={!editorOpen ? <Scope allowAll projectId={projectId} onChange={setProjectId} /> : undefined}
      actions={!editorOpen ? (
        <>
          {!offersFirstNote ? <IconButton
            label={copy("Yeni not", "New note")}
            disabled={!canCreate}
            onPress={startNew}
          >
            <Plus size={22} strokeWidth={2.2} color={colors.accent} />
          </IconButton> : null}
          <ActionMenu
            label={copy("Diğer işlemler", "More actions")}
            busy={recovery.isPending}
            actions={[{
              key: "recover-draft",
              label: copy("Kaydedilmemiş taslağı aç", "Recover unsaved draft"),
              icon: <History size={18} />,
              disabled: busy,
              onPress: () => {
                void recovery.run(async () => {
                  const draft = localDraft ? await localDraft.recover() : null;
                  if (draft) dispatch({ type: "recover", initial: draft, expected: flow });
                  return draft;
                });
              },
            }]}
          />
        </>
      ) : undefined}
      header={<>
      {!editorOpen ? (
        <>
          <FilterSheet
            visible={viewDraft !== null}
            onClose={() => setViewDraft(null)}
            onReset={() => setViewDraft({ grouping: "none", ordering: "updated" })}
            onApply={() => {
              if (viewDraft) { setGrouping(viewDraft.grouping); setOrdering(viewDraft.ordering); }
              setViewDraft(null);
            }}
          >
            <SelectField
              label={copy("Gruplama", "Grouping")}
              value={(viewDraft ?? { grouping }).grouping}
              options={[
                { value: "none", label: copy("Gruplama yok", "No grouping") },
                { value: "project", label: copy("Projeye göre", "By project") },
                { value: "tag", label: copy("Etikete göre", "By tag") },
              ]}
              onChange={(next) => setViewDraft({ grouping: next as NoteGrouping, ordering: (viewDraft ?? { ordering }).ordering })}
            />
            <SelectField
              label={copy("Sıralama", "Order")}
              value={(viewDraft ?? { ordering }).ordering}
              options={[
                { value: "updated", label: copy("Son düzenlenenler", "Recently edited") },
                { value: "created", label: copy("Son oluşturulanlar", "Recently created") },
                { value: "title", label: copy("Başlığa göre", "By title") },
              ]}
              onChange={(next) => setViewDraft({ grouping: (viewDraft ?? { grouping }).grouping, ordering: next as NoteOrdering })}
            />
          </FilterSheet>
          <SearchToolbar
            search={<SearchField
              ref={searchInput}
              label={copy("Başlık, metin veya etikette ara", "Search note titles, text and tags")}
              placeholder={copy("Notlarda ara", "Search notes")}
              value={search}
              onChangeText={setSearch}
            />}
            actions={<FilterButton count={(grouping !== "none" ? 1 : 0) + (ordering !== "updated" ? 1 : 0)} onPress={() => setViewDraft({ grouping, ordering })} />}
          />
          <AppliedFilters filters={[grouping !== "none" && (grouping === "project" ? copy("Projeye göre grupla", "Group by project") : copy("Etikete göre grupla", "Group by tag")),
            ordering !== "updated" && (ordering === "created" ? copy("Son oluşturulanlar", "Recently created") : copy("Başlığa göre sırala", "Sort by title"))]} />
        </>
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
      {!editorOpen ? <>
        <MutationState
          mutation={save}
          success={copy("Not bilgisayara kaydedildi.", "Note saved to computer.")}
        />
        <MutationState mutation={remove} success={copy("Not silindi.", "Note deleted.")} />
      </> : null}
      <Sheet visible={editorOpen} size="full" title={flow.kind === "draft" && flow.initial.expectedUpdatedAt === 0 ? copy("Yeni not", "New note") : copy("Notu düzenle", "Edit note")} onClose={close}>
        {flow.kind === "draft" && <NoteEditor key={flow.initial.id} initial={flow.initial} {...editorProps} />}
        {flow.kind === "existing" && <ExistingNote key={flow.id} id={flow.id} {...editorProps} />}
      </Sheet>
      {!editorOpen ? (
        <>
          <QueryState
            query={query}
            empty={visible?.length === 0}
            emptyTitle={search.trim() && query.data?.notes.length ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz not yok", "No notes yet")}
            emptyDetail={search.trim() && query.data?.notes.length ? undefined
              : copy("Notlar bu projede agentların da okuyabileceği kısa kayıtlardır.", "Notes are short records in this project that agents can read too.")}
            emptyAction={
              search.trim() && query.data?.notes.length
                ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch }
                : offersFirstNote
                  ? { label: copy("Yeni not", "New note"), onPress: startNew }
                  : undefined
            }
          />
          {!!query.data && query.data.total > query.data.notes.length && (
            <Body muted style={uiStyles.caption}>
              {copy("Son {p0} not gösteriliyor", "Showing the latest {p0} notes", { p0: query.data.notes.length })}
            </Body>
          )}
        </>
      ) : null}
    </>}
      renderItem={({ item }) => item.kind === "heading" ? <SectionHeader count={item.count} title={item.group === null ? (item.grouping === "tag" ? copy("Etiketsiz", "Untagged") : copy("Projesiz notlar", "Notes without a project")) : item.grouping === "tag" ? `#${item.group}` : projects.data?.find((project) => project.cwd === item.group)?.name ?? item.group} />
        : <NoteLibraryRow
            note={item.note}
            projectName={!projectId && grouping !== "project" ? projects.data?.find((project) => project.cwd === item.note.sourceCwd)?.name : undefined}
            machineName={machine?.name}
            projectId={projectId}
            busy={editorOpen || busy}
            canDelete={!!machine && query.isEnabled !== false && query.fetchStatus !== "paused" && !query.error}
            onOpen={() => { recovery.reset(); save.reset(); remove.reset(); dispatch({ type: "open", id: item.note.id }); }}
            onDelete={(id, expectedUpdatedAt) => remove.mutate({ id, expectedUpdatedAt })}
          />}
    /></SwipeActionsGroup>
  );
}
