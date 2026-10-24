export function readInitializedSubmodules(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 256 || !value.every((path) => typeof path === "string" && path.length > 0 && path.length <= 4096 && !path.includes("\0") && !path.includes("\\") && !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && !path.split("/").some((part) => !part || part === "." || part === "..")))
    throw new Error("Invalid initialized submodule list.");
  return [...new Set(value as string[])].sort();
}
