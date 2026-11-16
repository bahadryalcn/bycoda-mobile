import { useState } from "react";
import { ScrollView } from "react-native";
import { useAsyncAction } from "@/state/actions";
import { sameFormValue, useFormDraft } from "@/state/form-draft";
import { ErrorNotice, Field, FormActions, Loading, Notice, Section } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useMobileTheme } from "@/ui/theme";
import { MAX_TEMPLATE_BODY, normalizeTemplates, type PromptTemplate } from "./template-model";
import { useTemplates } from "./template-store";
import { TemplateInsertAction } from "./template-insert-action";
import { TemplateActionsMenu } from "./template-actions-menu";

export function TemplateEditor({ initial, onClose, onInsert }: {
  initial: PromptTemplate; onClose: () => void; onInsert: () => void;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const [baseline] = useState(useTemplates.getState().rows);
  const form = useFormDraft(initial);
  const state = useTemplates();
  const reload = useAsyncAction();
  const [error, setError] = useState<unknown>(null);
  const busy = state.saving || reload.isPending;
  const unavailable = !state.hydrated || !!state.error;
  // A read can reconcile an uncertain write, but must never silently rebase this draft.
  const conflict = !unavailable && !sameFormValue(baseline, state.rows);
  const existing = baseline.some((row) => row.id === initial.id);
  const blocked = busy || unavailable || conflict;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const save = async (remove = false) => {
    if (blocked) return;
    setError(null);
    try {
      const rows = baseline.filter((row) => row.id !== initial.id);
      const updated = existing
        ? baseline.map((row) => row.id === initial.id ? form.values : row)
        : [...baseline, form.values];
      await state.save(remove ? rows : updated, baseline);
      onClose();
    } catch (cause) { setError(cause); }
  };
  let valid = true;
  try { normalizeTemplates([...baseline.filter((row) => row.id !== initial.id), form.values]); }
  catch { valid = false; }
  const trigger = (form.values.trigger ?? "").trim().replace(/^;/, "").toLowerCase();
  const triggerInvalid = !!trigger && (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(trigger) ||
    baseline.some((row) => row.id !== initial.id && row.trigger === trigger));
  const required = copy("Bu alan gerekli.", "This field is required.");
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={uiStyles.content}>
    {existing ? <TemplateInsertAction disabled={form.dirty || blocked} onInsert={onInsert}
      secondaryAction={<TemplateActionsMenu templateId={initial.id} name={initial.name} disabled={blocked}
        onDelete={() => { void save(true); }} />} /> : null}
    <Section title={copy("Şablon", "Template")}>
      <Field label={copy("Şablon adı", "Template name")} value={form.values.name}
        error={form.dirty && !form.values.name.trim() ? required : undefined}
        onChangeText={(name) => form.patch({ name })} editable={!busy} />
      <Field label={copy("Şablon tetikleyicisi", "Template trigger")} value={form.values.trigger ?? ""}
        hint={copy("Mesaja ;tetikleyici yazıp boşluk bırakınca şablon eklenir.", "Type ;trigger and a space in a message to insert the template.")}
        error={triggerInvalid ? copy("Tetikleyici benzersiz olmalı; 1–24 harf, rakam veya tire kullan.", "Use a unique trigger with 1–24 letters, numbers or dashes.") : undefined}
        onChangeText={(trigger) => form.patch({ trigger })} editable={!busy} autoCapitalize="none" />
    </Section>
    <Section title={copy("Metin", "Text")}>
      <Field label={copy("Şablon metni", "Template text")} value={form.values.body}
        hint={copy("İmlecin duracağı yere {{cursor}} yazın.", "Write {{cursor}} where the cursor should land.")}
        error={form.dirty && !form.values.body.trim() ? required : undefined}
        onChangeText={(body) => form.patch({ body })} multiline maxLength={MAX_TEMPLATE_BODY}
        style={{ minHeight: 180 }} editable={!busy} />
    </Section>
    <FormActions submitLabel={copy("Şablonu kaydet", "Save template")} disabled={blocked || !valid || !form.dirty} busy={state.saving}
      onSubmit={() => { void save(); }} onCancel={requestClose} cancelDisabled={busy}
      feedback={<>
        <ErrorNotice error={state.error ?? error} retryLabel={copy("Şablonları yeniden yükle", "Reload templates")}
          retrying={reload.isPending} onRetry={unavailable ? () => { void reload.run(async () => {
            await state.hydrate();
            if (!useTemplates.getState().error) setError(null);
          }); } : undefined} />
        {reload.isPending && !(state.error ?? error) ? <Loading /> : null}
        {conflict ? <Notice tone="warning" message={copy("Şablonlar değişti. Taslağını koru ve kaydetmeden önce güncel listeyi yeniden aç.", "Templates changed. Keep your draft and reopen the current list before saving.")} /> : null}
      </>} />
  </ScrollView>;
}
