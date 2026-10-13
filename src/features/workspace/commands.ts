import type { HostTransport } from "@/remote/transport";
import type { CommandReceipt } from "./wire";

type CommandClient = Pick<HostTransport, "machine" | "request">;
export class UncertainCommand extends Error {
  constructor(
    readonly commandId: string,
    readonly machineId: string,
    readonly client: CommandClient,
  ) {
    super(
      "Connection interrupted. Check whether the computer accepted this command before trying again.",
    );
    this.name = "UncertainCommand";
  }
}

/** A failed write is reconciled by its receipt, never by dispatching it twice. */
export async function dispatchCommand(
  client: CommandClient,
  commandId: string,
  params: Record<string, unknown>,
): Promise<CommandReceipt> {
  try {
    return await client.request<CommandReceipt>(
      "commands.dispatch",
      { ...params, commandId },
      { retry: false },
    );
  } catch (error) {
    const kind = (error as { kind?: string })?.kind;
    const uncertain = (error as { uncertain?: boolean })?.uncertain;
    if (kind && !uncertain && !["network", "timeout", "aborted"].includes(kind)) throw error;
    try {
      const receipt = await client.request<CommandReceipt | null>("commands.status", { commandId });
      if (receipt) return receipt;
    } catch {
      /* Explicit recovery remains bound to the original computer. */
    }
    throw new UncertainCommand(commandId, client.machine.id, client);
  }
}
