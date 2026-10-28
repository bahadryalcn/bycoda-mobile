import type { CredentialBinding, PairedHostCa } from "../../modules/bycoda-host-socket/src/types";
import {
  MobileTlsBootstrapSchema,
  hostRpcSupported,
  HOST_RPC_METHODS,
  nativeDesktopMethod,
  type MobileTlsBootstrap,
} from "../../../src/shared/model/host-contracts";

const counter = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}(?![\s\S])/.test(value);

/** Receives public trust material only from authenticated pairing/bootstrap. */
export function requirePairedHostCa(value: unknown, environmentId: string): PairedHostCa {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Pair this computer again to trust its WSS certificate.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (key) =>
        !["version", "environmentId", "caGeneration", "caCertificatePem", "caSpkiPin"].includes(
          key,
        ),
    ) ||
    v.version !== 1 ||
    v.environmentId !== environmentId ||
    !id(v.environmentId) ||
    !counter(v.caGeneration) ||
    v.caGeneration < 1 ||
    typeof v.caCertificatePem !== "string" ||
    v.caCertificatePem.length > 16_384 ||
    !v.caCertificatePem.startsWith("-----BEGIN CERTIFICATE-----") ||
    !v.caCertificatePem.trimEnd().endsWith("-----END CERTIFICATE-----") ||
    typeof v.caSpkiPin !== "string" ||
    !/^sha256\/[A-Za-z0-9+/]{43}=(?![\s\S])/.test(v.caSpkiPin)
  )
    throw new Error("The paired WSS trust material is invalid.");
  return Object.freeze({
    version: 1,
    environmentId,
    caGeneration: v.caGeneration,
    caCertificatePem: v.caCertificatePem,
    caSpkiPin: v.caSpkiPin,
  });
}

export function requireNativeWssEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (
    url.protocol !== "wss:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/ws"
  )
    throw new Error("A native Host socket requires its saved WSS /ws endpoint.");
  return url.toString();
}

export function requireCredentialBinding(value: CredentialBinding): CredentialBinding {
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "machineId",
          "environmentId",
          "endpoint",
          "credentialGeneration",
          "accessEpoch",
          "tls",
        ].includes(key),
    ) ||
    !/^[A-Za-z0-9-]{1,80}(?![\s\S])/.test(value.machineId) ||
    !id(value.environmentId) ||
    !counter(value.credentialGeneration) ||
    !counter(value.accessEpoch)
  )
    throw new Error("Invalid native credential binding.");
  return Object.freeze({
    ...value,
    endpoint: requireNativeWssEndpoint(value.endpoint),
    ...(value.tls ? { tls: requirePairedHostCa(value.tls, value.environmentId) } : {}),
  });
}

/** Selection happens before dispatch. Network/auth failure never changes this choice. */
const migratedCapabilities = new Set<string>(
  Object.entries(HOST_RPC_METHODS).flatMap(([method, definition]) =>
    // The original read-only mobile pilot predates pinned WSS bootstrap. Its
    // lone read.v2 marker must retain HTTP; another known family or full v2 opts in.
    !nativeDesktopMethod(method) &&
    "requiredCapability" in definition &&
    typeof definition.requiredCapability === "string" &&
    definition.requiredCapability !== "transport.ws.read.v2"
      ? [definition.requiredCapability]
      : [],
  ),
);

export function selectMobileHostTransport(
  capabilities: readonly string[],
  nativeAvailable: boolean,
): "legacy-http" | "native-wss" {
  if (
    !capabilities.includes("transport.ws.v2") &&
    !capabilities.some((capability) => migratedCapabilities.has(capability))
  )
    return "legacy-http";
  if (!nativeAvailable)
    throw new Error("Update the native mobile app to connect to this WSS Host.");
  return "native-wss";
}

/** Explicit migration cohort, not a method-name/read-prefix heuristic. */
export function mobileWsMethodEnabled(capabilities: readonly string[], method: string): boolean {
  return (
    !nativeDesktopMethod(method) &&
    selectMobileHostTransport(capabilities, true) === "native-wss" &&
    hostRpcSupported(method, capabilities)
  );
}
export function requireMobileTlsBootstrap(
  value: unknown,
  environmentId: string,
): MobileTlsBootstrap {
  const parsed = MobileTlsBootstrapSchema.parse(value);
  if (parsed.environmentId !== environmentId) throw new Error("Host WSS environment changed.");
  const endpoint = requireNativeWssEndpoint(parsed.endpoint);
  const socket = new URL(endpoint),
    bulk = new URL(parsed.bulkBaseUrl);
  if (
    bulk.protocol !== "https:" ||
    bulk.host !== socket.host ||
    bulk.username ||
    bulk.password ||
    bulk.search ||
    bulk.hash ||
    bulk.pathname !== "/ws-bulk/"
  )
    throw new Error("Invalid protected Host bulk endpoint.");
  const ca = requirePairedHostCa(
    {
      version: parsed.version,
      environmentId,
      caGeneration: parsed.caGeneration,
      caCertificatePem: parsed.caCertificatePem,
      caSpkiPin: parsed.caSpkiPin,
    },
    environmentId,
  );
  return Object.freeze({ ...ca, endpoint, bulkBaseUrl: bulk.toString() });
}
