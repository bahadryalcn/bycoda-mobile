import { useMobileTheme } from "@/ui/theme";
import { useLocale } from "@/i18n";
import { ScreenList } from "@/ui/screen-list";
import { Sheet } from "@/ui/primitives";
import { useProjectList } from "../workspace/use-project-directory";
import { useMemo, useReducer, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import History from "lucide-react-native/icons/rotate-ccw-clock";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Plus from "lucide-react-native/icons/plus";
import {
  ActionMenu,
  Body,
  Heading,
  Button,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  SearchField,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";

import { useActiveMachine, useMachines } from "@/state/machines";
import { identifier } from "./shared/format";
import { colors } from "@/ui/tokens";
import { Scope } from "./shared/scope";
import { createNoteDraftStore, type LocalNoteDraft } from "./note-drafts";
import { initialNoteFlow, noteFlowReducer } from "./note-flow";

import type { Note } from "@/domain/types";
export type { Note } from "@/domain/types";
import type { NoteList, StorageOperation } from "./notes/types";
import { ExistingNote, NoteEditor } from "./notes/note-editor";
import { NoteSummaryRow } from "./notes/note-summary-row";
import { noteDirectory, type NoteDirectoryRow, type NoteGrouping, type NoteOrdering } from "./notes/note-directory";

const draftStore = createNoteDraftStore(AsyncStorage);

export function NotesScreen() {
  useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [grouping, setGrouping] = useState<NoteGrouping>("none");
  const [ordering, setOrdering] = useState<NoteOrdering>("updated");
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
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
  const storage = useMutation<void, Error, StorageOperation>({
    mutationFn: (operation) => {
      if (!machine)
        return Promise.reject(new Error(copy("Bir bilgisayar seçin.", "Choose a computer.")));
      // The store serializes every keystroke. A single-flight gate would discard newer edits.
      return operation.kind === "save"
        ? draftStore.save(machine.id, operation.draft)
        : draftStore.clearSaved(machine.id, operation.draft);
    },
    retry: false,
    networkMode: "always",
  });
  const close = () => dispatch({ type: "close", expected: flow });
  const editorProps = { save, remove, storage, onClose: close };
  const editorOpen = flow.kind !== "closed";
  const busy = save.isPending || remove.isPending || recovery.isPending;
  const visible = useMemo(() => noteDirectory(query.data?.notes ?? [], search, grouping, ordering, locale), [query.data?.notes, search, grouping, ordering, locale]);
  return (
    <ScreenList<NoteDirectoryRow> title={copy("Notlar", "Notes")} query={query} data={visible} keyExtractor={(row) => row.key}
      actions={!editorOpen ? (
        <>
          <ActionMenu label={copy("Not görünümü", "Note view")} trigger={<SlidersHorizontal size={22} color={colors.accent} />} actions={[
            { key: "group-none", label: copy("Gruplama yok", "No grouping"), selected: grouping === "none", onPress: () => setGrouping("none") },
            { key: "group-project", label: copy("Projeye göre grupla", "Group by project"), selected: grouping === "project", onPress: () => setGrouping("project") },
            { key: "group-tag", label: copy("Etikete göre grupla", "Group by tag"), selected: grouping === "tag", onPress: () => setGrouping("tag") },
            { key: "sort-updated", label: copy("Son düzenlenenler", "Recently edited"), selected: ordering === "updated", onPress: () => setOrdering("updated") },
            { key: "sort-created", label: copy("Son oluşturulanlar", "Recently created"), selected: ordering === "created", onPress: () => setOrdering("created") },
            { key: "sort-title", label: copy("Başlığa göre sırala", "Sort by title"), selected: ordering === "title", onPress: () => setOrdering("title") },
          ]} />
          <ActionMenu
            label={copy("Diğer not işlemleri", "More note actions")}
            busy={recovery.isPending}
            trigger={<History size={22} strokeWidth={2} color={colors.accent} />}
            actions={[
              {
                key: "recover",
                label: copy("Kaydedilmemiş taslağı aç", "Recover unsaved draft"),
                disabled: editorOpen || save.isPending || remove.isPending || recovery.isPending,
                onPress: () => {
                  storage.reset();
                  void recovery.run(async () => {
                    const draft = machine ? await draftStore.recover(machine.id) : null;
                    if (draft) dispatch({ type: "recover", initial: draft, expected: flow });
                    return draft;
                  });
                },
              },
            ]}
          />
          <IconButton
            label={copy("Yeni not", "New note")}
            disabled={editorOpen || busy || (!!projectId && !sourceCwd)}
            onPress={() => {
              recovery.reset();
              storage.reset();
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
            }}
          >
            <Plus size={22} strokeWidth={2.2} color={colors.accent} />
          </IconButton>
        </>
      ) : undefined}
      header={<>
      {!editorOpen ? (
        <>
          <Scope allowAll />
          <SearchField label={copy("Ara", "Search")} value={search} onChangeText={setSearch} />
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
      <MutationState
        mutation={save}
        success={copy("Not bilgisayara kaydedildi.", "Note saved to computer.")}
      />
      <MutationState mutation={remove} success={copy("Not silindi.", "Note deleted.")} />
      <MutationState mutation={storage} />
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
          />
          {!!query.data && query.data.total > query.data.notes.length && (
            <Body muted>
              {copy(
                "En son 500 not gösteriliyor. Daha dar bir proje seçin.",
                "Showing the latest 500 notes. Select a project to narrow the list.",
              )}
            </Body>
          )}
        </>
      ) : null}
      {search.trim() && visible?.length === 0 ? <Button tone="quiet" label={copy("Aramayı temizle", "Clear search")} onPress={() => setSearch("")} /> : null}
    </>}
      renderItem={({ item }) => item.kind === "heading" ? <Heading>{item.group === null ? (item.grouping === "tag" ? copy("Etiketsiz", "Untagged") : copy("Projesiz notlar", "Notes without a project")) : item.grouping === "tag" ? `#${item.group}` : projects.data?.find((project) => project.cwd === item.group)?.name ?? item.group} · {item.count}</Heading>
        : <NoteSummaryRow note={item.note} disabled={editorOpen || busy} onPress={() => { recovery.reset(); storage.reset(); save.reset(); remove.reset(); dispatch({ type: "open", id: item.note.id }); }} />}
    />
  );
}
