import { useCopy } from "@/ui/copy";
import { useEffect, useState } from "react";
import { ErrorText } from "@/ui/primitives";
import { Body, Disclosure, Field, IdentifierField, QueryState, SelectField } from "@/ui/primitives";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostModelCatalog } from "@/domain/types";
import { effectiveAgentModel } from "../agent-model";
import type { AgentFieldsProps } from "./types";

export function AgentFields({ value, onChange, projectId, disabled, onValidityChange }: AgentFieldsProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [minutes, setMinutes] = useState(String(value.maxRunMinutes));
  const minutesValid = /^\d+$/.test(minutes) && Number(minutes) <= 10080;
  useEffect(() => { onValidityChange?.(minutesValid); }, [minutesValid, onValidityChange]);
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    { enabled: !!projectId },
  );
  const available = models.data?.models[value.harness] ?? [];
  const effectiveModel = effectiveAgentModel(value.model, value.harness, models.data);
  return (
    <>
      <SelectField
        label={copy("Ajan", "Agent")}
        value={value.harness}
        options={(machine?.providers ?? []).map((provider) => ({
          value: provider,
          label: provider,
        }))}
        disabled={disabled}
        onChange={(harness) => {
          if (harness !== value.harness)
            onChange({ ...value, harness, model: models.data?.models[harness]?.[0]?.id ?? "" });
        }}
      />
      {!machine?.providers?.length && (
        <Body muted>
          {copy(
            "Bu bilgisayardaki ajanlar henüz alınamadı. Bağlantıyı yenileyin.",
            "Available agents on this computer have not been loaded. Refresh the connection.",
          )}
        </Body>
      )}
      {available.length ? (
        <SelectField
          label={copy("Model", "Model")}
          value={effectiveModel}
          options={available.map((model) => ({ value: model.id, label: model.name ?? model.id }))}
          disabled={disabled}
          onChange={(model) => onChange({ ...value, model })}
        />
      ) : (
        <IdentifierField
          label={copy("Model", "Model")}
          value={effectiveModel}
          onChangeText={(model) => onChange({ ...value, model })}
          editable={!disabled}
          placeholder={copy("Bilgisayardaki model kimliği", "Model ID on the computer")}
        />
      )}
      <Disclosure label={copy("Gelişmiş seçenekler", "Advanced options")}>
        <SelectField
          label={copy("İzinler", "Permissions")}
          value={value.runtimeMode}
          options={[
            { value: "supervised", label: copy("Onay iste", "Ask for approval") },
            {
              value: "auto-accept-edits",
              label: copy("Düzenlemeleri otomatik kabul et", "Auto-accept edits"),
            },
            { value: "auto", label: copy("Otomatik inceleme", "Automatic review") },
            { value: "full-access", label: copy("Tam erişim", "Full access") },
          ]}
          disabled={disabled}
          onChange={(runtimeMode) => onChange({ ...value, runtimeMode })}
        />
        <Field
          label={copy(
            "Çalışma sınırı (dakika, 0 = sınırsız)",
            "Run limit (minutes, 0 = unlimited)",
          )}
          value={minutes}
          onChangeText={(text) => {
            setMinutes(text);
            if (/^\d+$/.test(text) && Number(text) <= 10080) onChange({ ...value, maxRunMinutes: Number(text) });
          }}
          editable={!disabled}
          keyboardType="number-pad"
        />
        {!minutesValid && <ErrorText error={copy("0 ile 10080 arasında dakika girin.", "Enter minutes from 0 to 10080.")} />}
      </Disclosure>
      <QueryState query={models} loading="inline" />
    </>
  );
}
