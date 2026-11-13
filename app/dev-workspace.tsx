import { lazy, Suspense } from "react";
const WorkspaceStressScreen = lazy(() => import("@/features/workspace/workspace-stress-screen").then(module => ({ default: module.WorkspaceStressScreen })));
export default function DevWorkspace() {
  return __DEV__ ? <Suspense fallback={null}><WorkspaceStressScreen /></Suspense> : null;
}
