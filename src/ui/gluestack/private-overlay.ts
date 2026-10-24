import { useEffect } from "react";
import { useSecurity } from "../../state/security";
import { usePrivateContentAllowed } from "../private-content";

/** Native portals cannot sit above the lock screen. Close immediately on lock. */
export function usePrivateOverlay(onClose?: () => void) {
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const privateAllowed = usePrivateContentAllowed();
  useEffect(() => {
    if (!unlocked || !privateAllowed) onClose?.();
  }, [unlocked, privateAllowed, onClose]);
  return unlocked && privateAllowed;
}
