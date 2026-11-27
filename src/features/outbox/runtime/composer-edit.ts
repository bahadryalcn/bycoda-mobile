import type { OutboxRow } from "../model/outbox";

const editors = new Map<string, (row: OutboxRow) => Promise<void>>();
const key = (row: { machineId: string; sessionId: string }) => `${row.machineId}:${row.sessionId}`;
export function registerOutboxEditor(scope: { machineId: string; sessionId: string }, edit: (row: OutboxRow) => Promise<void>) {
  editors.set(key(scope), edit);
  return () => { if (editors.get(key(scope)) === edit) editors.delete(key(scope)); };
}
export async function editOutbox(row: OutboxRow) {
  const editor = editors.get(key(row));
  if (!editor) throw new Error("Open this session before editing the waiting message.");
  await editor(row);
}
