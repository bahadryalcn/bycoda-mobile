import { providerStateLabel } from "./provider-labels";
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
import CircleDot from "lucide-react-native/icons/circle-dot";
import GitMerge from "lucide-react-native/icons/git-merge";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import GitPullRequestClosed from "lucide-react-native/icons/git-pull-request-closed";
import GitPullRequestDraft from "lucide-react-native/icons/git-pull-request-draft";
import { ProviderMark } from "./provider-mark";
import { isPullRequest, statusCategory, statusTone } from "./provider-view-model";

export {
  type ProviderConnectionsProps,
  type ProviderInboxFeedbackProps,
  type ProviderInboxRowProps,
} from "./provider-component-types";

export function ProviderConnections({ providers, onRetry, retrying }: ProviderConnectionsProps) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  return (
    <>
      <Stack>
        {providers.map((provider) => (
          <Row key={provider.provider} style={{ flexWrap: "nowrap", minHeight: 48 }}>
            <ProviderMark provider={provider.provider} size={20} />
            <Stack style={{ flex: 1, minWidth: 0, gap: 0 }}>
              <Body>{providerName(provider.provider)}</Body>
              {/* A missing account says where it is connected: only the computer holds credentials. */}
              {provider.connected ? null : <Body muted style={uiStyles.caption}>
                {copy("Bilgisayarda: Ayarlar → Gelen kutusu → {p0}", "On your computer: Settings → Inbox → {p0}", { p0: providerName(provider.provider) })}
              </Body>}
            </Stack>
            {provider.connected
              ? <Badge tone="success" label={copy("Bağlı", "Connected")} />
              : <StatusText label={copy("Bağlı değil", "Not connected")} />}
          </Row>
        ))}
      </Stack>
      <IssueSummary issues={providers.filter((provider) => provider.error).map((provider) => `${providerName(provider.provider)}: ${provider.error}`)}
        onRetry={onRetry} retrying={retrying} />
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
  const state = providerStateLabel(item.state, copy);
  const category = statusCategory(item);
  const pr = isPullRequest(item);
  // The type glyph inside the status badge: issue, pull request, draft, merged or closed PR.
  const TypeIcon = !pr ? CircleDot : category === "merged" ? GitMerge : category === "draft" ? GitPullRequestDraft
    : category === "closed" ? GitPullRequestClosed : GitPullRequest;
  const type = pr ? item.provider === "gitlab" ? copy("Merge request", "Merge request") : copy("Pull request", "Pull request")
    : copy("Issue", "Issue");
  return <IssueRecordRow
          icon={<ProviderMark provider={item.provider} />}
          label={item.title}
          detail={[
            providerName(item.provider),
            item.identifier ?? `#${item.number}`,
            item.repo || item.projectPath,
          ]
            .filter(Boolean)
            .join(" · ")}
          state={`${type} · ${state}`}
          // One tone owner (statusTone): an ordinary state is quiet text; only one to act on is a badge.
          stateTone={statusTone(item)}
          stateBadge={statusTone(item) === "danger" || statusTone(item) === "warning" ? <Badge icon={TypeIcon} tone={statusTone(item)} label={state} /> : undefined}
          extraBadges={[...(item.draft ? [copy("Taslak", "Draft")] : []), ...(item.provider === "jira" && item.priority ? [item.priority] : [])]}
          caption={[item.assignees?.[0]?.login ? copy("Atanan: {p0}", "Assignee: {p0}", { p0: item.assignees[0].login }) : "", updated].filter(Boolean).join(" · ") || undefined}
          onPress={() => onOpen(item)}
        />;
}
