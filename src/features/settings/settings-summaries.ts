import type { PermissionRead, PermissionReads } from "../permissions/device-permission-status";
import { permissionKinds } from "../permissions/device-permission-status";

type Copy = (tr: string, en: string, params?: Record<string, string | number>) => string;

/** This phone's notification permission in one vocabulary, shared by the root and the Notifications page. */
export type NotificationPermissionState = "on" | "off" | "blocked";
export function notificationStateLabel(state: NotificationPermissionState, copy: Copy): string {
  return state === "on" ? copy("Açık", "On")
    : state === "off" ? copy("Kapalı", "Off")
      : copy("Telefon ayarlarında kapalı", "Off in phone settings");
}

/** Settings root value for Notifications: what the phone allows, not each event choice. */
export function notificationSummary(read: PermissionRead, copy: Copy): string | undefined {
  if (read.status === "error") return copy("Durum okunamadı", "Status unavailable");
  if (read.status !== "ready") return undefined;
  if (read.permission.granted) return notificationStateLabel("on", copy);
  if (read.permission.status === "undetermined" || read.permission.canAskAgain) return notificationStateLabel("off", copy);
  return notificationStateLabel("blocked", copy);
}

/** Settings root value for Phone permissions: how many of the readable permissions are allowed. */
export function permissionSummary(reads: PermissionReads, copy: Copy): string | undefined {
  const ready = permissionKinds.map((kind) => reads[kind]).filter((read) => read.status === "ready");
  if (ready.length < permissionKinds.length) {
    return permissionKinds.some((kind) => reads[kind].status === "error") ? copy("Durum okunamadı", "Status unavailable") : undefined;
  }
  const granted = ready.filter((read) => read.status === "ready" && read.permission.granted).length;
  return granted === ready.length
    ? copy("Tümüne izin verildi", "All allowed")
    : copy("{p0} / {p1} izin verildi", "{p0} of {p1} allowed", { p0: granted, p1: ready.length });
}

/** On/Off value shared by switches summarised on the root (app lock). */
export function onOffSummary(value: boolean, copy: Copy): string {
  return value ? copy("Açık", "On") : copy("Kapalı", "Off");
}

/** The identity row: the name and e-mail when both exist, otherwise whichever is known. */
export function identitySummary(user: { displayName?: string | null; email?: string | null } | undefined) {
  const name = user?.displayName?.trim() || user?.email?.trim() || "";
  const detail = user?.displayName?.trim() && user.email ? user.email : undefined;
  return { name, detail };
}
