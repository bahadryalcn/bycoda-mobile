import { useState } from "react";
import type { SessionApprovalGrant } from "../../../../src/shared/model/sessionApprovalGrant";
import { SESSION_APPROVAL_GRANTS_CAPABILITY } from "../../../../src/shared/model/sessionApprovalGrant";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useAsyncAction } from "@/state/actions";
import { useHostClient, useHostQuery } from "@/state/queries";
import { Body, Empty, MutationState, NavigationGroup, NavigationRow, QueryState, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { HostSession } from "./wire";

/** Desktop's grant owner: a Claude session the Host runs, on a Host that keeps session approvals. */
export function sessionGrantsAvailable(session: HostSession | undefined, capabilities: readonly string[] | undefined) {
  return (
    !!session &&
    session.session.harness === "claude" &&
    session.executionOwner !== "desktop" &&
    !!capabilities?.includes(SESSION_APPROVAL_GRANTS_CAPABILITY)
  );
}

/**
 * Desktop's SessionApprovalGrantsDialog: every opening reads the Host's current grants (other
 * clients may have revoked some); each row revokes its grant. The Host returns the list left.
 */
export function SessionApprovalGrants({
  session,
  blocked,
  onClose,
}: {
  session: HostSession;
  blocked: boolean;
  onClose: () => void;
}) {
  const copy = useCopy();
  const client = useHostClient();
  const params = { sessionId: session.session.id, ...captureSessionAuthority(session) };
  const list = useHostQuery<SessionApprovalGrant[]>(
    ["session", session.session.id, "approvalGrants"],
    "sessions.approvalGrants.list",
    params,
  );
  const revoke = useAsyncAction<SessionApprovalGrant[]>();
  const [revoking, setRevoking] = useState<string>();
  const [left, setLeft] = useState<SessionApprovalGrant[]>();
  const grants = left ?? list.data;
  const revokeGrant = async (grantId: string) => {
    if (!client || revoke.isPending || blocked) return;
    setRevoking(grantId);
    const next = await revoke.run(() =>
      client.request<SessionApprovalGrant[]>("sessions.approvalGrants.revoke", { ...params, grantId }),
    );
    setRevoking(undefined);
    if (next) setLeft(next);
  };
  return (
    <Sheet visible title={copy("Oturum onayları", "Session approvals")} size="compact" onClose={onClose}>
      {grants === undefined ? (
        <QueryState query={list} loading="list" />
      ) : grants.length ? (
          <NavigationGroup>
            {grants.map((grant) => (
              <NavigationRow
                key={grant.id}
                intent="command"
                label={copy("Çalışma alanında dosya adı arama", "Workspace filename search")}
                detail="Claude Glob"
                accessibilityLabel={copy("İzni kaldır: çalışma alanında dosya adı arama", "Revoke: workspace filename search")}
                trailing={<Body muted>{copy("Kaldır", "Revoke")}</Body>}
                tone="danger"
                busy={revoking === grant.id}
                disabled={blocked || (revoke.isPending && revoking !== grant.id)}
                onPress={() => void revokeGrant(grant.id)}
              />
            ))}
          </NavigationGroup>
      ) : (
        <Empty title={copy("Bu oturumda kalıcı onay yok", "No session approvals")} />
      )}
      <MutationState mutation={revoke} />
    </Sheet>
  );
}
