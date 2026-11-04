import { Body, Disclosure } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { DesktopPreferencesSnapshot } from "./desktop-preferences-model";

/** Read-only identity from the already-authorized opening scope; never a scope selector. */
export function DesktopPreferenceContext({ computerName, snapshot }: {
  computerName: string;
  snapshot?: Pick<DesktopPreferencesSnapshot, "projectCwd" | "workingCwd">;
}) {
  const copy = useCopy();
  if (!snapshot) return <Body muted>{computerName}</Body>;
  const projectName = snapshot.projectCwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || snapshot.projectCwd;
  return <Disclosure label={`${computerName} · ${projectName}`}>
    <Body muted selectable>{copy("Proje", "Project")}: {snapshot.projectCwd}</Body>
    {snapshot.workingCwd !== snapshot.projectCwd ? (
      <Body muted selectable>{copy("Çalışma dizini", "Working directory")}: {snapshot.workingCwd}</Body>
    ) : null}
  </Disclosure>;
}
