import type { ReactNode } from "react";
import { Body } from "./typography";
import { Notice } from "./feedback";
import { Disclosure } from "./disclosure";
import { useCopy } from "./copy";
import { View } from "react-native";
import { Button } from "./buttons";

/** Partial failures stay discoverable without an alert for every unavailable source. */
export function IssueSummary({ issues, onRetry, retryLabel, retrying, details }: { details?: ReactNode; issues: readonly (string | null | undefined)[]; onRetry?: () => void; retryLabel?: string; retrying?: boolean }) {
  const copy = useCopy();
  const unique = [...new Set(issues.filter((issue): issue is string => !!issue?.trim()))];
  if (!unique.length) return null;
  if (unique.length === 1 && details) return <View accessibilityLiveRegion="polite">{details}{onRetry ? <Button tone="quiet" label={retryLabel ?? copy("Yeniden dene", "Retry")} busy={retrying} onPress={onRetry} style={{alignSelf:"flex-start"}} /> : null}</View>;
  if (unique.length === 1) return <Notice tone="warning" message={unique[0]!} onRetry={onRetry} retryLabel={retryLabel} retrying={retrying} />;
  const summary = <Disclosure tone="warning"
    label={copy("Bazı bilgiler alınamadı ({p0}).", "Some information is unavailable ({p0}).", { p0: unique.length })}>
    {details ?? <Body selectable>{unique.join("\n\n")}</Body>}
  </Disclosure>;
  return <View accessibilityLiveRegion="polite">{onRetry ? <>{summary}<Button tone="quiet" label={retryLabel ?? copy("Yeniden dene", "Retry")} busy={retrying} onPress={onRetry} style={{ alignSelf: "flex-start" }} /></> : summary}</View>;
}
