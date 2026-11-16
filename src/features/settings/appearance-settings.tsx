import { useState } from "react";
import { Notice, SegmentedControl, Section, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { useAsyncAction } from "@/state/actions";
import { useAppearance } from "@/state/appearance";
import { AppearancePreview } from "./appearance-preview";
import { themeModeOptions } from "./appearance-settings-model";
import { ChatAppearanceSettings } from "./chat-appearance-settings";
import { PalettePicker } from "./palette-picker";
import { TypographySettings } from "./typography-settings";

/**
 * The one Appearance page: theme, palette, general typography, message text size and a preview.
 * Each preference keeps its own store and recovery; this component only composes them.
 */
export function AppearanceSettings() {
  const copy = useCopy();
  const themeMode = useAppearance((state) => state.themeMode);
  const setThemeMode = useAppearance((state) => state.setThemeMode);
  const palette = useAppearance((state) => state.palette);
  const setPalette = useAppearance((state) => state.setPalette);
  const hydrated = useAppearance((state) => state.hydrated);
  const storageError = useAppearance((state) => state.storageError);
  const retryStorage = useAppearance((state) => state.retryStorage);
  const retry = useAsyncAction();
  const [retrying, setRetrying] = useState(false);
  return (
    <Stack style={{ gap: space.xl }}>
      {storageError ? (
        <Notice
          tone="warning"
          message={copy(
            "Görünüm tercihi okunamadı veya kaydedilemedi. Yeniden dene veya bir seçim yap.",
            "The appearance preference could not be read or saved. Retry or make a choice.",
          )}
          retrying={retrying}
          onRetry={() => {
            if (retrying) return;
            setRetrying(true);
            // The store re-reads after a failed read and re-saves the whole record after a failed save;
            // the captured error stops a stale tap from retrying a newer failure.
            void retry.run(() => retryStorage(storageError)).finally(() => setRetrying(false));
          }}
        />
      ) : null}
      <Section title={copy("Tema", "Theme")}>
        <SegmentedControl
          label={copy("Tema", "Theme")}
          hideLabel
          value={themeMode}
          disabled={!hydrated}
          options={themeModeOptions(copy)}
          onChange={(value) => { void setThemeMode(value); }}
        />
      </Section>
      <Section title={copy("Renk paleti", "Color palette")}>
        <PalettePicker
          value={palette}
          disabled={!hydrated}
          onChange={(value) => { void setPalette(value); }}
        />
      </Section>
      <TypographySettings />
      <ChatAppearanceSettings />
      <AppearancePreview />
    </Stack>
  );
}
