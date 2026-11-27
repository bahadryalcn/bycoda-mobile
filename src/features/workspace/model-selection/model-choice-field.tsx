import type { ReactNode } from "react";
import { View } from "react-native";
import { Body, Disclosure, Notice, SegmentedControl, SelectField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { usePersistentError } from "@/ui/use-persistent-error";
import type {
  ModelRoutingItemChoice,
  ModelRoutingRole,
  ModelRoutingTarget,
} from "../../../../../src/shared/model/host-contracts/model-routing";
import type { HostModelCatalog } from "../wire";
import {
  choiceEntries,
  choiceForGroup,
  choiceForMode,
  choiceMode,
  groupValue,
  targetLabel,
  type ChoiceMode,
} from "./model-choice-model";
import { useModelRouting, useModelRoutingResolution, useModelRoutingSupported } from "./use-model-routing";

/** Preview length of the order/group list. */
const PREVIEW = 5;

export type ModelChoiceFieldProps = {
  /** The Host role a "Use settings" choice follows (task.worker, goal.planner, steward, automation…). */
  role: ModelRoutingRole;
  /** The item's stored `modelChoice`; undefined predates routing and is shown as Fixed. */
  value: ModelRoutingItemChoice | undefined;
  onChange: (value: ModelRoutingItemChoice | undefined) => void;
  /** Item forms follow the role with "Use settings"; surfaces bound to one role do not. */
  allowDefault?: boolean;
  /**
   * The surface's own fixed-model field (the shared model picker). Shown for Fixed; for the
   * other modes it is the fallback the Host uses when no model order is set up, in a disclosure.
   */
  fixed: ReactNode;
  /** Open the fallback disclosure, e.g. while the fallback model is still missing. */
  fallbackOpen?: boolean;
  /** Extra content under the fixed/fallback model (e.g. a crew member's saved candidates). */
  fixedFooter?: ReactNode;
  /** The item's fixed model, for the Host's preview of a fixed role binding. */
  fixedTarget?: ModelRoutingTarget;
  catalog?: HostModelCatalog;
  disabled?: boolean;
};

/**
 * The one model selection of work items, the mobile form of desktop `ModelChoiceField`:
 * Use settings | Any model | Fixed. "Any model" picks the computer's model order or one model
 * group and previews the models it walks; the order itself is edited on desktop. Hosts without
 * `models.routing.v1` show only the fixed picker, exactly as before.
 */
export function ModelChoiceField(props: ModelChoiceFieldProps) {
  const supported = useModelRoutingSupported();
  if (!supported) return <>{props.fixed}{props.fixedFooter}</>;
  return <RoutingChoice {...props} />;
}

function RoutingChoice({
  role,
  value,
  onChange,
  allowDefault = true,
  fixed,
  fixedTarget,
  fallbackOpen,
  fixedFooter,
  catalog,
  disabled,
}: ModelChoiceFieldProps) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const routing = useModelRouting();
  // Loaded groups stay usable when a refresh fails; only a lasting failure without groups is reported.
  const routingFailed = !!usePersistentError(routing.isError && routing.data === undefined ? routing.error : null);
  const state = routing.data;
  const mode = choiceMode(value);
  const resolution = useModelRoutingResolution(role, value ?? { kind: "fixed" }, {
    enabled: mode !== "fixed" && !!state,
    version: state?.version,
    fixed: fixedTarget,
  });
  const defaultLabel = copy("Varsayılan hesap", "Default account");
  const pools = state?.pools ?? [];
  const poolId = groupValue(value);
  const missingPool = !!poolId && !!state && !pools.some((pool) => pool.id === poolId);
  const walked = choiceEntries(state, value);
  const groupName = value?.kind === "pool" ? pools.find((pool) => pool.id === value.poolId)?.name ?? value.poolId : undefined;
  const modes: { value: ChoiceMode; label: string; disabled?: boolean }[] = [
    ...(allowDefault ? [{ value: "default" as const, label: copy("Ayarları kullan", "Use settings"), disabled }] : []),
    { value: "any", label: copy("Herhangi bir model", "Any model"), disabled },
    { value: "fixed", label: copy("Sabit", "Fixed"), disabled },
  ];
  const resolved = resolution.data;
  const preview = resolved?.ok
    ? (() => {
        const label = targetLabel(resolved.target, catalog, defaultLabel);
        return copy("Sonraki çalışma: {p0}", "Next run uses {p0}", { p0: `${label.name} · ${label.detail}` });
      })()
    : resolved?.reason === "notConfigured"
      ? copy("Model sırası henüz yok; öğenin kendi modeli kullanılır.", "No model order yet; the item's own model is used.")
      : resolved?.reason === "noEligibleEntry"
        ? copy("Şu anda uygun model yok; iş bir model uygun olana kadar bekler.", "No model is available right now; work waits until one is.")
        : undefined;
  return (
    <View style={{ gap: space.sm }}>
      <SegmentedControl
        label={copy("Model seçimi", "Model choice")}
        value={mode}
        options={modes}
        disabled={disabled}
        onChange={(next) => onChange(choiceForMode(next, value))}
      />
      {mode === "fixed" ? <>{fixed}{fixedFooter}</> : null}
      {mode === "any" ? (
        <SelectField
          label={copy("Model grubu", "Model group")}
          value={poolId}
          disabled={disabled || !state}
          options={[
            { value: "", label: copy("Herhangi bir model, sırayla", "Any model, in order") },
            ...pools.map((pool) => ({ value: pool.id, label: pool.name })),
            ...(missingPool ? [{ value: poolId, label: copy("Grup bulunamadı: {p0}", "Group not found: {p0}", { p0: poolId }), disabled: true }] : []),
          ]}
          onChange={(next) => onChange(choiceForGroup(next))}
        />
      ) : null}
      {mode !== "fixed" && preview ? <Body muted style={uiStyles.caption}>{preview}</Body> : null}
      {mode !== "fixed" && routingFailed ? (
        <Notice
          message={copy(
            "Model grupları yüklenemedi. Yine de sabit bir model seçebilirsiniz.",
            "Model groups could not be loaded. You can still choose a fixed model.",
          )}
          action={{ label: copy("Yeniden dene", "Try again"), onPress: () => { void routing.refetch().catch(() => {}); } }}
        />
      ) : null}
      {mode === "any" && state && walked ? (
        <Disclosure
          label={groupName ?? copy("Model sırası", "Model order")}
          detail={copy("{p0} model", "{p0} models", { p0: walked.length })}
        >
          {walked.slice(0, PREVIEW).map((entry, index) => {
            const label = targetLabel(entry, catalog, defaultLabel);
            return (
              <Body key={entry.id} selectable={false}>
                {`${index + 1}. ${label.name}`}
                <Body muted style={uiStyles.caption}>{`  ${label.detail}`}</Body>
              </Body>
            );
          })}
          {walked.length > PREVIEW ? (
            <Body muted style={uiStyles.caption}>
              {copy("+{p0} model daha", "+{p0} more models", { p0: walked.length - PREVIEW })}
            </Body>
          ) : null}
          {/* The computer's model order and groups are defaults: edited on desktop only. */}
          <Body muted style={uiStyles.caption}>
            {value?.kind === "order"
              ? copy("Model sırası bilgisayardaki bycoda’da düzenlenir.", "The model order is edited in bycoda on the computer.")
              : copy("Model grupları bilgisayardaki bycoda’da düzenlenir.", "Model groups are edited in bycoda on the computer.")}
          </Body>
        </Disclosure>
      ) : null}
      {mode !== "fixed" ? (
        <Disclosure
          label={copy("Yedek model", "Fallback model")}
          detail={copy("Model sırası kurulmamışsa kullanılır.", "Used when no model order is set up.")}
          defaultExpanded={fallbackOpen}
        >
          {fixed}
          {fixedFooter}
        </Disclosure>
      ) : null}
    </View>
  );
}
