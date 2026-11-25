import { providerStateLabel, providerStateTone } from "./provider-labels";
import type { ProviderConnectionsProps, ProviderInboxFeedbackProps, ProviderInboxRowProps } from "./provider-component-types";
import {
  Badge,
  Body,
  Row,
  Stack,
  StatusText,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { IssueSummary } from "@/ui/issue-summary";
import { providerName } from "./provider-model";
import { useRelativeTime } from "../management/shared/record-bits";
import { IssueRecordRow } from "./issue-record-row";
import { PullRequestStateBadge } from "../workspace/pull-request-state-badge";

export {
  type ProviderConnectionsProps,
  type ProviderInboxFeedbackProps,
  type ProviderInboxRowProps,
} from "./provider-component-types";

export function ProviderConnections({ providers, onRetry, retrying }: ProviderConnectionsProps) {
  const copy = useCopy();
  return (
    <>
      <Stack>
        {providers.map((provider) => (
          <Row key={provider.provider} style={{ flexWrap: "nowrap", minHeight: 48 }}>
            <Body style={{ flex: 1, minWidth: 0 }}>{providerName(provider.provider)}</Body>
            {/* Connected is a green badge; a missing account is a muted word with the way to fix it below. */}
            {provider.connected
              ? <Badge tone="success" label={copy("Bağlı", "Connected")} />
              : <StatusText label={copy("Bağlı değil", "Not connected")} />}
          </Row>
        ))}
      </Stack>
      <IssueSummary issues={providers.filter((provider) => provider.error).map((provider) => `${providerName(provider.provider)}: ${provider.error}`)}
        onRetry={onRetry} retrying={retrying} />
      {providers.some((provider) => !provider.connected) ? (
        <Body muted>
          {copy(
            "Hesapları bilgisayarındaki Bycoda ayarlarından bağla; burada yalnızca durumu görünür.",
            "Connect accounts in Bycoda settings on your computer; only their status shows here.",
          )}
        </Body>
      ) : null}
    </>
  );
}

export function ProviderInboxFeedback({ result, onRetry, retrying }: ProviderInboxFeedbackProps) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  return (
    <>
      <IssueSummary issues={Object.entries(result.errors).map(([provider, error]) =>
        `${providerName(provider)}: ${error}\n${copy("Bu servisin kayıtları güncel olmayabilir.", "This provider’s items may be out of date.")}`)}
        onRetry={onRetry} retrying={retrying} />
      {result.omittedProjects?.length ? (
        <Body muted style={uiStyles.caption}>
          {copy(
            "{p0} proje bu listede gösterilmiyor. Kapsamdan bir proje seçerek kayıtlarını görebilirsin.",
            "{p0} projects are not shown in this list. Choose one in the scope to see its items.",
            { p0: String(result.omittedProjects.length) },
          )}
        </Body>
      ) : null}
    </>
  );
}

export function ProviderInboxRow({ item, onOpen }: ProviderInboxRowProps) {
  const copy = useCopy();
  const relative = useRelativeTime();
  const stamp = Date.parse(item.updatedAt);
  const updated = Number.isFinite(stamp) ? relative(stamp) : "";
  return <IssueRecordRow
          label={item.title}
          detail={[
            providerName(item.provider),
            item.identifier ?? `#${item.number}`,
            item.repo || item.projectPath,
          ]
            .filter(Boolean)
            .join(" · ")}
          state={providerStateLabel(item.state, copy)}
          stateTone={providerStateTone(item.state)}
          stateBadge={item.state.toUpperCase() === "MERGED" ? <PullRequestStateBadge state={item.state} label={providerStateLabel(item.state, copy)} /> : undefined}
          extraBadges={[...(item.draft ? [copy("Taslak", "Draft")] : []), ...(item.provider === "jira" && item.priority ? [item.priority] : [])]}
          caption={[item.assignees?.[0]?.login, updated].filter(Boolean).join(" · ") || undefined}
          onPress={() => onOpen(item)}
        />;
}
