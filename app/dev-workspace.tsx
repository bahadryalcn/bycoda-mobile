import { lazy, Suspense } from "react";
import { Redirect } from "expo-router";
const WorkspaceStressScreen = lazy(() => import("@/features/workspace/workspace-stress-screen").then(module => ({ default: module.WorkspaceStressScreen })));
export default function DevWorkspace() {
  return __DEV__ ? <Suspense fallback={null}><WorkspaceStressScreen /></Suspense> : <Redirect href="/" />;
}
