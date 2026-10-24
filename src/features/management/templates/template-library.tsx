import { useState } from "react";
import { ScrollView } from "react-native";
import { randomUUID } from "expo-crypto";
import { Body, Button, Field, FormActions, NavigationRow, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { space } from "@/ui/tokens";
import { ErrorText } from "@/features/workspace/shared";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { confirmAction } from "@/ui/confirm";
import { useFormDraft } from "@/state/form-draft";
import { MAX_TEMPLATE_BODY, normalizeTemplates, type PromptTemplate } from "./template-model";
import { useTemplateHydration, useTemplates } from "./template-store";
import { DesktopPreferences } from "@/features/workspace/desktop-preferences";
import type { SessionScope } from "@/features/workspace/session-types";

export function TemplateLibrary({ onInsert, onClose, scope, projectId }: { onInsert: (body: string) => void; onClose: () => void; scope?: SessionScope; projectId?: string }) {
  useTemplateHydration();
  const copy = useCopy();
  const state = useTemplates();
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [computer, setComputer] = useState(false);
  if (computer && scope && projectId) return <Stack style={{ flex: 1 }}><Button label={copy("Telefon şablonlarına dön", "Back to phone templates")} onPress={() => setComputer(false)} /><DesktopPreferences scope={scope} projectId={projectId} onClose={onClose} onInsert={onInsert} embedded /></Stack>;
  if (editing) return <TemplateEditor initial={editing} onClose={() => setEditing(null)} onInsert={() => { onInsert(editing.body); onClose(); }} />;
  return <ScreenList data={state.hydrated && !state.error ? state.rows : []} keyExtractor={(row) => row.id}
    renderItem={({ item: row }) => <NavigationRow label={row.name} detail={row.trigger ? `;${row.trigger}` : undefined} onPress={() => setEditing(row)} />}
    header={<Stack>
    {scope && projectId ? <Button label={copy("Bilgisayar şablonları", "Computer templates")} onPress={() => setComputer(true)} /> : null}
    <Body muted>{copy("Bu telefona kaydedilir. Şablon eklemek mesajı göndermez.", "Saved on this phone. Inserting a template does not send a message.")}</Body>
    <ErrorText error={state.error} />
    {!state.hydrated || state.error ? <Button label={copy("Şablonları yeniden yükle", "Reload templates")} onPress={() => { void state.hydrate(); }} /> : <>
      <Button label={copy("Şablon ekle", "Add template")} disabled={state.rows.length >= 100 || state.saving}
        onPress={() => setEditing({ id: randomUUID(), name: "", body: "" })} />
      {!state.rows.length ? <Body muted>{copy("Henüz şablon yok", "No templates yet")}</Body> : null}
    </>}
  </Stack>} />;
}

function TemplateEditor({ initial, onClose, onInsert }: { initial: PromptTemplate; onClose: () => void; onInsert: () => void }) {
  const copy = useCopy();
  const [baseline] = useState(useTemplates.getState().rows);
  const form = useFormDraft(initial);
  const state = useTemplates();
  const [error, setError] = useState<unknown>(null);
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: state.saving, onClose });
  const save = async (remove = false) => {
    try {
      const rows = baseline.filter((row) => row.id !== initial.id);
      const updated = baseline.some((row) => row.id === initial.id)
        ? baseline.map((row) => row.id === initial.id ? form.values : row) : [...baseline, form.values];
      await state.save(remove ? rows : updated, baseline);
      onClose();
    } catch (cause) { setError(cause); }
  };
  let valid = true;
  try { normalizeTemplates([...baseline.filter((row) => row.id !== initial.id), form.values]); } catch { valid = false; }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.screen, gap: space.md }}>
    {baseline.some((row) => row.id === initial.id) ? <Button label={copy("Mesaja ekle", "Insert into message")} disabled={form.dirty || state.saving} onPress={onInsert} /> : null}
    <Field label={copy("Şablon adı", "Template name")} value={form.values.name} onChangeText={(name) => form.patch({ name })} editable={!state.saving} />
    <Field label={copy("Şablon tetikleyicisi", "Template trigger")} value={form.values.trigger ?? ""} onChangeText={(trigger) => form.patch({ trigger })} editable={!state.saving} autoCapitalize="none" />
    <Field label={copy("Şablon metni", "Template text")} value={form.values.body} onChangeText={(body) => form.patch({ body })} multiline maxLength={MAX_TEMPLATE_BODY} style={{ minHeight: 180 }} editable={!state.saving} />
    {baseline.some((row) => row.id === initial.id) ? <Button label={copy("Şablonu sil", "Delete template")} tone="danger" disabled={state.saving} onPress={() => {
      confirmAction(copy("Şablonu sil", "Delete template"), initial.name, copy("Sil", "Delete"), () => { void save(true); });
    }} /> : null}
    <FormActions submitLabel={copy("Şablonu kaydet", "Save template")} disabled={!valid || !form.dirty} busy={state.saving}
      onSubmit={() => { void save(); }} onCancel={requestClose} feedback={<ErrorText error={error} />} />
  </ScrollView>;
}
