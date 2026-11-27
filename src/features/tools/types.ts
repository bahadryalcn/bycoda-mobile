export type {
  DevServer,
  DevServerDetails,
  DevServerScan,
  DevServerStartResult,
  DevServerStop,
  DevServerTarget,
} from "../../../../src/features/host-tools/devServerTypes";
export type {
  RuntimeLogEntry,
  RuntimeLogLevel,
  RuntimeLogSnapshot,
  RuntimeLogSource,
} from "../../../../src/features/host-tools/runtimeLogTypes";
export type { DeviceAction, DeviceFrame, DeviceHostStatus, DeviceSummary } from "../../../../src/features/devices/types";

export type BrowserState = {
  open: boolean;
  url: string | null;
  controlling: boolean;
  leaseId?: string;
  leaseExpiresAt?: number;
  /** A live lease's holder without its identity; with `controlling` false another client has the browser. */
  heldBy?: { kind: "session"; sessionId: string } | { kind: "controller" };
  data?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  navigationId?: string;
  annotationId?: string;
  selection?: import("../../../../src/shared/lib/browserAnnotation").BrowserAnnotationCapture;
  runtime?: { installed: boolean; installing: boolean; version: string };
};
