import { useEffect, useState } from "react";
import { clipboardHasImage } from "./attachment-files";

/**
 * Whether "Paste image" belongs in an open attachment sheet. The clipboard is checked each time the
 * sheet opens; only its kind is read, so the system paste prompt appears only when pasting.
 */
export function useClipboardImage(visible: boolean) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    void clipboardHasImage().then((value) => {
      if (live) setAvailable(value);
    });
    return () => {
      live = false;
      setAvailable(false);
    };
  }, [visible]);
  return visible && available;
}
