import { lazy, Suspense } from "react";
import { Redirect } from "expo-router";
const FileStressScreen = lazy(() => import("@/features/workspace/file-stress-screen").then(module => ({ default: module.FileStressScreen })));
export default function DevFiles() {
  return __DEV__ ? <Suspense fallback={null}><FileStressScreen /></Suspense> : <Redirect href="/" />;
}
