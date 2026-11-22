import { ScrollView, View } from "react-native";
import { useScrollSections } from "panelui-native/hooks/use-scroll-sections";
import { SectionNavigator } from "@/ui/section-progress";
import { Sheet } from "@/ui/dialogs";
import { ScreenFrameInsets, useScreenContentInsets } from "@/ui/screen-content-insets";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { LegalDocument, legalDocumentTitle, legalSectionId, type LegalDocumentId } from "./legal-document";
import { legalAppendixTitle, legalSections } from "./legal-content";

export function LegalDocumentSheet({ document, onClose }: {
  document: LegalDocumentId | null;
  onClose: () => void;
}) {
  const copy = useCopy();
  return (
    <Sheet visible={document !== null} title={document ? legalDocumentTitle(document, copy) : ""}
      onClose={onClose} size={document === "help" ? "form" : "full"} scroll={document === "help"}>
      {document === "help" ? <LegalDocument document={document} /> : document ? (
        <ScreenFrameInsets value={true}>
          <LegalReader key={document} document={document} />
        </ScreenFrameInsets>
      ) : null}
    </Sheet>
  );
}

/**
 * Long terms/privacy text: the reader owns the document scroll and the
 * section toolbar sits below it in the normal layout.
 */
export function LegalReader({ document }: { document: Exclude<LegalDocumentId, "help"> }) {
  const copy = useCopy();
  const content = useScreenContentInsets();
  const sections = legalSections[document].map((section, index) => ({ id: legalSectionId(index), title: copy(...section.title) }));
  if (document === "terms") sections.push({ id: "mit-license", title: legalAppendixTitle("mit-license", copy) });
  sections.push({ id: "contact-links", title: legalAppendixTitle("contact-links", copy) });
  const tracker = useScrollSections({ ids: sections.map((section) => section.id) });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={tracker.ref} {...tracker.scrollProps} style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center",
          paddingTop: space.md,
          // Safe-area edges are physical even when text and section navigation are RTL.
          paddingLeft: content.left,
          paddingRight: content.right,
          paddingBottom: space.lg,
        }}>
        <LegalDocument document={document} sectionLayout={tracker.measure} />
      </ScrollView>
      <SectionNavigator sections={sections} active={tracker.active} scroll={tracker.scroll}
        onSelect={tracker.scrollTo} label={copy("Bölümler", "Sections")} />
    </View>
  );
}
