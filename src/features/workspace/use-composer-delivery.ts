import { useState } from "react";
import type { HostSession } from "./wire";
import type { useHostClient } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { desktopOwnsTurn, type ComposerDelivery } from "./composer-delivery";
import { deliveryAfterRun } from "./queue-delivery";
import { busyPrimaryMode } from "./busy-send";
import type { BusySendMode } from "@/state/busy-send";

type DeliveryState = {
  mode: ComposerDelivery;
  /** The run state the mode was last reconciled against. */
  wasRunning: boolean;
  chosen: boolean;
  initialized: boolean;
};

/**
 * Owns the Send/Queue/Steer choice. While a run is active and nothing was chosen explicitly, the
 * mode is the preferred busy-send mode (the send button's primary action); a finished run drops a
 * stale Steer.
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
  if (!next.initialized && session) next = { ...next, initialized: true };
  if (next !== state) setState(next);
  const supportsSteer = !!client?.machine.capabilities?.includes("sessions.steer");
  const desktopOwned = !!session && desktopOwnsTurn(session);
  const canSteer = supportsSteer && running && !!session?.runId && !desktopOwned;
  const available = { queue: queueSupported, steer: canSteer };
  const primary = running && !next.chosen ? busyPrimaryMode(busyPreferred, available) : null;
  const mode = primary ?? next.mode;
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
    available,
    options,
    modeLabel: options.find((option) => option.value === mode)?.label ?? "",
    // Delivery choice matters only while a run is active (or when a non-send mode is still set).
    showModeChip: options.length > 1 && (running || mode !== "send"),
    choose: (value: ComposerDelivery) =>
      setState((current) => ({ ...current, chosen: true, mode: value })),
  };
}
