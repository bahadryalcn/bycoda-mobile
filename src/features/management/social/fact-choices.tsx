import { Body, MultiSelectField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { missingFactIds } from "../social-content";
import type { FactChoicesProps } from "./types";

export function FactChoices({ profile, selected, onChange, disabled }: FactChoicesProps) {
  const copy = useCopy();
  const facts = profile?.facts ?? [];
  const missing = missingFactIds(selected, facts);
  return (
    <>
      <MultiSelectField
        label={copy("Doğrulanmış bilgiler", "Verified facts")}
        values={selected}
        options={[
          ...facts.map((fact) => ({ value: fact.id, label: fact.topic, detail: fact.text })),
          ...missing.map((id) => ({
            value: id,
            label: copy("Kaldırılmış bilgi: " + id, "Removed fact: " + id),
          })),
        ]}
        disabled={disabled}
        onChange={onChange}
      />
      {missing.length ? (
        <Body>
          {copy(
            "Kaldırılmış bilgilerin seçimini kaldırın ve kaydetmeden önce metni inceleyin.",
            "Unselect removed facts and review the text before saving.",
          )}
        </Body>
      ) : null}
    </>
  );
}
