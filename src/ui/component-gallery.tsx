import { useState } from "react";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { Heading, Body } from "./typography";
import { Stack } from "./layout";
import { SegmentedControl } from "./segmented-control";
import { GalleryCatalog } from "./component-gallery-catalog";
import { GalleryControls } from "./component-gallery-controls";
import { GalleryChat } from "./component-gallery-chat";
import { GalleryData } from "./component-gallery-data";
import type { GalleryExample } from "./component-gallery-model";

/** Loaded only by the explicit offline Controls action. No host or account data. */
export function ComponentGallery() {
  useMobileTheme();
  const copy = useCopy();
  const [view, setView] = useState<"examples" | "catalog">("examples");
  const [example, setExample] = useState<GalleryExample>("controls");
  return (
    <Stack>
      <Heading>{copy("PanelUI bileşenleri", "PanelUI components")}</Heading>
      <Body muted>
        {copy(
          "Gerçek bileşenleri örnek verilerle dene. Bu alandaki işlemler yalnızca bu turu değiştirir.",
          "Try real components with sample data. Actions here only change this tour.",
        )}
      </Body>
      <SegmentedControl
        label={copy("Bileşen görünümü", "Component view")}
        value={view}
        onChange={setView}
        options={[
          { value: "examples", label: copy("Örnekler", "Examples") },
          { value: "catalog", label: copy("140 bileşen", "140 components") },
        ]}
      />
      {view === "catalog" ? (
        <GalleryCatalog
          onExample={(next) => {
            setExample(next);
            setView("examples");
          }}
        />
      ) : (
        <>
          <SegmentedControl
            label={copy("Örnek türü", "Example type")}
            value={example}
            onChange={setExample}
            options={[
              { value: "controls", label: copy("Kontroller", "Controls") },
              { value: "chat", label: copy("Sohbet", "Chat") },
              { value: "data", label: copy("Veri", "Data") },
            ]}
          />
          {example === "controls" ? (
            <GalleryControls />
          ) : example === "chat" ? (
            <GalleryChat />
          ) : (
            <GalleryData />
          )}
        </>
      )}
    </Stack>
  );
}
