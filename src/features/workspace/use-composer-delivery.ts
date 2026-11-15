import type { HostSession } from "./wire";
import type { useHostClient } from "@/state/queries";
import { desktopOwnsTurn, type ComposerDelivery } from "./composer-delivery";
import { busyPrimaryMode } from "./busy-send";
import type { BusySendMode } from "@/state/busy-send";

/**
 * Derives delivery from the Settings preference and current Host capabilities.
 * A finished run always returns to Send; the composer keeps no separate mode override.
 */
export function useComposerDelivery({
  session,
  client,
  queueSupported,
  busyPreferred = "steer",
}: {
  session: HostSession | undefined;
  client: ReturnType<typeof useHostClient>;
  queueSupported: boolean;
  busyPreferred?: BusySendMode;
}) {
  const running = session?.status === "running";
  const supportsSteer = !!client?.machine.capabilities?.includes("sessions.steer");
  const desktopOwned = !!session && desktopOwnsTurn(session);
  const canSteer = supportsSteer && running && !!session?.runId && !desktopOwned;
  const available = { queue: queueSupported, steer: canSteer };
  const mode: ComposerDelivery = running ? busyPrimaryMode(busyPreferred, available) ?? "send" : "send";
  return {
    mode,
    running,
    supportsSteer,
    desktopOwned,
    canSteer,
    available,
  };
}
