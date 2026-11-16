import type { HostProjectDirectory } from "../domain/types";
import { ProjectDirectorySchema } from "../../../src/shared/model/host-contracts";

/** Host capability: the environment stream carries `directory` beside the legacy `projects`. */
export const DIRECTORY_STREAM_CAPABILITY = "projects.directory.stream.v1";

/** The payload is not what the phone expects; polling `projects.directory` is the safe path. */
export class DirectoryStreamSchemaError extends Error {
  constructor(reason: string) {
    super(`The project directory stream changed shape: ${reason}.`);
    this.name = "DirectoryStreamSchemaError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Validate the full directory contract, including optional appearance and layout fields,
 * before any data reaches the visibility proof or its consumers.
 */
export function parseDirectoryStream(data: unknown): HostProjectDirectory {
  if (!isRecord(data) || !isRecord(data.directory)) throw new DirectoryStreamSchemaError("directory");
  const parsed = ProjectDirectorySchema.safeParse(data.directory);
  if (!parsed.success) throw new DirectoryStreamSchemaError("invalid directory");
  return parsed.data;
}
