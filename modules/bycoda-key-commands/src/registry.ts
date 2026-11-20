import { activeCommands, commandChord, type RegisteredKeyCommand } from "./commands";

export type KeyCommandSink = {
  /** Replaces the whole native command list. */
  setCommands(commands: RegisteredKeyCommand[]): Promise<void>;
  /** Attaches the native key event listener; returns its unsubscribe. */
  subscribe(listener: (id: string) => void): { remove(): void };
};

type Registration = { spec: RegisteredKeyCommand; run(): void };

/** Native ids are chords, so equal command lists stay equal across screen/owner swaps. */
export function nativeCommands(commands: readonly RegisteredKeyCommand[]): RegisteredKeyCommand[] {
  return activeCommands(commands)
    .map((command) => ({ ...command, id: commandChord(command) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Owns mounted key-command registrations and syncs them to native at most once per tick,
 * and only when the effective native list changed. Dispatch resolves the live winner per chord.
 */
export function createKeyCommandRegistry(sink: KeyCommandSink | null, schedule: (flush: () => void) => void = queueMicrotask) {
  const registrations = new Map<string, Registration>();
  let subscription: { remove(): void } | undefined;
  let sent = "[]";
  let pending = false;

  function dispatch(chord: string) {
    const winner = activeCommands([...registrations.values()].map(({ spec }) => spec)).find((command) => commandChord(command) === chord);
    if (winner) registrations.get(winner.id)?.run();
  }
  function flush() {
    pending = false;
    if (!sink) return;
    if (!registrations.size) {
      subscription?.remove();
      subscription = undefined;
    } else if (!subscription) subscription = sink.subscribe(dispatch);
    const commands = nativeCommands([...registrations.values()].map(({ spec }) => spec));
    const signature = JSON.stringify(commands);
    if (signature === sent) return;
    sent = signature;
    void sink.setCommands(commands).catch(() => {
      // Native support is optional (Expo Go, web and old installed binaries); retry on the next change.
      if (sent === signature) sent = "";
    });
  }
  function request() {
    if (!sink || pending) return;
    pending = true;
    schedule(flush);
  }

  return {
    register(spec: RegisteredKeyCommand, run: () => void) {
      registrations.set(spec.id, { spec, run });
      request();
      return () => {
        registrations.delete(spec.id);
        request();
      };
    },
    dispatch,
  };
}
