import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScrollSections } from "panelui-native/hooks/use-scroll-sections";
import { SectionNavigator } from "@/ui/section-progress";
import { sectionNavigatorClearance } from "@/ui/section-progress-model";
import { metrics, space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { LegalDocument, legalSectionId, type LegalDocumentId } from "./legal-document";
import { legalSections } from "./legal-content";

/**
 * Long terms/privacy text: this view owns the scroll so a reading-progress pill can jump between
 * sections. The pill floats, so the content reserves its height at the bottom instead of being covered.
 */
export function LegalReader({ document }: { document: Exclude<LegalDocumentId, "help"> }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const sections = legalSections[document].map((section, index) => ({ id: legalSectionId(index), title: copy(...section.title) }));
  const tracker = useScrollSections({ ids: sections.map((section) => section.id) });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={tracker.ref} {...tracker.scrollProps} style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center",
          paddingTop: space.md, paddingHorizontal: Math.max(insets.left, space.screen),
          paddingBottom: insets.bottom + space.lg + sectionNavigatorClearance(fontScale),
        }}>
        <LegalDocument document={document} sectionLayout={tracker.measure} />
      </ScrollView>
      <SectionNavigator sections={sections} active={tracker.active} scroll={tracker.scroll}
        onSelect={tracker.scrollTo} label={copy("Bölümler", "Sections")} />
    </View>
  );
}
