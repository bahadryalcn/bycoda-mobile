import { providerStateLabel } from "./provider-labels";
import type { ProviderConnectionsProps, ProviderInboxFeedbackProps, ProviderInboxRowProps } from "./provider-component-types";
import {
  Badge,
  Body,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { IssueSummary } from "@/ui/issue-summary";
import { providerName } from "./provider-model";
import { IssueRecordRow } from "./issue-record-row";

export {
  type ProviderConnectionsProps,
  type ProviderInboxFeedbackProps,
  type ProviderInboxRowProps,
} from "./provider-component-types";

export function ProviderConnections({ providers, onRetry, retrying }: ProviderConnectionsProps) {
  const copy = useCopy();
  return (
    <>
      <Row>
        {providers.map((provider) => (
          <Badge
            key={provider.provider}
            label={`${providerName(provider.provider)} · ${copy(
              provider.connected ? "bağlı" : "bağlı değil",
              provider.connected ? "connected" : "disconnected",
            )}`}
            tone={provider.connected ? "success" : "default"}
          />
        ))}
      </Row>
      <IssueSummary issues={providers.filter((provider) => provider.error).map((provider) => `${providerName(provider.provider)}: ${provider.error}`)}
        onRetry={onRetry} retrying={retrying} />
      {!providers.some((provider) => provider.connected) ? (
        <Body muted>
          {copy(
            "Hesapları bilgisayarındaki Bycoda ayarlarından bağla.",
            "Connect accounts in Bycoda settings on your computer.",
          )}
        </Body>
      ) : null}
    </>
  );
}

export function ProviderInboxFeedback({ result, onRetry, retrying }: ProviderInboxFeedbackProps) {
  const copy = useCopy();
  return (
    <>
      <IssueSummary issues={Object.entries(result.errors).map(([provider, error]) =>
        `${providerName(provider)}: ${error}\n${copy("Bu servisin kayıtları güncel olmayabilir.", "This provider’s items may be out of date.")}`)}
        onRetry={onRetry} retrying={retrying} />
    </>
  );
}

export function ProviderInboxRow({ item, onOpen }: ProviderInboxRowProps) {
  const copy = useCopy();
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
          onPress={() => onOpen(item)}
        />;
}
