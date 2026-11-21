import type { ReactNode } from "react";
import { Sheet, NavigationGroup, NavigationRow, SectionHeader } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";

export type ProjectMenuItem = {
  key: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type ProjectMenuSection = { key: string; title: string; items: readonly (ProjectMenuItem | false)[] };

/** Project options as a bottom sheet with labelled sections instead of a popover. */
export function ProjectMenuSheet({
  visible,
  sections,
  onClose,
}: {
  visible: boolean;
  sections: readonly ProjectMenuSection[];
  onClose: () => void;
}) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} size="compact" title={copy("Proje seçenekleri", "Project options")} onClose={onClose}>
      <ProjectMenuItems sections={sections} />
    </Sheet>
  );
}

function ProjectMenuItems({ sections }: { sections: readonly ProjectMenuSection[] }) {
  const { requestCloseThen } = useSheetGuard({});
  return sections.map((section) => {
    const items = section.items.filter((item): item is ProjectMenuItem => !!item);
    if (!items.length) return null;
    return (
      <NavigationGroup key={section.key}>
        <SectionHeader title={section.title} />
        {items.map((item) => (
          <NavigationRow
            key={item.key}
            label={item.label}
            detail={item.detail}
            detailLines={1}
            detailEllipsizeMode="middle"
            icon={item.icon}
            selected={item.selected}
            disabled={item.disabled}
            intent="command"
            onPress={() => requestCloseThen(item.onPress)}
          />
        ))}
      </NavigationGroup>
    );
  });
}
