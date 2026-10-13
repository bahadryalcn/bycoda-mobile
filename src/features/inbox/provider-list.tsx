import { providerStateLabel } from "./provider-labels";
import type { ProviderConnectionsProps, ProviderInboxItemsProps } from "./provider-component-types";
import {
  Badge,
  Body,
  Button,
  Disclosure,
  NavigationRow,
  Card,
  Heading,
  Notice,
  Row,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { inboxItemKey, providerName } from "./provider-model";

export {
  type ProviderConnectionsProps,
  type ProviderInboxItemsProps,
} from "./provider-component-types";

export function ProviderConnections({ providers }: ProviderConnectionsProps) {
  const copy = useCopy();
  return (
    <Disclosure
      label={copy("Bağlı servisler", "Connected services")}
      detail={
        providers
          .filter((provider) => provider.connected)
          .map((provider) => providerName(provider.provider))
          .join(" · ") || copy("Bağlı hesap yok", "No connected accounts")
      }
    >
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
      {providers
        .filter((provider) => provider.error)
        .map((provider) => (
          <Notice
            tone="warning"
            key={provider.provider}
            message={`${providerName(provider.provider)}: ${provider.error}`}
          />
        ))}
      {!providers.some((provider) => provider.connected) ? (
        <Body muted>
          {copy(
            "Hesapları bilgisayarındaki Bycoda ayarlarından bağla.",
            "Connect accounts in Bycoda settings on your computer.",
          )}
        </Body>
      ) : null}
    </Disclosure>
  );
}

export function ProviderInboxItems({ result, limit, onOpen, onMore }: ProviderInboxItemsProps) {
  const copy = useCopy();
  return (
    <>
      {Object.entries(result.errors).map(([provider, error]) => (
        <Notice tone="warning" key={provider} message={`${providerName(provider)}: ${error}`}>
          <Body muted>
            {copy(
              "Bu servisin kayıtları güncel olmayabilir.",
              "This provider’s items may be out of date.",
            )}
          </Body>
        </Notice>
      ))}
      <Body muted>
        {result.items.length} {copy("kayıt", "items")}
      </Body>
      {result.items.slice(0, limit).map((item) => (
        <NavigationRow
          key={inboxItemKey(item)}
          label={item.title}
          detail={[
            providerName(item.provider),
            item.identifier ?? `#${item.number}`,
            item.repo || item.projectPath,
          ]
            .filter(Boolean)
            .join(" · ")}
          trailing={<Badge label={providerStateLabel(item.state, copy)} />}
          onPress={() => onOpen(item)}
        />
      ))}
      {result.items.length > limit ? (
        <Button label={copy("Daha fazla göster", "Show more")} onPress={onMore} />
      ) : null}
    </>
  );
}
