import { useState } from "react";
import { randomUUID } from "expo-crypto";
import Plus from "lucide-react-native/icons/plus";
import { Badge, Body, Button, Empty, ErrorNotice, IconButton, NavigationRow, Row, SearchField, Skeleton, StateView, Stack } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { ScreenList } from "@/ui/screen-list";
import { errorMessage, remoteErrorKind } from "@/ui/error-message";
import { errorIllustration, errorTitle } from "@/ui/state-model";
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
  const { colors } = useMobileTheme();
  const state = useTemplates();
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [computer, setComputer] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const rows = state.rows.filter((row) => `${row.name} ${row.trigger ?? ""} ${row.body}`.toLocaleLowerCase().includes(term));
  if (computer && scope && projectId) return <Stack style={{ flex: 1 }}><Button label={copy("Telefon şablonlarına dön", "Back to phone templates")} onPress={() => setComputer(false)} /><DesktopPreferences scope={scope} projectId={projectId} onClose={onClose} onInsert={onInsert} embedded /></Stack>;
  if (editing) return <TemplateEditor initial={editing} onClose={() => setEditing(null)} onInsert={() => { onInsert(editing.body); onClose(); }} />;
  const addTemplate = () => { if (state.rows.length < MAX_TEMPLATES && !state.saving) setEditing({ id: randomUUID(), name: "", body: "" }); };
  const loadFailed = !!state.error && !state.rows.length;
  const reload = copy("Şablonları yeniden yükle", "Reload templates");
  return <ScreenList data={state.hydrated && !state.error ? rows : []} keyExtractor={(row) => row.id}
    renderItem={({ item: row }) => <NavigationRow label={row.name}
      detail={row.body.replace(/\s+/g, " ").trim().slice(0, 400)} detailLines={2}
      supporting={row.trigger || row.body.includes("{{cursor}}") ? <Row>
        {row.trigger ? <Badge label={`;${row.trigger}`} /> : null}
        {row.body.includes("{{cursor}}") ? <Badge label={copy("İmleç noktası", "Cursor point")} tone="info" /> : null}
      </Row> : undefined}
      accessibilityLabel={[row.name, row.trigger ? `;${row.trigger}` : ""].filter(Boolean).join(". ")}
      onPress={() => setEditing(row)} />}
    ListEmptyComponent={!state.hydrated && !state.error ? <Skeleton /> : loadFailed ? <StateView tone="danger" illustration={errorIllustration(remoteErrorKind(state.error))}
      title={errorTitle(remoteErrorKind(state.error), copy)} description={errorMessage(state.error, copy)}
      action={{ label: reload, onPress: () => { void state.hydrate(); } }} /> : state.hydrated && !state.error && !rows.length ? <Empty compact={false}
        illustration={term && state.rows.length ? "search-empty" : "inbox-empty"}
        title={term && state.rows.length ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz şablon yok", "No templates yet")}
        detail={term && state.rows.length ? undefined : copy("Sık kullandığınız istemleri şablon olarak kaydedip tek dokunuşla ekleyin.", "Save prompts you reuse as templates and insert them in one tap.")}
        action={term && state.rows.length ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => setSearch("") }
          : { label: copy("Yeni şablon", "New template"), onPress: addTemplate }} /> : undefined}
    header={<Stack>
    {scope && projectId ? <Button tone="quiet" label={copy("Bilgisayar şablonları", "Computer templates")} onPress={() => setComputer(true)} /> : null}
    {state.error && !loadFailed ? <ErrorNotice error={state.error} retryLabel={reload} onRetry={() => { void state.hydrate(); }} /> : null}
    {state.hydrated && !state.error ? (
      <SearchToolbar search={<SearchField label={copy("Ad, tetikleyici veya metinde ara", "Search template names, triggers and text")} value={search} onChangeText={setSearch} />}
        actions={<IconButton label={copy("Şablon ekle", "Add template")} disabled={state.rows.length >= MAX_TEMPLATES || state.saving}
          onPress={addTemplate}><Plus size={22} strokeWidth={2.2} color={colors.accent} /></IconButton>} />
    ) : null}
  </Stack>} />;
}
