import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Sortable } from "panelui-native/components/sortable";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Button, PressableCard, Sheet } from "@/ui/primitives";
import { ProjectIcon } from "@/ui/project-icon";
import { gapIcon, metrics, radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { DirectorySection } from "./project-directory";
import type { ProjectOrderMove } from "./project-order";

/**
 * Drag-to-reorder for groups and, inside one group, its projects. Two levels instead of a nested
 * sortable: a drag only ever moves one flat list, so scrolling and auto-scroll stay unambiguous.
 */
export function ProjectReorderSheet({
  visible,
  sections,
  grouped,
  othersLabel,
  onMove,
  onClose,
}: {
  visible: boolean;
  /** Every section with all of its projects, in the order currently shown. */
  sections: readonly DirectorySection[];
  grouped: boolean;
  othersLabel: string;
  onMove: (move: ProjectOrderMove) => void;
  onClose: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [groupKey, setGroupKey] = useState<string | null>(null);
  useEffect(() => { if (!visible) setGroupKey(null); }, [visible]);
  const open = grouped ? sections.find((section) => section.key === groupKey) : sections[0];
  const showGroups = grouped && !open;
  const groupName = (section: DirectorySection) => section.group?.name ?? othersLabel;
  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    minHeight: metrics.touchTarget,
    borderRadius: radii.control,
    backgroundColor: colors.raised,
    paddingStart: space.row,
  };
  const handle = (label: string) => (
    <Sortable.Handle accessibilityLabel={label} style={{ minWidth: metrics.touchTarget, minHeight: metrics.touchTarget }} />
  );
  return (
    <Sheet
      visible={visible}
      title={open && grouped ? groupName(open) : copy("Sırala", "Reorder")}
      size="full"
      scroll={false}
      onClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.screen, gap: space.sm }}
        >
          {open && grouped ? (
            <View style={{ alignSelf: "flex-start" }}>
              <Button label={copy("Geri", "Back")} tone="quiet" onPress={() => setGroupKey(null)} />
            </View>
          ) : null}
          {showGroups ? (
            <Sortable
              value={sections.map((section) => section.key)}
              gap={space.xs}
              scrollRef={scrollRef}
              onReorder={(_, { from, to }) => onMove({ scope: "groups", from, to })}
            >
              {sections.map((section) => (
                <Sortable.Item key={section.key} id={section.key}>
                  <View style={rowStyle}>
                    <PressableCard
                      label={`${groupName(section)}. ${section.data.length}`}
                      onPress={() => setGroupKey(section.key)}
                      style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: gapIcon, minHeight: metrics.touchTarget }}
                    >
                      <ProjectIcon appearance={section.group?.appearance} group size={18} box={24} />
                      <Text numberOfLines={1} style={[uiStyles.label, { flex: 1, minWidth: 0, fontWeight: "700" }]}>{groupName(section)}</Text>
                      <Text style={[uiStyles.caption, { fontVariant: ["tabular-nums"] }]}>{section.data.length}</Text>
                      <ChevronRight size={16} color={colors.muted} />
                    </PressableCard>
                    {handle(copy("Grubu sürükle", "Drag group"))}
                  </View>
                </Sortable.Item>
              ))}
            </Sortable>
          ) : open ? (
            <Sortable
              key={open.key}
              value={open.data.map((project) => project.id)}
              gap={space.xs}
              scrollRef={scrollRef}
              onReorder={(_, { from, to }) => onMove({ scope: grouped ? { group: open.key } : "flat", from, to })}
            >
              {open.data.map((project) => (
                <Sortable.Item key={project.id} id={project.id}>
                  <View style={[rowStyle, { gap: gapIcon }]}>
                    <ProjectIcon appearance={project.appearance} size={22} box={28} />
                    <Text numberOfLines={1} style={[uiStyles.label, { flex: 1, minWidth: 0 }]}>{project.name}</Text>
                    {handle(copy("Projeyi sürükle", "Drag project"))}
                  </View>
                </Sortable.Item>
              ))}
            </Sortable>
          ) : null}
        </Animated.ScrollView>
      </GestureHandlerRootView>
    </Sheet>
  );
}
