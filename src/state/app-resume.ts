/**
 * App lifecycle decisions, kept free of React Native so they can be tested.
 *
 * Screenshots, the notification shade, permission prompts, share sheets and biometric windows briefly
 * report `inactive` (iOS), `background` (Android pauses the activity for another one) or only a window
 * blur (Android overlays). None of these is a real stay away: the mounted workspace, its cached reads
 * and its project-visibility proof stay as they are, and the resumed socket refreshes stale reads
 * quietly. Only a stay in the background of at least `LONG_AWAY_MS` expires the privacy proof, so
 * private content is checked again before it shows.
 */
export const LONG_AWAY_MS = 30_000;

export type AppLifecycleEffects = {
  /** Background reconnect time is no failed reconnect the user watched. */
  holdClocks(): void;
  /** Feedback graces restart while the resumed socket reconnects. */
  resumeClocks(): void;
  /** The OS closes the host socket in the background; in-flight reads cannot complete there. */
  cancelReads(): void;
  /** The process may be suspended or killed: coalesced drafts must reach disk first. */
  flushDrafts(): void;
  /** Expire project-visibility proof (not transcripts or drafts) after a real stay away. */
  expirePrivacy(): void;
};

export type AppLifecycleEvent = "inactive" | "background" | "brief-return" | "long-return" | null;

type Timer = ReturnType<typeof setTimeout>;

export function createAppLifecycleController(
  effects: AppLifecycleEffects,
  options: {
    initial?: string | null;
    now?: () => number;
    schedule?: (run: () => void, ms: number) => Timer;
    cancel?: (timer: Timer) => void;
  } = {},
) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = options.cancel ?? ((timer) => clearTimeout(timer));
  let state = options.initial ?? "active";
  let leftAt: number | undefined;
  let timer: Timer | undefined;
  let expired = false;
  const disarm = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const expire = () => {
    timer = undefined;
    if (expired) return;
    expired = true;
    effects.expirePrivacy();
  };
  return {
    appState(next: string): AppLifecycleEvent {
      if (next === state) return null;
      state = next;
      if (next === "background") {
        effects.holdClocks();
        effects.cancelReads();
        effects.flushDrafts();
        if (leftAt === undefined) {
          leftAt = now();
          expired = false;
          // Android may keep JavaScript running in the background: expire on time there. iOS
          // suspends it, so the return below checks the elapsed time as well.
          timer = schedule(expire, LONG_AWAY_MS);
        }
        return "background";
      }
      if (next === "inactive") {
        // A covering system surface: the app is still visible. Nothing is cancelled or expired.
        effects.flushDrafts();
        return "inactive";
      }
      if (next !== "active") return null;
      effects.resumeClocks();
      if (leftAt === undefined) return "brief-return";
      const away = now() - leftAt;
      leftAt = undefined;
      disarm();
      if (away < LONG_AWAY_MS && !expired) return "brief-return";
      expire();
      return "long-return";
    },
    /** An Android overlay took window focus; the app stays visible underneath. */
    windowBlur() {
      effects.flushDrafts();
    },
    dispose: disarm,
  };
}

type FocusInput = { status: string; enabled: boolean; appState: string; windowFocused: boolean };

/**
 * Whether React Query treats the app as focused. A visible app covered by a system surface stays
 * focused while the app lock is off, so returning from it does not refetch every read. With the lock
 * on, any cover fences host access, so reads pause until the app is in front again.
 */
export function hostQueriesFocused(state: FocusInput): boolean {
  if (state.status !== "unlocked") return false;
  if (state.appState === "active") return state.windowFocused || !state.enabled;
  return state.appState === "inactive" && !state.enabled;
}

/**
 * Whether unlocked content stays mounted and proven. While the lock is off a system surface or a stay
 * away does not conceal it; the lifecycle controller expires its proof after a long stay. With the
 * lock on, the lock's own status conceals it: an "inactive" that keeps it unlocked is an app-initiated
 * system prompt (system-prompt.ts). Reads and actions keep their own foreground fences.
 */
export function contentRetained(state: Omit<FocusInput, "windowFocused">, native = true): boolean {
  return state.status === "unlocked" && (!native || !state.enabled || state.appState !== "background");
}
