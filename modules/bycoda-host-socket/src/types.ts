export type PairedHostCa = {
  version: 1;
  environmentId: string;
  caGeneration: number;
  caCertificatePem: string;
  caSpkiPin: string;
};
export type CredentialBinding = {
  machineId: string;
  environmentId: string;
  endpoint: string;
  credentialGeneration: number;
  accessEpoch: number;
  /** Omitted only for ordinary WSS using the platform's public CA trust. */
  tls?: PairedHostCa;
};
export type NativeCredentialHandle = {
  handle: string;
  machineId: string;
  environmentId: string;
  credentialGeneration: number;
  accessEpoch: number;
};
export type NativeSocketEvent = {
  connectionId: string;
  environmentId: string;
  generation: number;
  type: "message" | "closed" | "error";
  sequence?: number;
  text?: string;
  code?: string;
};
export type NativeBulkDescriptor = {
  kind: "bulk";
  transferId: string;
  environmentId: string;
  totalBytes: number;
  chunkBytes: number;
  sha256: string;
  expiresAt: number;
};
export interface HostSocketNative {
  /** Native lock/epoch gate. Only separately admitted native voice peers may survive background. */
  setAccess(active: boolean, accessEpoch: number): Promise<void>;
  /** Reads existing SecureStore natively; bearer is never returned to JavaScript. */
  acquireCredential(binding: CredentialBinding): Promise<NativeCredentialHandle>;
  /** Foreground-only admission, fenced to an active native service and exact Room/project. */
  acquireVoiceCredential?(binding: CredentialBinding, sessionId: string, threadId: string, projectId: string | null): Promise<NativeCredentialHandle>;
  /** Input is owner-pairing material; this API has no secret getter. */
  storeCredential(binding: CredentialBinding, token: string): Promise<NativeCredentialHandle>;
  deleteCredential(machineId: string): Promise<void>;
  invalidateCredentials(machineId?: string): Promise<void>;
  open(handle: string, connectionId: string, generation: number): Promise<void>;
  openVoice?(handle: string, connectionId: string, generation: number, sessionId: string): Promise<void>;
  send(connectionId: string, generation: number, text: string): Promise<void>;
  acknowledge(connectionId: string, generation: number, sequence: number): Promise<void>;
  close(connectionId: string, generation: number): Promise<void>;
  readBulk(
    handle: string,
    descriptor: NativeBulkDescriptor,
    offset: number,
  ): Promise<{ dataBase64: string }>;
  addListener(
    event: "onSocketEvent",
    listener: (event: NativeSocketEvent) => void,
  ): { remove(): void };
}
