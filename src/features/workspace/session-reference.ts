import { RemoteHostError } from "../../remote/host-error";
import type { HostRequest, MobileMachine } from "../../remote/types";

export type SessionReferenceLocator =
  | { kind: "host"; environmentId: string; sessionId: string }
  | { kind: "native"; sourceStoreId: string; sourceProfileId: string; sessionId: string };
export type SessionReference = { locator: SessionReferenceLocator; turnId?: string };

const webPrefix = "https://link.bycoda.codes/session/v1/";
const nativePrefix = "bycoda://session/v1/";
const validId = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= 256 && value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value) && value !== "." && value !== "..";
const encodeId = (value: string) => encodeURIComponent(value).replace(
  /[!'()*.~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
);

/** Keep the versioned wire address exact; URL normalization must not change owner identity. */
export function parseSessionReference(value: string): SessionReference | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  const prefix = value.startsWith(webPrefix) ? webPrefix : nativePrefix;
  if (!value.startsWith(prefix)) return null;
  const match = /^(host|native)\/([^?#]+)(?:\?turn=([^&#]+))?$/.exec(value.slice(prefix.length));
  if (!match) return null;
  try {
    const parts = match[2].split("/").map(decodeURIComponent);
    if (!parts.every(validId)) return null;
    const kind = match[1];
    if (parts.length !== (kind === "host" ? 2 : 3)) return null;
    const turnId = match[3] === undefined ? undefined : decodeURIComponent(match[3]);
    if (turnId !== undefined && !validId(turnId)) return null;
    const canonical = `${prefix}${kind}/${parts.map(encodeId).join("/")}${turnId === undefined ? "" : `?turn=${encodeId(turnId)}`}`;
    if (canonical !== value) return null;
    const locator: SessionReferenceLocator = kind === "host"
      ? { kind, environmentId: parts[0], sessionId: parts[1] }
      : { kind: "native", sourceStoreId: parts[0], sourceProfileId: parts[1], sessionId: parts[2] };
    return { locator, ...(turnId === undefined ? {} : { turnId }) };
  } catch {
    return null;
  }
}

/** Expo calls this for initial and subsequent native intents; widget routes remain unchanged. */
export function rewriteSessionReferencePath(path: string): string {
  const link = path.startsWith("/session/v1/")
    ? `https://link.bycoda.codes${path}` : path;
  if (parseSessionReference(link)) return `/session-reference?link=${encodeURIComponent(link)}`;
  return link.startsWith(webPrefix) || link.startsWith(nativePrefix)
    ? "/session-reference" : path;
}

export function referenceMachines<T extends { id: string; environmentId: string }>(reference: SessionReference, machines: T[]): T[] {
  const locator = reference.locator;
  return locator.kind === "host"
    ? machines.filter((machine) => machine.environmentId === locator.environmentId)
    : machines;
}

export function resolvedSessionRoute(result: unknown, machineId: string, expectedSessionId: string) {
  const value = result as { projectId?: unknown; session?: { id?: unknown } } | null;
  if (!validId(machineId) || !value || !validId(value.projectId) || value.session?.id !== expectedSessionId)
    throw new Error("This conversation is unavailable or inaccessible.");
  return { pathname: "/session/[id]" as const, params: { id: expectedSessionId, projectId: value.projectId, machineId } };
}

/** Older Hosts may ignore unknown fields; require explicit support before sending the identity guard. */
export async function resolveSessionReference(
  reference: SessionReference,
  machine: Pick<MobileMachine, "id" | "environmentId" | "capabilities">,
  request: HostRequest,
  assertCurrent: () => void,
  signal?: AbortSignal,
) {
  assertCurrent();
  if (!machine.capabilities?.includes("sessions.references.v1"))
    throw new RemoteHostError(machine.id, "unsupported", "Update Bycoda on your computer to use this feature.");
  if (!referenceMachines(reference, [machine]).length)
    throw new Error("This conversation is unavailable or inaccessible.");
  const result = await request<unknown>("sessions.get", {
    sessionId: reference.locator.sessionId, preview: true, summary: true, reference: reference.locator,
  }, { signal, retry: false });
  assertCurrent();
  return resolvedSessionRoute(result, machine.id, reference.locator.sessionId);
}
