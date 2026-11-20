import { useMemo, useState, type ReactNode } from "react";
import { tunnelSupported } from "../../../modules/bycoda-host-socket";
import { useActiveMachine } from "@/state/machines";
import { LoopbackLinkProvider, loopbackScopeKey } from "@/ui/loopback-link";
import { usePrivateContentAccess } from "@/ui/private-access";
import { SessionBrowser } from "./session-browser";
import { SessionTunnelBrowser } from "./session-tunnel-browser";
import { chooseTunnelOpening, type TunnelOpening } from "./session-tunnel-model";
import type { SessionScope } from "./session-types";

type LoopbackRequest = { href: string; id: number; scope: string; opening: TunnelOpening };

/**
 * Owns the one session browser that opens loopback links from this session's transcript and composer.
 * With the Host tunnel and a capable native build a link opens on this phone; otherwise (or on the
 * toolbar's request) the Host Browser prefills the original address, and its own proof and explicit
 * Go still decide.
 */
export function SessionLoopbackBrowser({ scope, projectId, children }: { scope: SessionScope; projectId?: string; children: ReactNode }) {
  const access = usePrivateContentAccess();
  const machine = useActiveMachine();
  const capabilities = machine?.capabilities;
  const [request, setRequest] = useState<LoopbackRequest>();
  const key = projectId ? loopbackScopeKey({ machineId: scope.machineId, projectId, sessionId: scope.sessionId }) : "";
  const owner = useMemo(
    () => key ? {
      scope: key,
      open(href: string) {
        if (!access.check()) return;
        const opening = chooseTunnelOpening({ capabilities, supported: tunnelSupported() });
        setRequest((previous) => previous?.scope === key && previous.href === href && previous.opening === opening
          ? previous
          : { href, id: (previous?.id ?? 0) + 1, scope: key, opening });
      },
    } : null,
    [access, key, capabilities],
  );
  const close = () => setRequest((current) => current === request ? undefined : current);
  return (
    <LoopbackLinkProvider value={owner}>
      {children}
      {request && projectId && request.scope === key ? (
        request.opening === "tunnel" ? (
          <SessionTunnelBrowser
            key={request.id}
            projectId={projectId}
            href={request.href}
            onClose={close}
            onHostBrowser={(href) => {
              if (!access.check()) return;
              setRequest((current) => current === request ? { href, id: request.id + 1, scope: key, opening: "host" } : current);
            }}
          />
        ) : (
          <SessionBrowser
            key={request.id}
            scope={scope}
            projectId={projectId}
            initialUrl={request.href}
            onClose={close}
          />
        )
      ) : null}
    </LoopbackLinkProvider>
  );
}
