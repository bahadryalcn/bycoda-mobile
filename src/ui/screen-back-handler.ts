import { useContext } from "react";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { OverlayLayerDepth, handleOverlayBack } from "./overlay-back";

/**
 * Android Back for an in-page state (sub-view, folder level, entry form). While a sheet or dialog
 * is open over the page, Back closes that sheet first, whatever order the handlers subscribed in;
 * only then does the page's own step run. Handlers inside a sheet keep their own Back.
 */
export function useScreenBackHandler(enabled: boolean, onBack: () => void) {
  const insideOverlay = useContext(OverlayLayerDepth) > 0;
  useBackHandler(enabled, () => {
    if (!insideOverlay && handleOverlayBack()) return;
    onBack();
  });
}
