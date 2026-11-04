import { useState } from "react";
import { randomUUID } from "expo-crypto";
import { Body, Button, Empty, ErrorNotice, Loading, NavigationRow, SearchField, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { SearchToolbar } from "@/ui/search-field";
import { useCopy } from "@/ui/copy";
import { MAX_TEMPLATES, type PromptTemplate } from "./template-model";
import { useTemplateHydration, useTemplates } from "./template-store";
import { TemplateEditor } from "./template-editor";
import { DesktopPreferences } from "@/features/workspace/desktop-preferences";
import type { SessionScope } from "@/features/workspace/session-types";

export function TemplateLibrary({ onInsert, onClose, scope, projectId }: { onInsert: (body: string) => void; onClose: () => void; scope?: SessionScope; projectId?: string }) {
  useTemplateHydration();
  const copy = useCopy();
  const state = useTemplates();
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [computer, setComputer] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const rows = state.rows.filter((row) => `${row.name} ${row.trigger ?? ""} ${row.body}`.toLocaleLowerCase().includes(term));
  if (computer && scope && projectId) return <Stack style={{ flex: 1 }}><Button label={copy("Telefon şablonlarına dön", "Back to phone templates")} onPress={() => setComputer(false)} /><DesktopPreferences scope={scope} projectId={projectId} onClose={onClose} onInsert={onInsert} embedded /></Stack>;
  if (editing) return <TemplateEditor initial={editing} onClose={() => setEditing(null)} onInsert={() => { onInsert(editing.body); onClose(); }} />;
  return <ScreenList data={state.hydrated && !state.error ? rows : []} keyExtractor={(row) => row.id}
    renderItem={({ item: row }) => <NavigationRow label={row.name} detail={row.trigger ? `;${row.trigger}` : undefined} onPress={() => setEditing(row)} />}
    header={<Stack>
    {scope && projectId ? <Button tone="quiet" label={copy("Bilgisayar şablonları", "Computer templates")} onPress={() => setComputer(true)} /> : null}
    <Body muted>{copy("Bu telefona kaydedilir. Şablon eklemek mesajı göndermez.", "Saved on this phone. Inserting a template does not send a message.")}</Body>
    <ErrorNotice error={state.error} retryLabel={copy("Şablonları yeniden yükle", "Reload templates")} onRetry={() => { void state.hydrate(); }} />
    {!state.hydrated && !state.error ? <Loading /> : null}
    {state.hydrated && !state.error ? <>
      <SearchToolbar search={<SearchField label={copy("Ara", "Search")} value={search} onChangeText={setSearch} />}
        actions={<Button label={copy("Şablon ekle", "Add template")} disabled={state.rows.length >= MAX_TEMPLATES || state.saving}
          onPress={() => setEditing({ id: randomUUID(), name: "", body: "" })} />} />
      {!rows.length ? <Empty compact title={term && state.rows.length ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz şablon yok", "No templates yet")}
        action={term && state.rows.length ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => setSearch("") } : undefined} /> : null}
    </> : null}
  </Stack>} />;
}
