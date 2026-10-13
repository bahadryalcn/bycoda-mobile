import * as Linking from "expo-linking";
import {
  Body,
  Button,
  Card,
  ChoiceChip,
  Heading,
  MutationState,
  Row,
  ErrorNotice,
  QueryState,
  Disclosure,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import type { SocialOAuthBegin } from "@/remote/types";
import { socialRequest as request } from "./request";
import type { AccountCardProps, OAuthStatus } from "./types";
import { socialLabel } from "./labels";

export function AccountCard({ account, state, projectId }: AccountCardProps) {
  const copy = useCopy();
  const action = useHostMutation("social.request", ["social"]);
  const begin = useHostMutation<SocialOAuthBegin>("social.oauth.begin", ["social"]);
  const select = useHostMutation("social.oauth.select", ["social"]);
  const oauth = useHostQuery<OAuthStatus>(
    ["social", "oauth", account.id],
    "social.oauth.status",
    { accountId: account.id },
    { enabled: !account.connected, interval: !account.connected ? 5000 : undefined },
  );
  const connection = useAsyncAction();
  const busy = connection.isPending || action.isPending || select.isPending;
  return (
    <Card>
      <Heading>{account.name}</Heading>
      <Body muted>
        {account.platform} ·{" "}
        {account.connected ? copy("Bağlı", "Connected") : copy("Bağlı değil", "Disconnected")} ·{" "}
        {account.paused ? copy("Duraklatıldı", "Paused") : copy("Etkin", "Active")}
      </Body>
      <Disclosure label={copy("Yetenekler", "Capabilities")}>
      <Body muted>
        {state.capabilities[account.id]
          ?.map((capability) => `${socialLabel(capability.operation, copy)}: ${socialLabel(capability.status, copy)}`)
          .join(" · ")}
      </Body>
      </Disclosure>
      <Row>
        {!account.connected && account.connection !== "browser" && (
          <Button
            label={copy("OAuth ile bağla", "Connect with OAuth")}
            busy={connection.isPending}
            disabled={busy}
            onPress={() => {
              void connection.run(async () => {
                const result = await begin.mutateAsync({ accountId: account.id });
                await Linking.openURL(result.url);
              });
            }}
          />
        )}
        {account.connection === "browser" && !account.connected && (
          <Body muted>
            {copy(
              "X tarayıcı hesabını bilgisayardaki bycoda ile bağlayın.",
              "Connect the X browser account in bycoda on the computer.",
            )}
          </Body>
        )}
        <Button
          label={account.paused ? copy("Devam et", "Resume") : copy("Duraklat", "Pause")}
          busy={action.isPending}
          disabled={busy}
          onPress={() =>
            action.mutate(
              request("accounts.pause", { accountId: account.id, paused: !account.paused }),
            )
          }
        />
        {account.connected && (
          <Button
            label={copy("Bağlantıyı kes", "Disconnect")}
            disabled={busy}
            onPress={() =>
              confirmAction(
                copy("Hesap bağlantısını kes", "Disconnect account"),
                copy(
                  "Bu host hesabın erişim bilgilerini kaldıracak ve hesap duraklatılacak.",
                  "This host will remove the account credentials and pause the account.",
                ),
                copy("Bağlantıyı kes", "Disconnect"),
                () => action.mutate(request("accounts.disconnect", { accountId: account.id })),
              )
            }
          />
        )}
      </Row>
      {oauth.data?.candidates?.map((candidate) => (
        <Button
          key={candidate.id}
          label={candidate.name}
          busy={select.isPending && select.variables?.candidateId === candidate.id}
          disabled={busy}
          onPress={() => select.mutate({ accountId: account.id, candidateId: candidate.id })}
        />
      ))}
      {projectId && (
        <Disclosure label={copy("Seçili projenin izinleri", "Selected project permissions")}>
          <Row>
            {(["read", "draft", "publish", "reply", "message", "comment"] as const).map(
              (permission) => {
                const selected = account.grants[projectId]?.includes(permission);
                return (
                  <ChoiceChip
                    key={permission}
                    label={socialLabel(permission, copy)}
                    selected={!!selected}
                    disabled={busy}
                    onPress={() =>
                      confirmAction(
                        copy("Proje iznini değiştir", "Change project permission"),
                        `${socialLabel(permission, copy)} · ${account.name}`,
                        copy("Kaydet", "Save"),
                        () =>
                          action.mutate(
                            request("accounts.grants", {
                              accountId: account.id,
                              projectId,
                              permissions: selected
                                ? (account.grants[projectId] ?? []).filter(
                                    (value) => value !== permission,
                                  )
                                : [...(account.grants[projectId] ?? []), permission],
                            }),
                          ),
                      )
                    }
                  />
                );
              },
            )}
          </Row>
        </Disclosure>
      )}
      <MutationState mutation={action} />
      <MutationState mutation={connection} />
      <MutationState mutation={select} />
      {!account.connected && <QueryState query={oauth} loading="inline" />}
      <ErrorNotice error={oauth.data?.error} />
    </Card>
  );
}
