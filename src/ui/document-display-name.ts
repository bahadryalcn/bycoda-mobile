/** Display only: keep the original path for resolution, validation, and transport. */
export function documentDisplayName(path: string): string {
  const name = path.replace(/[\\/]$/, "").split(/[\\/]/).pop() || path;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
