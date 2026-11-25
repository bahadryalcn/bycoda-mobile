import { useState } from "react";
import { Body, Button, NavigationGroup, NavigationRow, SettingIcon, Sheet, ToggleField } from "@/ui/primitives";
import Rows3 from "lucide-react-native/icons/rows-3";
import FolderClock from "lucide-react-native/icons/folder-clock";
import { useCopy } from "@/ui/copy";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import { appPreferences, useAppPreferences, type AppPreferences } from "./app-preferences";
import { DOCK_TAB_IDS, defaultTabPreferences, hasCustomTabLayout, isLastVisibleTab, setTabHidden, visibleDockTabs, type DockTabId } from "./tab-preferences";

/** Settings → Navigation: which dock tabs show, and the new-session default. */
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
          detail={visibleDockTabs(preferences.tabs)
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
      {editing ? <TabVisibilitySheet onClose={() => setEditing(false)} label={label} /> : null}
    </>
  );
}

/** Visibility switches in the dock's fixed order; there is no reordering (owner decision). */
function TabVisibilitySheet({ onClose, label }: { onClose: () => void; label: (id: DockTabId) => string }) {
  const copy = useCopy();
  const { preferences, storageError, retry } = useAppPreferences();
  const tabs = preferences.tabs;
  const save = (change: (current: typeof tabs) => typeof tabs) =>
    void appPreferences.getState().update(current => ({ tabs: change(current.tabs) }));
  return (
    <Sheet visible title={copy("Sekmeleri düzenle", "Customize tabs")} size="compact" onClose={onClose}
      // Changes save instantly; the sheet's close button ends the task, so there is no "Done".
      footer={hasCustomTabLayout(tabs)
        ? <Button label={copy("Tüm sekmeleri göster", "Show all tabs")} tone="quiet" fullWidth onPress={() => save(() => defaultTabPreferences)} />
        : undefined}>
      <PreferenceStorageNotice error={storageError} retry={retry} />
      <Body muted>{copy("Alt çubukta görünecek sekmeleri seç. Ayarlar her zaman görünür.", "Choose which tabs appear in the bottom bar. Settings is always shown.")}</Body>
      <NavigationGroup>
        {DOCK_TAB_IDS.map((id) => (
          <ToggleField
            key={id}
            label={label(id)}
            detail={isLastVisibleTab(tabs, id) ? copy("En az bir sekme görünür kalır", "At least one tab stays visible") : undefined}
            disabled={isLastVisibleTab(tabs, id)}
            value={!tabs.hidden.includes(id)}
            onChange={(visible) => save(current => setTabHidden(current, id, !visible))}
          />
        ))}
      </NavigationGroup>
    </Sheet>
  );
}
