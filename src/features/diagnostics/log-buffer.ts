export const LOG_MAX_LINES = 1000;
export const LOG_MAX_CHARS = 200_000;
export const LINE_MAX_CHARS = 4000;

/** Bounded in-memory ring of log lines: oldest lines drop first when either limit is exceeded. */
export function createLogBuffer(maxLines = LOG_MAX_LINES, maxChars = LOG_MAX_CHARS) {
  let lines: string[] = [];
  let chars = 0;
  return {
    /** Stores the line (clipped, newlines indented) and returns the exact text kept in the ring. */
    push(line: string): string {
      const clipped = line.length > LINE_MAX_CHARS ? `${line.slice(0, LINE_MAX_CHARS)}...` : line;
      const text = clipped.replace(/\r?\n/g, "\n  ");
      lines.push(text);
      chars += text.length + 1;
      let drop = 0;
      while (lines.length - drop > maxLines || (chars > maxChars && lines.length - drop > 1)) {
        chars -= lines[drop]!.length + 1;
        drop += 1;
      }
      if (drop > 0) lines = lines.slice(drop);
      return text;
    },
    text: () => lines.join("\n"),
    size: () => lines.length,
  };
}

/** Renders console arguments like `console.log` would, without throwing on odd values. */
export function formatLogArguments(args: readonly unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === "string") return value;
      if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
      try {
        return JSON.stringify(value) ?? String(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");
}
