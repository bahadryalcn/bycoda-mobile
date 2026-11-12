import { useEffect, type ReactNode } from "react";

import { useCopy } from "@/ui/copy";
import { ToggleField } from "@/ui/fields";

import { useWidgetPreferences } from "./model/widget-preferences";

/** Opt-in for session titles on home and lock screen widgets, which sit outside the app lock. */
export function WidgetSettings({ icon }: { icon?: ReactNode }) {
  const copy = useCopy();
  const showTitles = useWidgetPreferences((state) => state.showTitles);
  const hydrate = useWidgetPreferences((state) => state.hydrate);
  const setShowTitles = useWidgetPreferences((state) => state.setShowTitles);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return (
    <ToggleField
      icon={icon}
      label={copy("Oturum başlıklarını widget'larda göster", "Show session titles on widgets")}
      help={copy(
        "Widget'lar uygulama kilidinin dışında görünür. Kapalıyken yalnızca proje adları görünür.",
        "Widgets are visible without the app lock. When off, only project names appear.",
      )}
      value={showTitles}
      onChange={setShowTitles}
    />
  );
}
