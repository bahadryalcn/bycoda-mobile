export type SecurityError =
  "storage" | "not-secured" | "cancelled" | "failed" | "background";
export type AutoLockTimeoutMs = 0 | 30_000 | 60_000 | 300_000 | 900_000;

export type SecurityState = {
  status: "loading" | "locked" | "suspended" | "unlocked";
  enabled: boolean;
  autoLockTimeoutMs: AutoLockTimeoutMs;
  available: boolean;
  busy: boolean;
  appState: string;
  windowFocused: boolean;
  error: SecurityError | null;
  initialize(): Promise<void>;
  unlock(prompt: string): Promise<void>;
  setEnabled(value: boolean, prompt: string): Promise<void>;
  setAutoLockTimeout(value: AutoLockTimeoutMs, prompt: string): Promise<void>;
  lock(): void;
  handleAppState(state: string): void;
  handleWindowFocus(focused: boolean): void;
};
