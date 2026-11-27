import { RemoteHostError } from "../../remote/host-error";
import type { HostRequest, MobileMachine } from "../../remote/types";

export type SessionReferenceLocator =
  | { kind: "host"; environmentId: string; sessionId: string }
  | { kind: "native"; sourceStoreId: string; sourceProfileId: string; sessionId: string };
export type SessionReference = { locator: SessionReferenceLocator; turnId?: string };

const webPrefix = "https://link.bycoda.codes/session/v1/";
const nativePrefix = "bycoda://session/v1/";
const promptPrefixes = ["https://link.bycoda.codes/new/v1", "bycoda://new/v1"];

/** Accept only the versioned prompt-link format and bound input before routing. */
export function parsePromptLink(value: string): { prompt: string; project?: string } | null {
  if (typeof value !== "string" || value.length > 32768) return null;
  const prefix = promptPrefixes.find((candidate) => value.startsWith(`${candidate}?`));
  if (!prefix || value.includes("#")) return null;
  const query = value.slice(prefix.length + 1);
  if (/%(?![0-9a-fA-F]{2})/.test(query)) return null;
  const params = new URLSearchParams(query);
  if ([...params.keys()].some((key) => key !== "prompt" && key !== "project")) return null;
  if (params.getAll("prompt").length !== 1 || params.getAll("project").length > 1) return null;
  const prompt = params.get("prompt") ?? "";
  const project = params.get("project");
  if (!prompt.trim() || prompt.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(prompt)) return null;
  if (project !== null && !validId(project)) return null;
  return { prompt, ...(project === null ? {} : { project }) };
}
const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value) &&
  value !== "." &&
  value !== "..";
const encodeId = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*.~]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
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
    const locator: SessionReferenceLocator =
      kind === "host"
        ? { kind, environmentId: parts[0], sessionId: parts[1] }
        : {
            kind: "native",
            sourceStoreId: parts[0],
            sourceProfileId: parts[1],
            sessionId: parts[2],
          };
    return { locator, ...(turnId === undefined ? {} : { turnId }) };
  } catch {
    return null;
  }
}

/** Expo calls this for initial and subsequent native intents; widget routes remain unchanged. */
export function rewriteSessionReferencePath(path: string): string {
  const promptPath = path.startsWith("/new/v1?") ? `https://link.bycoda.codes${path}` : path;
  const prompt = parsePromptLink(promptPath);
  if (prompt) {
    // Percent-encode by hand: URLSearchParams writes spaces as "+", which the router keeps literally.
    const project = prompt.project ? `&project=${encodeURIComponent(prompt.project)}` : "";
    return `/sessions?new=1&prompt=${encodeURIComponent(prompt.prompt)}${project}`;
  }
  if (promptPrefixes.some((prefix) => promptPath.startsWith(prefix))) return "/sessions";
  const link = path.startsWith("/session/v1/") ? `https://link.bycoda.codes${path}` : path;
  if (parseSessionReference(link)) return `/session-reference?link=${encodeURIComponent(link)}`;
  return link.startsWith(webPrefix) || link.startsWith(nativePrefix) ? "/session-reference" : path;
}

export function referenceMachines<T extends { id: string; environmentId: string }>(
  reference: SessionReference,
  machines: T[],
): T[] {
  const locator = reference.locator;
  return locator.kind === "host"
    ? machines.filter((machine) => machine.environmentId === locator.environmentId)
    : machines;
}

export function resolvedSessionRoute(
  result: unknown,
  machineId: string,
  expectedSessionId: string,
  turnId?: string,
) {
  const value = result as { projectId?: unknown; session?: { id?: unknown } } | null;
  if (
    !validId(machineId) ||
    !value ||
    !validId(value.projectId) ||
    value.session?.id !== expectedSessionId
  )
    throw new Error("This session is unavailable or inaccessible.");
  return {
    pathname: "/session/[id]" as const,
    params: {
      id: expectedSessionId,
      projectId: value.projectId,
      machineId,
      ...(turnId ? { targetTurnId: turnId } : {}),
    },
  };
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
    throw new RemoteHostError(
      machine.id,
      "unsupported",
      "Update Bycoda on your computer to use this feature.",
    );
  if (!referenceMachines(reference, [machine]).length)
    throw new Error("This session is unavailable or inaccessible.");
  const result = await request<unknown>(
    "sessions.get",
    {
      sessionId: reference.locator.sessionId,
      preview: true,
      summary: true,
      reference: reference.locator,
    },
    { signal, retry: false },
  );
  assertCurrent();
  return resolvedSessionRoute(result, machine.id, reference.locator.sessionId, reference.turnId);
}
