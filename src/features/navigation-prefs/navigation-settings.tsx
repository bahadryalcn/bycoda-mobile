import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Sortable } from "panelui-native/components/sortable";
import { Body, Button, NavigationGroup, NavigationRow, SettingIcon, Sheet, Stack, ToggleField } from "@/ui/primitives";
import Rows3 from "lucide-react-native/icons/rows-3";
import FolderClock from "lucide-react-native/icons/folder-clock";
import { useCopy } from "@/ui/copy";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import { useMobileTheme } from "@/ui/theme";
import { gapIcon, metrics, space } from "@/ui/tokens";
import { appPreferences, useAppPreferences, type AppPreferences } from "./app-preferences";
import { defaultTabPreferences, hasCustomTabLayout, moveTab, setTabHidden, type DockTabId } from "./tab-preferences";

/** Settings → Navigation: dock tab order and visibility, and the new-session default. */
export function NavigationSettings() {
  const copy = useCopy();
  const { preferences, hydrated, storageError, retry } = useAppPreferences();
  const [editing, setEditing] = useState(false);
  const label = (id: DockTabId) =>
    ({
      index: copy("Projeler", "Projects"),
      chats: copy("Oturumlar", "Sessions"),
      inbox: copy("Gelen kutusu", "Inbox"),
      manage: copy("Araçlar", "Tools"),
    })[id];
  const update = (patch: Partial<AppPreferences>) => void appPreferences.getState().update(patch);
  return (
    <>
      <PreferenceStorageNotice error={storageError} retry={retry} />
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
  const { preferences, storageError, retry } = useAppPreferences();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const tabs = preferences.tabs;
  const save = (change: (current: typeof tabs) => typeof tabs) =>
    void appPreferences.getState().update(current => ({ tabs: change(current.tabs) }));
  return (
    <Sheet visible title={copy("Sekmeleri düzenle", "Customize tabs")} size="compact" scroll={false} onClose={onClose}
      footer={<Stack style={{ gap: space.xs }}>
        {hasCustomTabLayout(tabs) ? <Button label={copy("Varsayılan sekme düzenini kullan", "Use default tab layout")} tone="quiet" fullWidth onPress={() => save(() => defaultTabPreferences)} /> : null}
        <Button label={copy("Tamam", "Done")} fullWidth tone="primary" onPress={onClose} />
      </Stack>}>
      <GestureHandlerRootView style={{ flexGrow: 0, flexShrink: 1 }}>
        <Animated.ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.screen, gap: space.sm, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
        >
          <PreferenceStorageNotice error={storageError} retry={retry} />
          <Body muted>{copy("Görünecek sekmeleri seç. Sıralamak için tutamaçları sürükle.", "Choose which tabs to show. Drag the handles to reorder them.")}</Body>
          <Sortable
            value={[...tabs.order]}
            gap={0}
            scrollRef={scrollRef}
            onReorder={(_, { id, to }) => save(current => moveTab(current, current.order.findIndex(tab => tab === id), to))}
          >
            {tabs.order.map((id, index) => (
              <Sortable.Item key={id} id={id}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: gapIcon,
                    minHeight: metrics.touchTarget,
                    borderBottomColor: colors.separator,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ToggleField
                      label={label(id)}
                      value={!tabs.hidden.includes(id)}
                      onChange={(visible) => save(current => setTabHidden(current, id, !visible))}
                    />
                  </View>
                  <Sortable.Handle
                    accessibilityLabel={`${label(id)}, ${copy("Sekmeyi sürükle", "Drag tab")}`}
                    accessibilityValue={{ min: 1, max: tabs.order.length, now: index + 1 }}
                    accessibilityActions={[
                      ...(index > 0 ? [{ name: "decrement" }, { name: "moveUp", label: copy("Yukarı taşı", "Move up") }] : []),
                      ...(index < tabs.order.length - 1 ? [{ name: "increment" }, { name: "moveDown", label: copy("Aşağı taşı", "Move down") }] : []),
                    ]}
                    onAccessibilityAction={({ nativeEvent: { actionName } }) => {
                      const offset = actionName === "decrement" || actionName === "moveUp" ? -1
                        : actionName === "increment" || actionName === "moveDown" ? 1 : 0;
                      if (!offset) return;
                      save(current => {
                        const position = current.order.indexOf(id);
                        return moveTab(current, position, position + offset);
                      });
                    }}
                    style={{ minWidth: metrics.touchTarget, minHeight: metrics.touchTarget }}
                  />
                </View>
              </Sortable.Item>
            ))}
          </Sortable>
        </Animated.ScrollView>
      </GestureHandlerRootView>
    </Sheet>
  );
}
