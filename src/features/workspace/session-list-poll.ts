/** Full-list poll cadence: slow while a live stream delivers updates, fast when it is down. */
export function sessionListPollInterval(streams: boolean, connection: string | undefined, directoryError: boolean) {
  return streams && connection === "ready" && !directoryError ? 30_000 : 5_000;
}
