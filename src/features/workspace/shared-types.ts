import type { CommandReceipt } from "@/domain/types";
import type { HostTransport } from "@/remote/transport";
import type { UncertainCommand } from "./commands";

export type CommandInvocation = {
  client: HostTransport | null;
  machineId: string | null;
  params: Record<string, unknown>;
  commandId: string;
  invalidate: readonly unknown[];
};

export type CommandErrorProps = {
  error: unknown;
  onRecovered?: (receipt: CommandReceipt) => void;
  onDismiss?: () => void;
};

export type CommandStatusCheck = {
  commandId: string;
  client: UncertainCommand["client"];
  recovered?: (receipt: CommandReceipt) => void;
};
