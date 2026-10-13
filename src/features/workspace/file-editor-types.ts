import type { NavigationAction } from "expo-router/react-navigation";
import type { WorkspaceTarget } from "@/remote/types";
export type DraftGuard = (() => Promise<void>) | null;
export type FileEditorConfirmation =
  | { kind: "leave"; action?: NavigationAction }
  | { kind: "reload" }
  | null;
export type FileEditorMode = "default" | "edit" | "preview";
export type FileEditorProps = WorkspaceTarget & {
  path: string;
  root?: string;
  onBack: () => void;
  onDraftGuard?: (guard: DraftGuard) => void;
};
