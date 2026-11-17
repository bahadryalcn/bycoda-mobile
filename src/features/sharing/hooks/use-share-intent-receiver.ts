import { useEffect } from "react";
import { router, useRootNavigationState } from "expo-router";
import { useShareIntent } from "expo-share-intent";

import { launchFromShare, useLaunchRequest } from "../model/launch-request";

let sequence = 0;

/**
 * Receives what other apps share (text, links, images, files), cold or warm, and opens the
 * new-session sheet with it. The content waits in the launch queue until the owner starts a
 * session; it lands in that session's composer draft and is never sent automatically.
 * Mounted once with the app lifecycle.
 */
export function useShareIntentReceiver() {
  const routerReady = !!useRootNavigationState()?.key;
  // resetOnBackground off: the share is moved into our queue at once, so nothing is lost
  // if the app is backgrounded while the sheet is still opening.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    resetOnBackground: false,
    disabled: process.env.EXPO_OS === "web",
  });

  // Reaction to the native module delivering a share; waits for the router on cold start.
  useEffect(() => {
    if (!hasShareIntent || !routerReady) return;
    const request = launchFromShare(shareIntent);
    resetShareIntent();
    if (!request) return;
    useLaunchRequest.getState().queue(request);
    sequence += 1;
    router.navigate(`/sessions?new=1&n=share${sequence}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetShareIntent is recreated on every render; the intent itself is the trigger.
  }, [hasShareIntent, shareIntent, routerReady]);
}
