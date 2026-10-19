import { useState } from "react";
import { Screen, ScreenChromeProvider, Card, Row } from "./layout";
import { ScreenList } from "./screen-list";
import { Body, Heading } from "./typography";
import { Button } from "./buttons";
import { Sheet } from "./dialogs";
import { Notice } from "./feedback";
import { useCopy } from "./copy";

/** Isolated real Screen/ScreenList consumers: no host, credentials or nested list. */
export function GalleryLayout() {
  const copy = useCopy();
  const [mode, setMode] = useState<"screen" | "list" | null>(null);
  const [notes, setNotes] = useState(1);
  const [saved, setSaved] = useState(false);
  const add = <Button label={copy("Yeni not", "New note")} onPress={() => setNotes((count) => count + 1)} />;
  return <>
    <Card>
      <Heading>{copy("Ayrıntılar", "Details")}</Heading>
      <Body muted>{copy("Ortak bileşenler iki temada da aynı davranışı korur.", "Shared components keep the same behavior in both themes.")}</Body>
      <Row>
        <Button label={copy("Notlar", "Notes")} onPress={() => setMode("list")} />
        <Button label={copy("Ayarlar", "Settings")} onPress={() => setMode("screen")} />
      </Row>
    </Card>
    <Sheet visible={mode !== null} title={copy("Örnek sayfa", "Sample sheet")} scroll={false} size="full" onClose={() => setMode(null)}>
      <ScreenChromeProvider nativeTitle bottomSafeArea={false}>
        {mode === "list" ? <ScreenList
          title={copy("Notlar", "Notes")}
          actions={add}
          data={Array.from({ length: notes }, (_, id) => ({ id: String(id) }))}
          keyExtractor={(item) => item.id}
          renderItem={() => <Card><Body>{copy("Yeni not", "New note")}</Body></Card>}
        /> : <Screen
          title={copy("Ayarlar", "Settings")}
          actions={<Button label={copy("Örneği kaydet", "Save sample")} onPress={() => setSaved(true)} />}
        >
          <Body>{copy("Bu panel uygulamanın ortak geri, klavye ve odak davranışını kullanır.", "This panel uses the app’s shared back, keyboard and focus behavior.")}</Body>
          {saved ? <Notice tone="success" message={copy("Örnek kaydedildi.", "Sample saved.")} /> : null}
        </Screen>}
      </ScreenChromeProvider>
    </Sheet>
  </>;
}
