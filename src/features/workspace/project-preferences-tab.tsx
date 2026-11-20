import { ScrollView } from "react-native";
import { NavigationGroup, NavigationRow, SectionHeader } from "@/ui/primitives";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { metrics, space } from "@/ui/tokens";
import type { ProjectMenuItem, ProjectMenuSection } from "./project-menu-sheet";

/** Project settings tab: the project's own entries (details, tools, submodules, working folder) as grouped rows. */
export function ProjectPreferencesTab({ sections }: { sections: readonly ProjectMenuSection[] }) {
  const content = useScreenContentInsets();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space.screen, paddingBottom: space.screen + content.bottom,
      paddingLeft: content.left, paddingRight: content.right, gap: space.md, flexGrow: 1,
      width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
      {sections.map((section) => {
        const items = section.items.filter((item): item is ProjectMenuItem => !!item);
        if (!items.length) return null;
        return (
          <NavigationGroup key={section.key}>
            <SectionHeader title={section.title} />
            {items.map((item) => (
              <NavigationRow key={item.key} label={item.label} detail={item.detail} detailLines={1} detailEllipsizeMode="middle"
                icon={item.icon} disabled={item.disabled} intent="command" onPress={item.onPress} />
            ))}
          </NavigationGroup>
        );
      })}
    </ScrollView>
  );
}
