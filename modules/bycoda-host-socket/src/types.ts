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
export type TunnelTarget = {
  projectId: string;
  id: string;
  pid: number;
  startedAt: string;
  port: number;
  address: string;
};
export type TunnelStartInput = {
  /** Handle from `acquireCredential`; the bearer never reaches JavaScript. */
  credential: string;
  /** `wss://<host of the handle's binding>/ws-tunnel`. */
  endpoint: string;
  target: TunnelTarget;
};
export type TunnelStarted = { tunnelId: string; proxyPort: number; alias: string };
export type NativeTunnelEvent = {
  tunnelId: string;
  type: "error" | "closed";
  code?: string;
  message?: string;
};
export type TunnelNavigationChange = {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};
export type TunnelLoadError = { code: string; description: string };
/** Props of the native `BycodaTunnelWebView`; events arrive as `nativeEvent` payloads. */
export type TunnelWebViewProps = {
  proxyPort: number;
  alias: string;
  /** Initial `http://<alias>:<port>/path?query#hash`. */
  url: string;
  dataSaver: boolean;
  onNavigationChange?: (event: { nativeEvent: TunnelNavigationChange }) => void;
  onLoadError?: (event: { nativeEvent: TunnelLoadError }) => void;
  onExternalLink?: (event: { nativeEvent: { url: string } }) => void;
  style?: unknown;
};
/** Imperative commands exposed on the native view ref. */
export type TunnelWebViewCommands = {
  goBack(): Promise<void> | void;
  goForward(): Promise<void> | void;
  reload(): Promise<void> | void;
  stopLoading(): Promise<void> | void;
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
  /** iOS 17+ or Android WebView proxy override. Absent on older native builds. */
  tunnelSupported?(): boolean;
  startTunnel?(input: TunnelStartInput): Promise<TunnelStarted>;
  stopTunnel?(tunnelId: string): Promise<void>;
  addListener(
    event: "onSocketEvent",
    listener: (event: NativeSocketEvent) => void,
  ): { remove(): void };
  // `onTunnelEvent` (NativeTunnelEvent) shares this emitter; see `onTunnelEvent` in index.ts.
}
