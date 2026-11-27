import type {
  MobilePairingCode,
  MobilePairingRedemption,
} from "../../../../src/integrations/mobile-pairing";
import type { HostDescriptor, MobileMachine } from "@/remote/types";
import type { DeviceProofJwk } from "../../../../src/integrations/device-proof";
import type { useComputerConnection } from "./use-computer-connection";

export type ConnectionDraft = {
  name: string;
  endpoint: string;
  token: string;
  target: { kind: "new" } | { kind: "existing"; id: string } | null;
};

export type ConnectionEntryState =
  | { kind: "choices" }
  | { kind: "scan" }
  | { kind: "paste" }
  | { kind: "manual" }
  | { kind: "rejected-code"; message: string }
  | { kind: "preview"; code: MobilePairingCode; claimId: string; receivedAt: number };

export type ComputerConnectionInput = {
  name: string;
  endpoint: string;
  lanKey?: string;
  credential: string;
  expectedEnvironmentId?: string;
  editingId?: string;
  /** Seed of the key this credential was bound to at pairing; absent for a pasted credential. */
  proofSeed?: Uint8Array;
  /** The pairing endpoint is a public-internet route the owner allowed. */
  public?: true;
};

export type ComputerConnectionDependencies = {
  discover: (
    endpoint: string,
    credential: string,
    signal: AbortSignal,
    lanKey?: string,
    environmentId?: string,
    proofSeed?: Uint8Array,
  ) => Promise<HostDescriptor>;
  flushDrafts: () => Promise<void>;
  getMachines: () => MobileMachine[];
  saveMachine: (
    machine: MobileMachine,
    credential: string,
    proofSeed?: Uint8Array,
    options?: { activate?: boolean },
  ) => Promise<void>;
  createId: () => string;
  assertAccess: () => void;
  signal: AbortSignal;
};

export type PairingRedeemResult = MobilePairingRedemption;
export type PairingRedeemResponse = { result?: Partial<PairingRedeemResult> };

export type PairingRedeemOptions = {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  assertAccess: () => void;
  /** Public JWK of the phone key the new credential is bound to. */
  proofKey: DeviceProofJwk;
  timeoutMs?: number;
  now?: () => number;
};

export type PairingFailureKind =
  | "expired"
  | "used"
  | "network"
  | "timeout"
  | "aborted"
  | "invalid-response"
  | "identity"
  | "unavailable"
  | "access"
  | "code-unavailable"
  | "rate-limit";

export type PairingEntryProps = {
  controller: ReturnType<typeof useComputerConnection>;
  disabled: boolean;
};

export type PairingScannerProps = {
  onCode: (raw: string) => Promise<void>;
  onClose: () => void;
  onPaste: () => void;
};

export type PairingPasteProps = {
  disabled: boolean;
  onCode: (raw: string) => Promise<void>;
  onCancel: () => void;
};

export type ManualConnectionFormProps = PairingEntryProps;

export type PairingCopy = (tr: string, en: string) => string;

export type ConnectionOperation = ReturnType<typeof useComputerConnection>["operation"];
