import { requireOptionalNativeModule } from "expo";
import * as Linking from "expo-linking";

import { WIDGET_SCHEME, type WidgetSnapshot } from "../model/snapshot";

const sources = new Set(["ActiveSessions", "NeedsAttention"]);
let tapUrl: string | undefined;
let listening = false;

/** No-op in Expo Go and any build without the ExpoWidgets native module. */
export async function publishWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const [active, attention, widgets] = await Promise.all([
    import("../ui/ActiveSessions"),
    import("../ui/NeedsAttention"),
    import("expo-widgets"),
  ]);
  tapUrl = snapshot.url;
  if (!listening) {
    listening = true;
    // Android has no widgetURL; card taps arrive as interaction events and need a live JS runtime.
    widgets.addUserInteractionListener((event) => {
      if (sources.has(event.source) && tapUrl?.startsWith(WIDGET_SCHEME))
        void Linking.openURL(tapUrl).catch(() => undefined);
    });
  }
  active.default.updateSnapshot(snapshot);
  attention.default.updateSnapshot(snapshot);
}
