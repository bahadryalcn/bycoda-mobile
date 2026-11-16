import { useCallback, useEffect, useRef, useState } from "react";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { useCopy } from "./copy";
import { duringSystemPrompt } from "../state/system-prompt";
import { showToast } from "./toast";

/** Writes one local image to the system photo library after asking for add-only permission. */
export async function saveImageToPhotos(uri: string, messages: { denied: string }) {
  const permission = await duringSystemPrompt(() => requestPermissionsAsync(true, ["photo"]));
  if (!permission.granted) throw new Error(messages.denied);
  await Asset.create(uri);
}

/** Save to Photos with a success toast; failures stay in `error` for the viewer to show. */
export function useSaveToPhotos(uri: string, enabled: boolean) {
  const copy = useCopy();
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [state, setState] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const busy = useRef(false);
  const save = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true; setState({ busy: true, error: null });
    let error: unknown = null;
    try {
      await saveImageToPhotos(uri, { denied: copy("Fotoğraflara erişim izni verilmedi.", "Photo library access was not allowed.") });
      showToast({ message: copy("Fotoğraflara kaydedildi", "Saved to Photos") });
    } catch (cause) { error = cause; }
    busy.current = false;
    if (live.current) setState({ busy: false, error });
  }, [uri, enabled, copy]);
  return { save, busy: state.busy, error: state.error };
}
