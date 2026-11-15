import { useMemo } from "react";
import { View } from "react-native";
import { MultiSelectField, SelectField } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { DELEGATION_LIMITS } from "../../../../src/shared/model/host-contracts/delegation";
import type { ImageModelId } from "../../../../src/shared/model/host-contracts/image-models";
import {
  effectiveImages,
  readDelegation,
  refKey,
  setAdvisor,
  setImageModels,
  setSubagents,
  type DelegateCandidate,
  type ImageChoice,
} from "./delegation-model";
import { providerName } from "./provider-choices";

/** Long candidate lists get a search box. */
const SEARCH_THRESHOLD = 6;

type Props = {
  candidates: readonly DelegateCandidate[];
  imageChoices: readonly ImageChoice[];
  settings: Record<string, string>;
  disabled?: boolean;
  onChange: (settings: Record<string, string>) => void;
};

/** bycoda's own delegation: one advisor (single select), several subagent models and the allowed image models (multi select). */
export function DelegationFields({
  candidates,
  imageChoices,
  settings,
  disabled,
  onChange,
}: Props) {
  const copy = useCopy();
  const current = readDelegation(settings);
  // Saved models the catalogue no longer offers stay visible and removable.
  const all = useMemo(() => {
    const known = new Set(candidates.map((item) => item.key));
    const saved = [...(current.advisor ? [current.advisor] : []), ...current.subagents]
      .map(unknownCandidate)
      .filter((item) => !known.has(item.key) && known.add(item.key));
    return [...saved, ...candidates];
  }, [candidates, settings]);
  const byKey = useMemo(() => new Map(all.map((item) => [item.key, item])), [all]);
  const options = all.map((item) => ({
    value: item.key,
    label: item.label,
    detail: providerName(item.provider),
    icon: (
      <ProviderAccountMark provider={item.provider} color={item.color} size={18} />
    ),
  }));
  const searchable = options.length > SEARCH_THRESHOLD;
  return (
    <View style={{ gap: space.lg }}>
      {options.length ? (
        <SelectField
          label={copy("Danışman", "Advisor")}
          value={current.advisor ? refKey(current.advisor) : ""}
          searchable={searchable}
          disabled={disabled}
          options={[{ value: "", label: copy("Kapalı", "Off") }, ...options]}
          onChange={(key) => onChange(setAdvisor(settings, byKey.get(key)?.ref))}
        />
      ) : null}
      {options.length ? (
        <MultiSelectField
          label={copy("Alt ajanlar", "Subagents")}
          values={current.subagents.map(refKey)}
          max={DELEGATION_LIMITS.subagentModels}
          searchable={searchable}
          disabled={disabled}
          placeholder={copy("Kapalı", "Off")}
          options={options}
          onChange={(keys) =>
            onChange(
              setSubagents(
                settings,
                keys.flatMap((key) => byKey.get(key)?.ref ?? []),
              ),
            )
          }
        />
      ) : null}
      {imageChoices.length ? (
        <MultiSelectField
          label={copy("Görsel modelleri", "Image models")}
          values={effectiveImages(settings, imageChoices)}
          disabled={disabled}
          placeholder={copy("Kapalı", "Off")}
          options={imageChoices.map((choice) => ({ value: choice.id, label: choice.name }))}
          onChange={(ids) =>
            onChange(setImageModels(settings, ids as ImageModelId[], imageChoices))
          }
        />
      ) : null}
    </View>
  );
}

function unknownCandidate(ref: {
  harness: DelegateCandidate["provider"];
  model: string;
  providerAccountId?: string;
}): DelegateCandidate {
  const name = ref.model.replace(new RegExp(`^${ref.harness}:`), "");
  return { ref, key: refKey(ref), provider: ref.harness, name, label: name };
}
