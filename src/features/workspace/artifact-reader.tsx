import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Body, Button, FormActions, NavigationRow, Notice, QueryState, Sheet, Stack, type QueryLike } from "@/ui/primitives";
import { HtmlDocument } from "@/ui/html-document";
import { CodeSource } from "@/ui/code-source";
import { ReaderActions } from "@/ui/reader-actions";
import { useSourcePages } from "@/ui/use-source-pages";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { usePrivateContentAccess } from "@/ui/private-access";
import { useChatAppearance } from "@/state/chat-appearance";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import type { HtmlArtifact, HtmlArtifactSummary } from "@/remote/types";

/** One full reader: bounded source pages copy the complete original HTML. */
export function ArtifactReader({ artifact, summary, machineName, query, unavailable, onBack }: {
  artifact?: HtmlArtifact; summary: HtmlArtifactSummary; machineName: string; query: QueryLike; unavailable: boolean; onBack(): void;
}) {
  const copy = useCopy(), access = usePrivateContentAccess(), textSize = useChatAppearance(state => state.textSize);
  const [interaction, setInteraction] = useState(true);
  const [mode, setMode] = useState<"preview" | "source" | "details">("preview");
  const pagination = useSourcePages(artifact?.html ?? ""), clipboard = useClipboardFeedback(artifact?.html ?? "", !!artifact && mode === "source");
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const lease = useMemo(() => ({ active: false }), [artifact, summary, mode, access, pagination.page]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  const current = () => mounted.current && lease.active && access.allowed && access.check();
  const change = (next: typeof mode) => { if (current()) { pagination.setPage(0); setMode(next); } };
  const back = () => { if (current()) onBack(); };
  const page = (next: number) => { if (current() && artifact && mode === "source" && Number.isInteger(next) && next >= 0 && next < pagination.pages) pagination.setPage(next); };
  const feedback = <QueryState query={query} />;
  const missing = unavailable ? <Notice message={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} /> : null;
  return <Sheet visible title={mode === "details" ? copy("Ayrıntılar", "Details") : copy("HTML önizleme", "HTML preview")} size="full" scroll={false} onClose={back}
    footer={artifact ? mode === "source" ? <ReaderActions page={pagination.page} pages={pagination.pages} onPage={page}
      copyLabel={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Kopyala", "Copy")} onCopy={clipboard.copy} busy={clipboard.busy} error={clipboard.error}>
      <Button tone="quiet" label={copy("Önizle", "Preview")} onPress={() => change("preview")} />
      <Button tone="quiet" label={copy("Listeye dön", "Back to list")} onPress={back} />
    </ReaderActions> : <FormActions tone="quiet" submitLabel={mode === "preview" ? copy("Kaynağı göster", "Show source") : copy("Önizle", "Preview")} onSubmit={() => change(mode === "preview" ? "source" : "preview")}
      cancelLabel={copy("Listeye dön", "Back to list")} onCancel={back} /> : <FormActions submitLabel={copy("Listeye dön", "Back to list")} onSubmit={back} />}>
    {mode === "details" ? <ScrollView contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.screen, paddingBottom: space.md }}><Body selectable>{machineName}</Body>{artifact ? <><Body selectable>{artifact.title}</Body><Body selectable>{artifact.id}</Body><Body selectable>{artifact.createdAt}</Body><Body selectable>{artifact.bytes} B</Body></> : null}{feedback}{missing}</ScrollView>
      : artifact ? <View style={{ flex: 1, minHeight: 0 }}><Stack style={{ paddingHorizontal: space.screen }}><NavigationRow label={artifact.title} labelLines={2} detail={machineName} detailLines={1} onPress={() => change("details")} />{feedback}</Stack>{mode === "preview" ? <HtmlDocument html={artifact.html} name={artifact.title} fill interaction={{ enabled: interaction, toggle: () => { if (current()) setInteraction(value => !value); } }} /> : <ScrollView key={pagination.page} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.screen, paddingBottom: space.md }}><CodeSource code={pagination.text} language="html" textSize={textSize} plain={pagination.pages > 1} /></ScrollView>}</View>
      : <ScrollView contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.screen, paddingBottom: space.md }}>{feedback}{missing}</ScrollView>}
  </Sheet>;
}
