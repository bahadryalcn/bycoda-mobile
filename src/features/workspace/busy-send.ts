import type { BusySendMode } from "@/state/busy-send";
import type { ComposerDelivery } from "./composer-delivery";

export type BusyAvailability = { queue: boolean; steer: boolean };

/** The send button's action while a run is active: the preferred mode when usable, else the other, else none. */
export function busyPrimaryMode(
  preferred: BusySendMode,
  available: BusyAvailability,
): BusySendMode | null {
  const other: BusySendMode = preferred === "steer" ? "queue" : "steer";
  if (available[preferred]) return preferred;
  return available[other] ? other : null;
}

/** The long-press action: the other mode, only when it can really be delivered. */
export function busyAlternateMode(
  mode: ComposerDelivery,
  available: BusyAvailability,
): BusySendMode | null {
  if (mode !== "steer" && mode !== "queue") return null;
  const other: BusySendMode = mode === "steer" ? "queue" : "steer";
  return available[other] ? other : null;
}
