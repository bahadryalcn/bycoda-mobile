import { useEffect, useState } from "react";
import { router } from "expo-router";
import { useHostClient } from "@/state/queries";
import { Empty, Loading } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { SessionProjectMismatch, sameSessionProjectFolder } from "@/remote/session-project";

export function SessionProjectRecovery({
  error,
  machineId,
  visible,
  targetTurnId,
}: {
  error: SessionProjectMismatch;
  machineId: string;
  visible(id: string): boolean;
  targetTurnId?: string;
}) {
  const client = useHostClient();
  const copy = useCopy();
  const [checking, setChecking] = useState(true);
  const allowed = () =>
    !!client &&
    client.machine.id === machineId &&
    visible(error.expectedProjectId) &&
    visible(error.actualProjectId);
  const open = () => {
    if (!allowed()) return;
    try {
      client!.assertCurrentAccess();
    } catch {
      return;
    }
    router.replace({
      pathname: "/session/[id]",
      params: {
        id: error.sessionId,
        projectId: error.actualProjectId,
        machineId,
        ...(targetTurnId ? { targetTurnId } : {}),
      },
    });
  };
  // A read-only alias proof may repair the route; cleanup fences old Host/visibility callbacks.
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setChecking(true);
    if (!client || !allowed()) {
      setChecking(false);
      return;
    }
    void sameSessionProjectFolder(client, error, visible, controller.signal).then(
      (same) => {
        if (disposed) return;
        if (same) open();
        setChecking(false);
      },
      () => {
        if (!disposed) setChecking(false);
      },
    );
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [client, error, machineId, visible, targetTurnId]);
  if (checking) return <Loading label={copy("Oturum yükleniyor", "Loading session")} />;
  return (
    <Empty
      compact={false}
      illustration="no-projects"
      title={copy("Oturumun proje bağlantısı değişmiş.", "The session’s project link has changed.")}
      detail={copy(
        "Doğru proje doğrulanana kadar oturum içeriği gizli tutulur.",
        "Session content stays hidden until its project is verified.",
      )}
      action={
        allowed()
          ? {
              label: copy("Oturumun projesinde aç", "Open in the session’s project"),
              onPress: open,
            }
          : undefined
      }
    />
  );
}
