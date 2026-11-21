import { ScrollView, View } from "react-native";
import { useScrollSections } from "panelui-native/hooks/use-scroll-sections";
import { SectionNavigator } from "@/ui/section-progress";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { metrics, space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { LegalDocument, legalSectionId, type LegalDocumentId } from "./legal-document";
import { legalAppendixTitle, legalSections } from "./legal-content";

/**
 * Long terms/privacy text: the reader owns the document scroll and the
 * section toolbar sits below it in the normal layout.
 */
export function LegalReader({ document }: { document: Exclude<LegalDocumentId, "help"> }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const content = useScreenContentInsets();
  const sections = legalSections[document].map((section, index) => ({ id: legalSectionId(index), title: copy(...section.title) }));
  if (document === "terms") sections.push({ id: "mit-license", title: legalAppendixTitle("mit-license", copy) });
  sections.push({ id: "contact-links", title: legalAppendixTitle("contact-links", copy) });
  const tracker = useScrollSections({ ids: sections.map((section) => section.id) });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={tracker.ref} {...tracker.scrollProps} style={{ flex: 1, backgroundColor: colors.background }}
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
