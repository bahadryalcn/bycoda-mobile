import { useState } from "react";
import { Checkbox } from "panelui-native/components/checkbox";
import { RadioGroup } from "panelui-native/components/radio-group";
import { Slider } from "panelui-native/components/slider";
import { Avatar } from "panelui-native/components/avatar";
import { Accordion } from "panelui-native/components/accordion";
import { Button } from "./buttons";
import { Card, Row, Stack } from "./layout";
import { Body, Heading } from "./typography";
import { Field, ToggleField } from "./fields";
import { Badge, Notice, Loading, Skeleton } from "./feedback";
import { FormActions, Sheet } from "./dialogs";
import { metrics } from "./tokens";
import { useSheetGuard } from "./sheet-guard";
import { useCopy } from "./copy";
import { GalleryLayout } from "./component-gallery-layout";

function GallerySheetActions({ onSubmit, onClose, error }: { onSubmit: () => void; onClose: () => void; error?: string }) {
  const copy = useCopy();
  const { requestClose } = useSheetGuard({ onClose });
  return <FormActions feedback={error ? <Notice tone="danger" message={error} /> : undefined}
    submitLabel={copy("Örneği kaydet", "Save sample")} onSubmit={onSubmit} onCancel={requestClose} />;
}

export function GalleryControls() {
  const copy = useCopy();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [checked, setChecked] = useState(false);
  const [density, setDensity] = useState("compact");
  const [range, setRange] = useState(40);
  const [sheet, setSheet] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const required = submitted && !title.trim();
  return (
    <Stack>
      <Card>
        <Heading>{copy("Alanlar ve doğrulama", "Fields and validation")}</Heading>
        <Field
          label={copy("Başlık", "Title")}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setSaved(false);
          }}
          placeholder={copy("Bir başlık yaz", "Enter a title")}
          error={required ? copy("Bu alan zorunlu.", "This field is required.") : undefined}
        />
        <Field
          label={copy("Açıklama", "Description")}
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <Row>
          <Button
            label={copy("Örneği kaydet", "Save sample")}
            onPress={() => {
              setSubmitted(true);
              setSaved(Boolean(title.trim()));
            }}
          />
          <Button
            label={copy("Sayfayı aç", "Open sheet")}
            tone="secondary"
            onPress={() => setSheet(true)}
          />
          <Button label={copy("Devre dışı", "Disabled")} disabled onPress={() => {}} />
        </Row>
        {saved ? (
          <Notice tone="success" message={copy("Örnek kaydedildi.", "Sample saved.")} />
        ) : null}
      </Card>
      <Card>
        <Heading>{copy("Seçim ve tercihler", "Selection and preferences")}</Heading>
        <ToggleField
          label={copy("Bildirimler", "Notifications")}
          value={notifications}
          onChange={setNotifications}
        />
        <Checkbox
          checked={checked}
          onCheckedChange={setChecked}
          label={copy("Dosyaları dahil et", "Include files")}
          className="min-h-touch"
        />
        <RadioGroup
          value={density}
          onValueChange={setDensity}
          accessibilityLabel={copy("Yoğunluk", "Density")}
        >
          <RadioGroup.Item value="compact" label={copy("Kompakt", "Compact")} />
          <RadioGroup.Item value="comfortable" label={copy("Rahat", "Comfortable")} />
        </RadioGroup>
        <Slider
          label={copy("Örnek ilerleme", "Sample progress")}
          value={range}
          min={0}
          max={100}
          step={10}
          onValueChange={setRange}
          showValue
        />
      </Card>
      <Card>
        <Heading>{copy("Durumlar", "States")}</Heading>
        <Row>
          <Avatar fallback="BY" size="sm" accessibilityLabel="bycoda" />
          <Badge label={copy("Hazır", "Ready")} />
          <Badge label={copy("Çalışıyor", "Running")} tone="live" />
          <Badge label={copy("Başarısız", "Failed")} tone="danger" />
        </Row>
        <Notice tone="warning" message={copy("Onay gerekiyor.", "Approval is required.")} />
        <Loading label={copy("Yükleniyor…", "Loading…")} />
        <Skeleton variant="content" />
        <Accordion>
          <Accordion.Item value="details">
            <Accordion.Trigger accessibilityLabel={copy("Ayrıntılar", "Details")}>
              <Accordion.Title>{copy("Ayrıntılar", "Details")}</Accordion.Title>
              <Accordion.Indicator />
            </Accordion.Trigger>
            <Accordion.Content>
              <Body>
                {copy(
                  "Ortak bileşenler iki temada da aynı davranışı korur.",
                  "Shared components keep the same behavior in both themes.",
                )}
              </Body>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </Card>
      <GalleryLayout />
      <Sheet
        visible={sheet}
        title={copy("Örnek sayfa", "Sample sheet")}
        onClose={() => setSheet(false)}
        dirty={!!title.trim() || !!description.trim()}
      >
        <Body>
          {copy(
            "Bu panel uygulamanın ortak geri, klavye ve odak davranışını kullanır.",
            "This panel uses the app’s shared back, keyboard and focus behavior.",
          )}
        </Body>
        <Field label={copy("Başlık", "Title")} value={title} onChangeText={setTitle}
          error={required ? copy("Bu alan zorunlu.", "This field is required.") : undefined} />
        <Field
          label={copy("Açıklama", "Description")}
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: metrics.multilineHeight * 2 }}
        />
        <ToggleField label={copy("Bildirimler", "Notifications")} value={notifications} onChange={setNotifications} />
        <GallerySheetActions
          error={required ? copy("Bu alan zorunlu.", "This field is required.") : undefined}
          onSubmit={() => {
            setSubmitted(true);
            if (title.trim()) { setSaved(true); setSheet(false); }
          }}
          onClose={() => setSheet(false)}
        />
      </Sheet>
    </Stack>
  );
}
