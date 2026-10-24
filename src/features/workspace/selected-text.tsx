import { useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Body, Button, ErrorText, Field, Notice, Row, SelectField, Sheet } from "@/ui/primitives";
import { LANGUAGES } from "@/localization";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { useComposerTransfer } from "./composer-transfer";
import type { ComposerTransferScope } from "./composer-transfer-model";
import { excerptPage, quoteExcerpt, selectedExcerpt, translationDraft } from "./selected-text-model";

/** Deliberate native selection of bounded, read-only source; never an editor or send action. */
export function SelectedText({ text, scope, onClose }: { text: string; scope: ComposerTransferScope; onClose: () => void }) {
  const copy = useCopy(); const locale = useLocale(); const bridge = useComposerTransfer();
  const [opening] = useState(() => ({ text, scope: { ...scope } }));
  const [pageIndex, setPage] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [language, setLanguage] = useState(locale);
  const [error, setError] = useState<unknown>(null);
  const [transferred, setTransferred] = useState(false);
  const transferFlight = useRef(false);
  const page = useMemo(() => excerptPage(opening.text, pageIndex), [opening.text, pageIndex]);
  const { height } = useWindowDimensions();
  const changed = opening.text !== text || opening.scope.machineId !== scope.machineId || opening.scope.sessionId !== scope.sessionId;
  let excerpt = "";
  try { excerpt = selectedExcerpt(page.text, selection); } catch { /* No implicit whole-message fallback. */ }
  const insert = (translate: boolean) => {
    if (!bridge || changed || transferred || transferFlight.current) return;
    try {
      const selected = selectedExcerpt(page.text, selection);
      const target = LANGUAGES.find((entry) => entry.value === language);
      if (!target) throw new Error("Select a target language.");
      transferFlight.current = true;
      bridge.transfer({ ...opening.scope, text: translate ? translationDraft(selected, target.label) : quoteExcerpt(selected) });
      setTransferred(true); setError(null); onClose();
    } catch (cause) { transferFlight.current = false; setError(cause); }
  };
  const move = (next: number) => { setSelection({ start: 0, end: 0 }); setPage(next); setError(null); };
  return <Sheet visible title={copy("Metin seç", "Select excerpt")} size="full" onClose={onClose}
    footer={<Row>
      <Button label={copy("Alıntıyı taslağa ekle", "Add quote to draft")} disabled={!excerpt || !bridge || changed || transferred} onPress={() => insert(false)} />
      <Button tone="quiet" label={copy("Çeviri taslağı hazırla", "Prepare translation draft")} disabled={!excerpt || !bridge || changed || transferred} onPress={() => insert(true)} />
    </Row>}>
    <Body muted>{copy("Yalnız seçtiğiniz metin mevcut taslağa eklenir. Çeviri isteği Gönder'e dokunana kadar çalışmaz.", "Only selected text is appended to your current draft. Translation does not run until you tap Send.")}</Body>
    {changed ? <Notice tone="warning" message={copy("Kaynak veya hedef değişti. Metin seçimini yeniden açın.", "The source or destination changed. Reopen text selection.")} /> : null}
    <Row><Button tone="quiet" label={copy("Geri", "Back")} disabled={page.index === 0} onPress={() => move(page.index - 1)} />
      <Body>{`${page.index + 1} / ${page.pages}`}</Body><Button tone="quiet" label={copy("Sonraki", "Next")} disabled={page.index + 1 >= page.pages} onPress={() => move(page.index + 1)} /></Row>
    <Field key={page.index} label={copy("Salt okunur kaynak: metni seçin", "Read-only source: select text")} value={page.text} readOnly multiline showSoftInputOnFocus={false}
      scrollEnabled onSelectionChange={(event) => setSelection(event.nativeEvent.selection)} style={{ height: Math.max(160, height * 0.32) }} />
    <SelectField label={copy("Çeviri dili", "Translation language")} value={language} options={LANGUAGES} onChange={setLanguage} />
    <Body muted>{copy("Seçilen karakter: {p0}", "Selected characters: {p0}", { p0: excerpt.length })}</Body>
    <ErrorText error={error} />
  </Sheet>;
}
