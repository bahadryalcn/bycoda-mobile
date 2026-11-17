import { useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Sortable } from "panelui-native/components/sortable";
import { Button, NavigationGroup, NavigationRow, SettingIcon, Sheet, ToggleField } from "@/ui/primitives";
import Rows3 from "lucide-react-native/icons/rows-3";
import FolderClock from "lucide-react-native/icons/folder-clock";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { gapIcon, metrics, radii, space } from "@/ui/tokens";
import { appPreferences, useAppPreferences, type AppPreferences } from "./app-preferences";
import { defaultTabPreferences, moveTab, setTabHidden, type DockTabId } from "./tab-preferences";

/** Settings → Navigation: dock tab order and visibility, and the new-session default. */
export function NavigationSettings() {
  const copy = useCopy();
  const { preferences, hydrated } = useAppPreferences();
  const [editing, setEditing] = useState(false);
  const label = (id: DockTabId) =>
    ({
      index: copy("Projeler", "Projects"),
      chats: copy("Oturumlar", "Sessions"),
      inbox: copy("Gelen kutusu", "Inbox"),
      manage: copy("Araçlar", "Tools"),
    })[id];
  const update = (patch: Partial<AppPreferences>) =>
    void appPreferences.getState().update(patch).catch(() => undefined);
  return (
    <>
      <NavigationGroup>
        <NavigationRow
          label={copy("Sekmeleri düzenle", "Customize tabs")}
          icon={<SettingIcon glyph={Rows3} />}
          detail={preferences.tabs.order
            .filter((id) => !preferences.tabs.hidden.includes(id))
            .map(label)
            .concat(copy("Ayarlar", "Settings"))
            .join(", ")}
          disabled={!hydrated}
          onPress={() => setEditing(true)}
        />
        <ToggleField
          label={copy("Yeni oturumlar son projeyi kullanır", "New sessions use the last project")}
          icon={<SettingIcon glyph={FolderClock} />}
          value={preferences.newSessionUsesLastProject}
          disabled={!hydrated}
          onChange={(newSessionUsesLastProject) => update({ newSessionUsesLastProject })}
        />
      </NavigationGroup>
      {editing ? <TabOrderSheet onClose={() => setEditing(false)} label={label} /> : null}
    </>
  );
}

function TabOrderSheet({ onClose, label }: { onClose: () => void; label: (id: DockTabId) => string }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { preferences } = useAppPreferences();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const tabs = preferences.tabs;
  const save = (next: typeof tabs) => void appPreferences.getState().update({ tabs: next }).catch(() => undefined);
  return (
    <Sheet visible title={copy("Sekmeleri düzenle", "Customize tabs")} size="full" scroll={false} onClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.screen, gap: space.sm, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
        >
          <Sortable
            value={[...tabs.order]}
            gap={space.xs}
            scrollRef={scrollRef}
            onReorder={(_, { from, to }) => save(moveTab(tabs, from, to))}
          >
            {tabs.order.map((id) => (
              <Sortable.Item key={id} id={id}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: gapIcon,
                    minHeight: metrics.touchTarget,
                    borderRadius: radii.control,
                    backgroundColor: colors.raised,
                    paddingStart: space.row,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ToggleField
                      label={label(id)}
                      value={!tabs.hidden.includes(id)}
                      onChange={(visible) => save(setTabHidden(tabs, id, !visible))}
                    />
                  </View>
                  <Sortable.Handle
                    accessibilityLabel={copy("Sekmeyi sürükle", "Drag tab")}
                    style={{ minWidth: metrics.touchTarget, minHeight: metrics.touchTarget }}
                  />
                </View>
              </Sortable.Item>
            ))}
          </Sortable>
          <View style={{ alignSelf: "flex-start" }}>
            <Button label={copy("Sekmeleri sıfırla", "Reset tabs")} tone="quiet" onPress={() => save(defaultTabPreferences)} />
          </View>
        </Animated.ScrollView>
      </GestureHandlerRootView>
    </Sheet>
  );
}
