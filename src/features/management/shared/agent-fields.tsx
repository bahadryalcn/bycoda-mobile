import { Cpu } from "@/ui/duotone-icon";
import { useCopy } from "@/ui/copy";
import { useState } from "react";
import { catalogProviders } from "@/features/workspace/catalog";
import { ErrorText } from "@/ui/primitives";
import { NumberField } from "@/ui/number-field";
import { Body, Disclosure, IdentifierField, NavigationRow, QueryState, SelectField } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostModelCatalog } from "@/domain/types";
import type { AgentFieldsProps } from "./types";
import { providerSelectionOption } from "@/ui/provider-identity";
import { selectAgentModel, selectAgentProvider } from "./agent-model-selection";
import { AgentModelPicker } from "./agent-model-picker";
import { validAgentRunMinutes } from "../agent-model";

export function AgentFields({ value, onChange, projectId, disabled, onValidityChange, showRunLimit = true }: AgentFieldsProps) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const [minutes, setMinutes] = useState(String(value.maxRunMinutes));

  const [choosingModel, setChoosingModel] = useState(false);
  const minutesValid = validAgentRunMinutes(minutes);
  const models = useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    projectId ? { projectId } : {},
    {},
  );
  const available = models.data?.models[value.harness] ?? [];
  const providers = catalogProviders(machine?.providers, models.data);
  const selectedModel = available.find((model) => model.id === value.model);
  return (
    <>
      <SelectField
        label={copy("Ajan", "Agent")}
        value={value.harness}
        options={providers.map(providerSelectionOption)}
        disabled={disabled}
        onChange={(harness) => {
          if (harness !== value.harness)
            onChange(selectAgentProvider(value, harness, models.data));
        }}
      />
      {!providers.length && (
        <Body muted>
          {copy(
            "Bu bilgisayardaki ajanlar henüz alınamadı. Bağlantıyı yenileyin.",
            "Available agents on this computer have not been loaded. Refresh the connection.",
          )}
        </Body>
      )}
      <NavigationRow
        label={copy("Model", "Model")}
        detail={selectedModel?.name || value.model || copy("Model seç", "Choose model")}
        detailLines={2}
        icon={<Cpu size={20} color={colors.muted} />}
        disabled={disabled || !available.length}
        onPress={() => setChoosingModel(true)}
      />
      <Disclosure label={copy("Özel model kimliği", "Custom model ID")}>
        <IdentifierField

          label={copy("Model kimliği", "Model ID")}
          value={value.model}
          onChangeText={(model) => onChange(selectAgentModel(value, model, models.data))}
          editable={!disabled}
          placeholder={copy("Bilgisayardaki model kimliği", "Model ID on the computer")}
        />
      </Disclosure>
      {choosingModel ? <AgentModelPicker catalog={models.data} query={models} harness={value.harness}
        selected={value.model} disabled={disabled} returnFocusRef={undefined}
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
            const valid = validAgentRunMinutes(text);
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
