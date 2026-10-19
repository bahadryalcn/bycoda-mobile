import { useMobileTheme } from "@/ui/theme";
import { CodeText, Loading as SharedLoading } from "../../ui/primitives";

export { uiStyles as styles } from "../../ui/styles";
export type ProjectScreenProps = { machineId: string; projectId: string };
export const commandId = () =>
  `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const workspaceKey = (machineId: string, projectId: string, ...parts: string[]) => [
  "host",
  machineId,
  projectId,
  ...parts,
];
export function Loading() {
  useMobileTheme();
  return <SharedLoading label="Yükleniyor…" centered />;
}
export function Mono({ children }: { children: string }) {
  useMobileTheme();
  return <CodeText>{children}</CodeText>;
}
