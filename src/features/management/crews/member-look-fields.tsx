import { View } from "react-native";
import type { CrewAgent } from "@/remote/contracts/crews";
import { useCopy } from "@/ui/copy";
import { Button, IdentifierField, Row, SelectField, Stack } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { LOOK_PALETTES, LOOK_PARTS, handleError, handleFromInput, memberTraits, shuffledLook, withLookPart } from "./identity-model";
import { MemberAvatar } from "./member-avatar";

type Copy = ReturnType<typeof useCopy>;
type Part = keyof typeof LOOK_PARTS;

const LABELS: Record<string, [tr: string, en: string]> = {
  "flat-cap": ["Kasket", "Flat cap"], takke: ["Takke", "Takke"], beret: ["Bere", "Beret"], bald: ["Kel", "Bald"], "grey-hair": ["Beyaz saç", "Grey hair"],
  walrus: ["Morsa bıyık", "Walrus"], bushy: ["Gür sakal", "Bushy"], "short-beard": ["Kısa sakal", "Short beard"], "white-beard": ["Beyaz sakal", "White beard"], shaven: ["Tıraşlı", "Shaven"],
  cardigan: ["Hırka", "Cardigan"], vest: ["Yelek", "Vest"], jacket: ["Ceket", "Jacket"],
  none: ["Yok", "None"], tespih: ["Tespih", "Prayer beads"], magnifier: ["Büyüteç", "Magnifier"], brush: ["Fırça", "Brush"], notebook: ["Defter", "Notebook"], key: ["Anahtar", "Key"], wrench: ["İngiliz anahtarı", "Wrench"], pen: ["Kalem", "Pen"],
};
const label = (copy: Copy, value: string) => (LABELS[value] ? copy(LABELS[value][0], LABELS[value][1]) : value);

/** Handle and pixel look of one member; only rendered on hosts with `crews.identity.v1`. */
export function MemberLookFields({ member, disabled, onPatch }: {
  member: CrewAgent;
  disabled?: boolean;
  onPatch: (patch: Partial<CrewAgent>) => void;
}) {
  const copy = useCopy();
  const traits = memberTraits(member);
  const parts: [Part, string][] = [
    ["headwear", copy("Başlık", "Headwear")], ["face", copy("Yüz", "Face")],
    ["outfit", copy("Kıyafet", "Outfit")], ["accessory", copy("Aksesuar", "Accessory")],
  ];
  const choose = (patch: Partial<typeof traits>) => onPatch({ avatar: withLookPart(member, patch) });
  return (
    <Stack>
      <IdentifierField
        label={copy("Takma ad (@)", "Handle (@)")}
        hint={copy("Küçük harf, rakam ve tire; kütüphanede benzersiz olmalı.", "Lowercase letters, digits and hyphens; unique in the library.")}
        value={member.handle ?? ""}
        editable={!disabled}
        error={handleError(member.handle) ? copy("Geçerli bir takma ad girin (en fazla 24 karakter).", "Enter a valid handle (up to 24 characters).") : undefined}
        onChangeText={(text) => onPatch({ handle: handleFromInput(text) })}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <MemberAvatar member={member} size={56} />
        <Row>
          <Button tone="quiet" label={copy("Karıştır", "Shuffle")} disabled={disabled}
            onPress={() => onPatch({ avatar: shuffledLook(member, Math.floor(Math.random() * 1_000_000) + 1) })} />
          <Button tone="quiet" label={copy("Sıfırla", "Reset")} disabled={disabled || !member.avatar}
            onPress={() => onPatch({ avatar: undefined })} />
        </Row>
      </View>
      {parts.map(([part, title]) => (
        <SelectField key={part} label={title} value={traits[part]} disabled={disabled}
          options={LOOK_PARTS[part].map((value) => ({ value, label: label(copy, value) }))}
          onChange={(value) => choose({ [part]: value })} />
      ))}
      <SelectField label={copy("Renk", "Palette")} value={String(traits.palette)} disabled={disabled}
        options={LOOK_PALETTES.map((index) => ({ value: String(index), label: copy("Renk {p0}", "Palette {p0}", { p0: index + 1 }) }))}
        onChange={(value) => choose({ palette: Number(value) })} />
      <SelectField label={copy("Gözlük", "Glasses")} value={traits.glasses ? "yes" : "no"} disabled={disabled}
        options={[{ value: "no", label: copy("Yok", "None") }, { value: "yes", label: copy("Var", "Glasses") }]}
        onChange={(value) => choose({ glasses: value === "yes" })} />
    </Stack>
  );
}
