import { useEffect, useRef, useState } from "react";
import Plus from "lucide-react-native/icons/plus";
import type { HostModelCatalog } from "@/domain/types";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { HintSection } from "@/ui/info-hint";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import {
  ActionMenu, Body, Field, FormActions, NavigationGroup, NavigationRow, QueryState, Section, SelectField, SettingIcon, Sheet, StateView, ToggleField, ValueRow,
} from "@/ui/primitives";
import { SettingsPage } from "../settings/settings-page";
import { DICTATION_CLEANUP_CAPABILITY } from "../workspace/dictation-processing";
import {
  DICTATION_LIMITS, normalizeDictationPreferences, removeDictionaryEntry, saveDictionaryEntry,
  type DictationCleanup, type DictationDictionaryEntry, type DictionaryEditError,
} from "./dictation-preferences";
import { useVoicePreferences, voicePreferences, type VoicePreferences } from "./voice-preferences";

type Copy = ReturnType<typeof useCopy>;

/** Merges a change into the latest stored preferences, so a quick second change never undoes the first. */
function change(patch: (current: VoicePreferences) => Partial<VoicePreferences>) {
  return voicePreferences.getState().update(patch).catch(() => {});
}
const changeCleanup = (patch: Partial<DictationCleanup>) =>
  change(current => ({ dictationCleanup: { ...current.dictationCleanup, ...patch } }));

/**
 * Settings → Voice and microphone → Dictation options: the desktop's dictation settings that need more
 * than one row. They are kept on this phone and apply to every dictation from it, whichever computer
 * recognizes it; calls keep their own turn settings.
 */
export function DictationSettingsScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { preferences, hydrated, storageError, retry } = useVoicePreferences();
  const dictation = normalizeDictationPreferences(preferences);
  // Only Whisper on the computer has the silence filter; the phone and cloud engines decide on their own.
  const computerWhisper = !preferences.phoneDictation && preferences.engine === "local";
  return (
    <SettingsPage title={copy("Sesle yazma seçenekleri", "Dictation options")} scope={machine ? { computer: machine.name } : undefined}>
      <PreferenceStorageNotice error={storageError} retry={retry} />
      <Section title={copy("Tanıma", "Recognition")}>
        <NavigationGroup>
          <ToggleField label={copy("Dolgu sözcüklerini kaldır", "Remove filler words")}
            help={copy("“Eee”, “ııı” ve “hmm” gibi duraksamaları yazıya geçirmez.", "Leaves hesitations such as “um”, “uh” and “hmm” out of the text.")}
            value={dictation.dictationRemoveFillers} disabled={!hydrated}
            onChange={dictationRemoveFillers => void change(() => ({ dictationRemoveFillers }))} />
          {computerWhisper ? (
            <ToggleField label={copy("Sessizliği ve arka plan gürültüsünü filtrele", "Filter silence and background noise")}
              help={copy("Bilgisayardaki Whisper sessiz ve gürültülü bölümleri atlar. Yalnızca kelimeler eksik kalıyorsa kapat.", "Whisper on the computer skips silent and noisy parts. Turn it off only if words go missing.")}
              value={dictation.dictationSilenceFilter} disabled={!hydrated}
              onChange={dictationSilenceFilter => void change(() => ({ dictationSilenceFilter }))} />
          ) : null}
        </NavigationGroup>
      </Section>
      <CustomWords entries={dictation.dictationDictionary} disabled={!hydrated} />
      <CleanupSettings cleanup={dictation.dictationCleanup} disabled={!hydrated} />
    </SettingsPage>
  );
}

/** Custom words: the preferred spelling of names and terms, written whenever one of its spoken forms is heard. */
function CustomWords({ entries, disabled }: { entries: DictationDictionaryEntry[]; disabled: boolean }) {
  const copy = useCopy();
  const [editing, setEditing] = useState<{ entry: DictationDictionaryEntry | null } | null>(null);
  const full = entries.length >= DICTATION_LIMITS.entries;
  return (
    <HintSection title={copy("Özel kelimeler", "Custom words")}
      help={copy("Sık kullandığın adlar ve teknik terimler. Söylenişlerinden biri duyulduğunda doğru yazılışı yazılır.", "Names and technical terms you use often. When one of their spoken forms is heard, the preferred spelling is written.")}>
      <NavigationGroup>
        {entries.map((entry, index) => (
          <ValueRow key={`${entry.projectId ?? ""}\n${entry.term.toLowerCase()}\n${index}`} label={entry.term}
            trailing={<ActionMenu label={copy("{p0} işlemleri", "{p0} actions", { p0: entry.term })} actions={[
              { key: "edit", label: copy("Düzenle", "Edit"), disabled, onPress: () => setEditing({ entry }) },
              { key: "remove", label: copy("Kaldır", "Remove"), destructive: true, disabled,
                onPress: () => void change(current => ({ dictationDictionary: removeDictionaryEntry(current.dictationDictionary, entry) })) },
            ]} />}>
            {entry.aliases.length ? <Body muted>{entry.aliases.join(", ")}</Body> : null}
          </ValueRow>
        ))}
        <NavigationRow intent="command" icon={<SettingIcon glyph={Plus} />} label={copy("Kelime ekle", "Add word")}
          detail={full ? dictionaryError("full", copy) : undefined} disabled={disabled || full}
          onPress={() => setEditing({ entry: null })} />
      </NavigationGroup>
      {editing ? <WordEditor editing={editing.entry} onClose={() => setEditing(null)} /> : null}
    </HintSection>
  );
}

function dictionaryError(error: DictionaryEditError | "save", copy: Copy) {
  switch (error) {
    case "empty": return copy("Önce doğru yazılışı gir.", "Enter the preferred spelling first.");
    case "duplicate": return copy("Bu kelime zaten kayıtlı. Kayıtlı olanı düzenle.", "This word is already saved. Edit the saved one instead.");
    case "full": return copy("Liste {p0} kelimeyle dolu. Yenisi için birini kaldır.", "The list is full at {p0} words. Remove one to add another.", { p0: String(DICTATION_LIMITS.entries) });
    default: return copy("Kelime kaydedilemedi. Tekrar dene.", "The word could not be saved. Try again.");
  }
}

/** Adds a word or edits one: its preferred spelling and the ways it is spoken. */
function WordEditor({ editing, onClose }: { editing: DictationDictionaryEntry | null; onClose(): void }) {
  const copy = useCopy();
  const initial = { term: editing?.term ?? "", aliases: editing?.aliases.join(", ") ?? "" };
  const [term, setTerm] = useState(initial.term);
  const [aliases, setAliases] = useState(initial.aliases);
  const [error, setError] = useState<DictionaryEditError | "save" | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = term !== initial.term || aliases !== initial.aliases;
  const save = async () => {
    if (busy) return;
    const draft = { term, aliases };
    const checked = saveDictionaryEntry(voicePreferences.getState().preferences.dictationDictionary, editing, draft);
    if ("error" in checked) { setError(checked.error); return; }
    setBusy(true);
    try {
      // Checked again against the latest list, so a change made meanwhile is never lost.
      await voicePreferences.getState().update(current => {
        const next = saveDictionaryEntry(current.dictationDictionary, editing, draft);
        if ("error" in next) throw new Error(next.error);
        return { dictationDictionary: next.entries };
      });
      onClose();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(reason === "empty" || reason === "duplicate" || reason === "full" ? reason : "save");
    } finally { setBusy(false); }
  };
  const termError = error === "empty" || error === "duplicate" ? dictionaryError(error, copy) : undefined;
  return (
    <Sheet visible dirty={dirty} title={editing ? copy("Kelimeyi düzenle", "Edit word") : copy("Kelime ekle", "Add word")}
      onClose={() => { if (!busy) onClose(); }}>
      <Field label={copy("Doğru yazılış", "Preferred spelling")} value={term} maxLength={DICTATION_LIMITS.term}
        autoCapitalize="none" autoCorrect={false} error={termError}
        onChangeText={value => { setTerm(value); setError(null); }} />
      <Field label={copy("Söylenişler", "Spoken forms")} value={aliases}
        info={copy("Tanıyıcının bu kelime yerine yazdığı biçimler, virgülle ayrılmış. Örnek: tayp skript, type script", "How the recognizer writes this word instead, separated by commas. Example: type script, typescript")}
        autoCapitalize="none" autoCorrect={false}
        onChangeText={value => { setAliases(value); setError(null); }} />
      <FormActions submitLabel={copy("Kaydet", "Save")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} dirty={dirty}
        feedback={error === "full" || error === "save" ? <Body muted>{dictionaryError(error, copy)}</Body> : undefined}
        onCancel={onClose} onSubmit={() => { void save(); }} />
    </Sheet>
  );
}

/**
 * The desktop's opt-in cleanup: each dictated phrase (never the rest of the draft) and the owner's
 * instructions go to Codex on the computer. Models are the computer's own Codex models. A computer
 * whose bycoda cannot run cleanup for this phone says so instead of offering a switch that does nothing.
 */
function CleanupSettings({ cleanup, disabled }: { cleanup: DictationCleanup; disabled: boolean }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const supported = machine?.capabilities?.includes(DICTATION_CLEANUP_CAPABILITY) === true;
  const catalog = useHostQuery<HostModelCatalog>(["models", "dictation-cleanup"], "models.list", { progressive: true },
    { enabled: supported && cleanup.enabled, interval: (data) => data?.pending?.length ? 1000 : false });
  const title = copy("Metni düzenleme", "Text cleanup");
  const help = copy(
    "Söylediğin her ifade ve talimatların bilgisayardaki Codex’e gönderilir; taslağının geri kalanı gönderilmez. Düzenleme yapılamazsa tanınan metin olduğu gibi eklenir.",
    "Each phrase you dictate and your instructions go to Codex on the computer; the rest of your draft is not sent. If cleanup cannot run, the recognized text is inserted as it is.",
  );
  if (!machine) return (
    <HintSection title={title} help={help}>
      <StateView size="compact" title={copy("Metni düzenlemek için bir bilgisayar bağla.", "Connect a computer to clean up dictated text.")} />
    </HintSection>
  );
  if (!supported) return (
    <HintSection title={title} help={help}>
      <StateView size="compact" title={copy("Metni düzenlemek için {p0} üzerindeki bycoda’yı güncelle.", "Update bycoda on {p0} to clean up dictated text.", { p0: machine.name })} />
    </HintSection>
  );
  const models = catalog.data?.models.codex ?? [];
  const saved = cleanup.model && !models.some(model => (model.nativeId ?? model.id) === cleanup.model)
    ? [{ value: cleanup.model, label: cleanup.model }] : [];
  return (
    <HintSection title={title} help={help}>
      <NavigationGroup>
        <ToggleField label={copy("Yazıya çevrilen metni düzenle", "Clean up dictated text")} value={cleanup.enabled} disabled={disabled}
          onChange={enabled => void changeCleanup({ enabled })} />
        {cleanup.enabled ? <>
          <SelectField variant="row" label={copy("Düzenleme modeli", "Cleanup model")} value={cleanup.model} disabled={disabled}
            options={[
              { value: "", label: copy("Codex varsayılanı", "Codex default") },
              ...models.map(model => ({ value: model.nativeId ?? model.id, label: model.name })),
              ...saved,
            ]}
            onChange={model => { if (model !== cleanup.model) void changeCleanup({ model }); }} />
          <ToggleField label={copy("İngilizceye çevir", "Translate to English")} value={cleanup.translateToEnglish} disabled={disabled}
            onChange={translateToEnglish => void changeCleanup({ translateToEnglish })} />
        </> : null}
      </NavigationGroup>
      {cleanup.enabled ? <>
        <QueryState query={catalog} loading="inline" compact />
        <DraftField label={copy("Düzenleme talimatları", "Cleanup instructions")} value={cleanup.instructions} disabled={disabled}
          maxLength={DICTATION_LIMITS.instructions} multiline
          placeholder={copy("Noktalamayı düzelt, kelimelerimi koru.", "Fix punctuation and keep my wording.")}
          onCommit={instructions => void changeCleanup({ instructions })} />
        <DraftField label={copy("Düzeltme ifadesi", "Correction phrase")} value={cleanup.correctionCue} disabled={disabled}
          maxLength={DICTATION_LIMITS.correctionCue}
          info={copy("İsteğe bağlı. Kendini düzelttiğini belirten sözlü ifade, örneğin “yok, şöyle”.", "Optional spoken phrase that marks a correction, such as “scratch that”.")}
          onCommit={correctionCue => void changeCleanup({ correctionCue })} />
      </> : null}
    </HintSection>
  );
}

/**
 * Text saved when the field is left (or the page closes), like the other text settings, so typing
 * never waits on storage. The draft stays shown until the saved value catches up.
 */
function DraftField({ label, value, onCommit, disabled, ...props }: {
  label: string; value: string; onCommit(value: string): void; disabled: boolean;
  maxLength: number; multiline?: boolean; placeholder?: string; info?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };
  useEffect(() => { if (draft !== null && draft === value) setDraft(null); }, [draft, value]);
  // Leaving the page without leaving the field still keeps what was typed.
  useEffect(() => () => {
    const { draft: pending, value: saved, onCommit: commit } = latest.current;
    if (pending !== null && pending !== saved) commit(pending);
  }, []);
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); };
  return <Field label={label} value={draft ?? value} editable={!disabled} {...props}
    onChangeText={setDraft} onBlur={commit} onSubmitEditing={props.multiline ? undefined : commit} />;
}
