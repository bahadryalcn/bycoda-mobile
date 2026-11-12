import { useCopy } from "@/ui/copy";
import { useRef, useState, type ComponentRef } from "react";
import { space } from "@/ui/tokens";
import { ErrorText } from "@/ui/primitives";
import { NumberField } from "@/ui/number-field";
import { Body, Button, Disclosure, IdentifierField, QueryState, SelectField } from "@/ui/primitives";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostModelCatalog } from "@/domain/types";
import type { AgentFieldsProps } from "./types";
import { providerSelectionOption } from "@/ui/provider-identity";
import { selectAgentModel, selectAgentProvider } from "./agent-model-selection";
import { AgentModelPicker } from "./agent-model-picker";

export function AgentFields({ value, onChange, projectId, disabled, onValidityChange, showRunLimit = true }: AgentFieldsProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [minutes, setMinutes] = useState(String(value.maxRunMinutes));
  const modelInput = useRef<ComponentRef<typeof IdentifierField>>(null);
  const [choosingModel, setChoosingModel] = useState(false);
  const minutesValid = /^\d+$/.test(minutes) && Number(minutes) <= 10080;
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    { enabled: !!projectId },
  );
  const available = models.data?.models[value.harness] ?? [];
  return (
    <>
      <SelectField
        label={copy("Ajan", "Agent")}
        value={value.harness}
        options={(machine?.providers ?? []).map(providerSelectionOption)}
        disabled={disabled}
        onChange={(harness) => {
          if (harness !== value.harness)
            onChange(selectAgentProvider(value, harness, models.data));
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
      <IdentifierField
          ref={modelInput}
          label={copy("Model", "Model")}
          value={value.model}
          onChangeText={(model) => onChange(selectAgentModel(value, model, models.data))}
          editable={!disabled}
          placeholder={copy("Bilgisayardaki model kimliği", "Model ID on the computer")}
          hint={copy("Model kimliği girin veya katalogdan seçin. Özel model kimlikleri kullanılabilir.", "Enter a model ID or choose from the catalogue. Custom model IDs are supported.")}
        />
      <Button
        tone="quiet"
        style={{ marginStart: -space.md }}
        label={copy("Katalogdan seç", "Choose from catalogue")}
        disabled={disabled || !available.length}
        onPress={() => { setChoosingModel(true); }}
      />
      {choosingModel ? <AgentModelPicker catalog={models.data} query={models} harness={value.harness}
        selected={value.model} disabled={disabled} returnFocusRef={modelInput}
        onSelect={model => onChange(selectAgentModel(value, model, models.data))}
        onClose={() => setChoosingModel(false)} /> : null}
      <Disclosure label={copy("Ajan ayarları", "Agent settings")}
        feedback={showRunLimit && !minutesValid ? <ErrorText error={copy("0 ile 10080 arasında dakika girin.", "Enter minutes from 0 to 10080.")} /> : null}>
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
        {showRunLimit ? <><NumberField
          label={copy(
            "Çalışma sınırı (dakika, 0 = sınırsız)",
            "Run limit (minutes, 0 = unlimited)",
          )}
          value={minutes}
          onChangeText={(text) => {
            setMinutes(text);
            const valid = /^\d+$/.test(text) && Number(text) <= 10080;
            onValidityChange?.(valid);
            if (valid) onChange({ ...value, maxRunMinutes: Number(text) });
          }}
          editable={!disabled}
        />
        </> : null}
      </Disclosure>
      {!choosingModel ? <QueryState query={models} loading="inline" /> : null}
    </>
  );
}
