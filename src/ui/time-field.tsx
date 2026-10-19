import { useState } from "react";
import { View } from "react-native";
import { SelectField } from "./select-field";
import { space } from "./tokens";
import { useCopy } from "./copy";
import { Button } from "./buttons";
import { NavigationGroup, NavigationRow } from "./navigation-row";
import { Sheet } from "./dialogs";
import { Row } from "./layout";

/** A host-local wall time, without converting it to the phone's timezone. */
export function TimeField({ label, value, onChange, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const copy = useCopy();
  const [draft, setDraft] = useState<{ hour: number; minute: number } | null>(null);
  return <>
    <NavigationGroup><NavigationRow label={label} detail={value} disabled={disabled} onPress={() => {
      const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      const [hour, minute] = valid ? value.split(":").map(Number) : [9, 0];
      setDraft({ hour: hour!, minute: minute! });
    }} /></NavigationGroup>
    {draft ? <Sheet visible title={label} size="compact" onClose={() => setDraft(null)}
      footer={<Row style={{ justifyContent: "space-between" }}>
        <Button label={copy("Vazgeç", "Cancel")} tone="quiet" onPress={() => setDraft(null)} />
        <Button label={copy("Uygula", "Apply")} tone="primary" disabled={disabled} onPress={() => {
          onChange(`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`);
          setDraft(null);
        }} />
      </Row>}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <View style={{ flexGrow: 1, flexBasis: 120, minWidth: 0 }}>
          <SelectField label={copy("Saat", "Hour")} value={String(draft.hour)} disabled={disabled} searchable
            options={Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: String(hour).padStart(2, "0") }))}
            onChange={(hour) => setDraft({ ...draft, hour: Number(hour) })} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 120, minWidth: 0 }}>
          <SelectField label={copy("Dakika", "Minute")} value={String(draft.minute)} disabled={disabled} searchable
            options={Array.from({ length: 60 }, (_, minute) => ({ value: String(minute), label: String(minute).padStart(2, "0") }))}
            onChange={(minute) => setDraft({ ...draft, minute: Number(minute) })} />
        </View>
      </View>
    </Sheet> : null}
  </>;
}
