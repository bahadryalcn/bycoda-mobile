import AsyncStorage from "@react-native-async-storage/async-storage";
import { readPreviewIntent, type PreviewIntent, type PreviewScope } from "./device-preview-model";
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(run: () => Promise<T>): Promise<T> => { const next = queue.then(run, run); queue = next.catch(() => {}); return next; };
const key = (scope: PreviewScope) => `bycoda.device-preview.v1:${[scope.machineId, scope.environmentId, scope.projectId, scope.deviceId].map(encodeURIComponent).join(":")}`;
/** A retained value that exists but cannot be trusted: distinct from a failed storage read and from no intent. */
export class InvalidPreviewIntentError extends Error {
  constructor(message = "Invalid saved device preview") { super(message); this.name = "InvalidPreviewIntentError"; Object.setPrototypeOf(this, InvalidPreviewIntentError.prototype); }
}
export const isInvalidPreviewIntentError = (error: unknown): error is InvalidPreviewIntentError => error instanceof InvalidPreviewIntentError;
const parse = (raw: string): PreviewIntent => {
  try { if (raw.length > 20000) throw new Error("Invalid saved device preview"); return readPreviewIntent(JSON.parse(raw)); }
  catch { throw new InvalidPreviewIntentError(); }
};
export const loadPreviewIntent = (scope: PreviewScope) => serial(async () => { const raw = await AsyncStorage.getItem(key(scope)); const value = raw === null ? null : parse(raw); if (value && value.deviceId !== scope.deviceId) throw new InvalidPreviewIntentError("The saved preview belongs to another device"); return value; });
export const claimPreviewIntent = (scope: PreviewScope, intent: PreviewIntent) => serial(async () => {
  const checked = readPreviewIntent(intent); if (checked.deviceId !== scope.deviceId) throw new Error("The preview belongs to another device");
  if (await AsyncStorage.getItem(key(scope)) !== null) throw new Error("Reconcile the existing device preview before starting another");
  await AsyncStorage.setItem(key(scope), JSON.stringify(checked));
});
export const clearPreviewIntent = (scope: PreviewScope, requestId: string) => serial(async () => {
  const raw = await AsyncStorage.getItem(key(scope)); if (raw !== null && parse(raw).requestId === requestId) await AsyncStorage.removeItem(key(scope));
});
/**
 * Explicit, reviewed recovery for a retained value that is present but unreadable as an intent.
 * It removes only a value that is still invalid inside the same serialized storage queue; a
 * readable intent is never removed here, and this never starts or replays a preview.
 */
export const discardInvalidPreviewIntent = (scope: PreviewScope) => serial(async (): Promise<"empty" | "kept" | "discarded"> => {
  const raw = await AsyncStorage.getItem(key(scope)); if (raw === null) return "empty";
  try { if (parse(raw).deviceId === scope.deviceId) return "kept"; } catch (cause) { if (!isInvalidPreviewIntentError(cause)) throw cause; }
  await AsyncStorage.removeItem(key(scope)); return "discarded";
});
