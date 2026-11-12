import { SectionProgress } from "panelui-native/components/section-progress";
export { sectionNavigatorClearance } from "./section-progress-model";
import type { ScrollSectionsPosition } from "panelui-native/hooks/use-scroll-sections";

export type SectionNavigatorItem = { id: string; title: string };

/**
 * Reading-progress pill for one long document: ring = scroll depth, label = current section,
 * press = jump list. It floats over its parent, so the scroll owner must reserve bottom
 * clearance (see `sectionNavigatorClearance`) and the pill must be a sibling of that scroller.
 */
export function SectionNavigator({ sections, active, scroll, onSelect, label }: {
  sections: readonly SectionNavigatorItem[];
  active: string | undefined;
  scroll: ScrollSectionsPosition;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <SectionProgress scroll={scroll} value={active} onValueChange={onSelect} label={label}>
      {sections.map((section) => <SectionProgress.Item key={section.id} value={section.id}>{section.title}</SectionProgress.Item>)}
    </SectionProgress>
  );
}
