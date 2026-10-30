import { useEffect, useRef, type RefObject } from "react";

/** True while the component is mounted; async completions use it to skip state updates after unmount. */
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
