import type {
  MobilePairingCode,
  MobilePairingRedemption,
} from "../../../../src/integrations/mobile-pairing";
import type { HostDescriptor, MobileMachine } from "@/remote/types";
import type { useComputerConnection } from "./use-computer-connection";

export type ConnectionDraft = {
  name: string;
  endpoint: string;
  token: string;
  target: { kind: "new" } | { kind: "existing"; id: string } | null;
};

export type ConnectionEntryState =
  | { kind: "choices" }
  | { kind: "methods" }
  | { kind: "scan" }
  | { kind: "paste" }
  | { kind: "manual" }
  | { kind: "preview"; code: MobilePairingCode; claimId: string };

export type ComputerConnectionInput = {
  name: string;
  endpoint: string;
  lanKey?: string;
  credential: string;
  expectedEnvironmentId?: string;
  editingId?: string;
};

export type ComputerConnectionDependencies = {
  discover: (
    endpoint: string,
    credential: string,
    signal: AbortSignal,
    lanKey?: string,
    environmentId?: string,
  ) => Promise<HostDescriptor>;
  flushDrafts: () => Promise<void>;
  getMachines: () => MobileMachine[];
  saveMachine: (machine: MobileMachine, credential: string) => Promise<void>;
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
