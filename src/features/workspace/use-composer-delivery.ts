import { useState } from "react";
import type { HostSession } from "./wire";
import type { useHostClient } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { desktopOwnsTurn, type ComposerDelivery } from "./composer-delivery";
import { deliveryAfterRun } from "./queue-delivery";

type DeliveryState = {
  mode: ComposerDelivery;
  /** The run state the mode was last reconciled against. */
  wasRunning: boolean;
  chosen: boolean;
  initialized: boolean;
};

/**
 * Owns the Send/Queue/Steer choice. The mode follows the run state: a finished run drops a stale
 * Steer (or an unchosen Queue), and the first session snapshot picks Queue for a running turn.
 */
export function useComposerDelivery({
  session,
  client,
  queueSupported,
}: {
  session: HostSession | undefined;
  client: ReturnType<typeof useHostClient>;
  queueSupported: boolean;
}) {
  const copy = useCopy();
  const running = session?.status === "running";
  const [state, setState] = useState<DeliveryState>(() => ({
    mode: "send",
    wasRunning: running,
    chosen: false,
    initialized: false,
  }));
  // Adjust during render from the stored previous value instead of mirroring it in effects.
  let next = state;
  if (next.wasRunning !== running)
    next = {
      ...next,
      mode: deliveryAfterRun(next.mode, next.wasRunning, running, next.chosen),
      wasRunning: running,
    };
  if (!next.initialized && session)
    next = {
      ...next,
      initialized: true,
      mode: session.status === "running" && queueSupported ? "queue" : "send",
    };
  if (next !== state) setState(next);
  const mode = next.mode;
  const supportsSteer = !!client?.machine.capabilities?.includes("sessions.steer");
  const desktopOwned = !!session && desktopOwnsTurn(session);
  const canSteer = supportsSteer && running && !!session?.runId && !desktopOwned;
  const options = [
    { value: "send" as const, label: copy("Gönder", "Send") },
    ...(queueSupported ? [{ value: "queue" as const, label: copy("Sıraya al", "Queue") }] : []),
    ...(supportsSteer ? [{ value: "steer" as const, label: copy("Yönlendir", "Steer") }] : []),
  ];
  return {
    mode,
    running,
    supportsSteer,
    desktopOwned,
    canSteer,
    options,
    modeLabel: options.find((option) => option.value === mode)?.label ?? "",
    // Delivery choice matters only while a run is active (or when a non-send mode is still set).
    showModeChip: options.length > 1 && (running || mode !== "send"),
    choose: (value: ComposerDelivery) =>
      setState((current) => ({ ...current, chosen: true, mode: value })),
  };
}
