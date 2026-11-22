/** Put the current computer first while preserving the order of the remaining entries. */
export function selectedComputerFirst<T extends { id: string }>(computers: readonly T[], selectedId: string | null | undefined) {
  const index = computers.findIndex((computer) => computer.id === selectedId);
  return index <= 0
    ? computers
    : [...computers.slice(index, index + 1), ...computers.slice(0, index), ...computers.slice(index + 1)];
}
