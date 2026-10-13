import { useEffect } from "react";
import { useSecurity } from "../../state/security";

/** Native portals cannot sit above the lock screen. Close immediately on lock. */
export function usePrivateOverlay(onClose?: () => void) {
  const unlocked = useSecurity((state) => state.status === "unlocked");
  useEffect(() => {
    if (!unlocked) onClose?.();
  }, [unlocked, onClose]);
  return unlocked;
}
