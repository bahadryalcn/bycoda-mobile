export type KeyCommandSpec = {
  key: string;
  title: string;
  /** primary is Command on Apple, Ctrl or Meta on Android. */
  primary?: boolean;
  shift?: boolean;
  enabled?: boolean;
  /** Modal commands win over background editors. */
  priority?: number;
  /** Editor commands must not run behind an active overlay. */
  textInput?: boolean;
};
export type RegisteredKeyCommand = KeyCommandSpec & { id: string };

/** One native command per chord; latest registration wins ties. */
export function activeCommands(commands: readonly RegisteredKeyCommand[]): RegisteredKeyCommand[] {
  const chords = new Map<string, RegisteredKeyCommand>();
  for (const command of commands) {
    if (command.enabled === false) continue;
    const chord = JSON.stringify([command.key.toLowerCase(), !!command.primary, !!command.shift]);
    const previous = chords.get(chord);
    if (!previous || (command.priority ?? 0) >= (previous.priority ?? 0)) chords.set(chord, command);
  }
  return [...chords.values()];
}
