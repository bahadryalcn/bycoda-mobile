/** Literal line filtering keeps shell text intact and never interprets a search as a regular expression. */
export function filterTerminalOutput(output: string, query: string): { text: string; matches: number } {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return { text: output, matches: 0 };
  const lines = output.split("\n").filter(line => line.toLocaleLowerCase().includes(needle));
  return { text: lines.join("\n"), matches: lines.length };
}
