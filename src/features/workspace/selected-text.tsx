import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Body, Button, Field, Notice, SelectField, Sheet } from "@/ui/primitives";
import { LANGUAGES } from "@/localization";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { ReaderActionArea } from "@/ui/reader-actions";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { usePrivateContentAccess } from "@/ui/private-access";
import { useComposerTransfer } from "./composer-transfer";
import type { ComposerTransferScope } from "./composer-transfer-model";
import { excerptPage, quoteExcerpt, selectedExcerpt, selectionDisplayText, translationDraft } from "./selected-text-model";

/** Deliberate native selection of bounded, read-only source; never an editor or send action. */
export function SelectedText({ text, scope, onClose }: { text: string; scope: ComposerTransferScope; onClose: () => void }) {
  const copy = useCopy(); const locale = useLocale(); const bridge = useComposerTransfer();
  const [opening] = useState(() => ({ text, scope: { ...scope } }));
  const [pageIndex, setPage] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [language, setLanguage] = useState(locale);
  const [error, setError] = useState<unknown>(null);
  const [transferred, setTransferred] = useState(false);
  const transferFlight = useRef(false), live = useRef(false), retired = useRef(false);
  const [wasRetired, setRetired] = useState(false);
  const permission = usePrivateContentAccess(), access = useRef(permission); access.current = permission;
  const page = useMemo(() => excerptPage(opening.text, pageIndex), [opening.text, pageIndex]);
  const pageOwner = useMemo(() => ({}), [page.index]);
  const current = useRef({ selection, pageIndex, language, bridge, pageOwner: pageOwner as object | null });
  current.current = { selection, pageIndex, language, bridge, pageOwner };
  const allowed = () => { const state = useSecurity.getState(); return isAppAccessAllowed() && state.appState === "active" && state.windowFocused && access.current.allowed && access.current.check(); };
  const retireAccess = () => { if (live.current && !allowed()) { retired.current = true; setRetired(true); } };
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useLayoutEffect(() => useSecurity.subscribe(retireAccess), []);
  useLayoutEffect(retireAccess, [permission]);
  const displayed = useMemo(() => selectionDisplayText(page.text), [page.text]);
  const { height } = useWindowDimensions();
  const mismatch = opening.text !== text || opening.scope.machineId !== scope.machineId || opening.scope.sessionId !== scope.sessionId;
  const changed = wasRetired || mismatch;
  if (changed) { retired.current = true; if (!wasRetired) setRetired(true); }
  let excerpt = "";
  try { excerpt = selectedExcerpt(displayed, selection); } catch { /* No implicit whole-message fallback. */ }
  const ownsPage = () => live.current && !retired.current && allowed() && current.current.pageOwner === pageOwner;
  const insert = (translate: boolean) => {
    if (!ownsPage() || current.current.selection !== selection || current.current.pageIndex !== pageIndex || current.current.language !== language || current.current.bridge !== bridge || !bridge || changed || transferred || transferFlight.current) return;
    try {
      const selected = selectedExcerpt(displayed, selection);
      const target = LANGUAGES.find((entry) => entry.value === language);
      if (!target) throw new Error("Select a target language.");
      transferFlight.current = true;
      bridge.transfer({ ...opening.scope, text: translate ? translationDraft(selected, target.label) : quoteExcerpt(selected) });
      if (live.current) { setTransferred(true); setError(null); onClose(); }
    } catch (cause) { transferFlight.current = false; if (live.current) setError(cause); }
  };
  const move = (next: number) => {
    if (!ownsPage() || !Number.isInteger(next) || next < 0 || next >= page.pages) return;
    const empty = { start: 0, end: 0 };
    current.current.pageOwner = null; current.current.selection = empty; current.current.pageIndex = next;
    setSelection(empty); setPage(next); setError(null);
  };
  return <Sheet visible title={copy("Alıntıla veya çevir", "Quote or translate")} size="full" onClose={onClose}
    footer={<ReaderActionArea page={page.index} pages={page.pages} onPage={move} navigationDisabled={changed || transferred}
      error={error} status={<Body muted>{copy("Seçilen karakter: {p0}", "Selected characters: {p0}", { p0: excerpt.length })}</Body>}>
      <Button label={copy("Alıntıyı taslağa ekle", "Add quote to draft")} disabled={!excerpt || !bridge || changed || transferred} onPress={() => insert(false)} />
      <Button tone="quiet" label={copy("Çeviri isteği hazırla", "Prepare translation")} disabled={!excerpt || !bridge || changed || transferred} onPress={() => insert(true)} />
    </ReaderActionArea>}>
    <Body muted>{copy("Aşağıdaki metinde bir bölümü basılı tutup seçin. Seçtiğiniz kısım yanıt taslağınıza alıntı olarak eklenir ya da çeviri isteği olarak hazırlanır. Gönder'e dokunana kadar hiçbir şey gönderilmez.", "Touch and hold to select part of the text below. The selection is added to your reply draft as a quote, or prepared as a translation request. Nothing is sent until you tap Send.")}</Body>
    {changed ? <Notice tone="warning" message={copy("Kaynak veya hedef değişti. Metin seçimini yeniden açın.", "The source or destination changed. Reopen text selection.")} /> : null}
    <Field key={page.index} label={copy("Mesaj metni (salt okunur)", "Message text (read-only)")} value={displayed} readOnly multiline showSoftInputOnFocus={false}
      scrollEnabled onSelectionChange={(event) => { if (!ownsPage()) return; current.current.selection = event.nativeEvent.selection; setSelection(event.nativeEvent.selection); }} style={{ height: Math.max(160, height * 0.32) }} />
    <SelectField label={copy("Çeviri dili (yalnız çeviri için)", "Translate to (translation only)")} value={language} options={LANGUAGES} onChange={(value) => { if (!ownsPage()) return; current.current.language = value; setLanguage(value); }} />
  </Sheet>;
}
