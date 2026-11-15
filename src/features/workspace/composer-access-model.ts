import { captureSessionAuthority } from "@/domain/session-authority";
import type { HostModelCatalog } from "@/domain/types";
import type { HostSession, RuntimeMode } from "./wire";

export const ACCESS_MODES: readonly RuntimeMode[] = [
  "supervised",
  "auto-accept-edits",
  "auto",
  "full-access",
];

/** Desktop hides the access picker for harnesses with no permission model (`fx`). */
export function composerAccessAvailable(session: HostSession | undefined): session is HostSession {
  return !!session && session.session.harness !== "fx";
}

/**
 * Modes the session's harness cannot honour on this Host, with the Host's reason; the desktop
 * picker greys out the same modes. Older Hosts send no limits, so every mode stays available.
 */
export function unavailableAccessModes(
  catalog: Pick<HostModelCatalog, "runtimeModeLimits"> | undefined,
  harness: string,
): Partial<Record<RuntimeMode, string>> {
  const limits = catalog?.runtimeModeLimits?.[harness as keyof NonNullable<HostModelCatalog["runtimeModeLimits"]>];
  return limits ?? {};
}

/**
 * The Host `configure` command for an access change: the same command the session settings and
 * model chip send, keeping provider, account, model and model settings exactly as reviewed.
 * The Host refuses `configure` while a turn runs, so callers block it while running.
 */
export function accessConfigureCommand(
  session: HostSession,
  runtimeMode: RuntimeMode,
): Record<string, unknown> {
  const { harness, providerAccountId, model, modelSettings } = session.session;
  return {
    type: "configure",
    sessionId: session.session.id,
    ...captureSessionAuthority(session),
    ...(session.revision !== undefined ? { expectedRevision: session.revision } : {}),
    harness,
    ...(harness === "claude" || harness === "codex"
      ? { providerAccountId: providerAccountId ?? null }
      : {}),
    model,
    modelSettings,
    runtimeMode,
  };
}
