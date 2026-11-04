// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { usePrivateMediaData } from "./use-private-media-data";

it("uses authoritative cache proof instead of a stale successful observer snapshot", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const cache = new QueryClient(), key = ["private-media", "same-file"];
  cache.setQueryData(key, "private bytes");
  const owner = cache.getQueryCache().find({ queryKey: key })!;
  const root = createRoot(document.createElement("div")); let visible: string | undefined;
  function Probe() { visible = usePrivateMediaData(key, { data: "private bytes", error: null, isError: false, isSuccess: true, isFetching: false }); return null; }
  const render = () => act(() => root.render(h(QueryClientProvider, { client: cache }, h(Probe))));
  try {
    owner.setState({ status: "error", error: Object.assign(new Error("denied"), { kind: "auth" }) });
    render(); expect(visible).toBeUndefined();
    owner.setState({ status: "error", error: new Error("network") });
    render(); expect(visible).toBeUndefined();
    owner.setState({ status: "success", error: null, fetchStatus: "paused" });
    render(); expect(visible).toBeUndefined();
    owner.setState({ status: "success", error: null, fetchStatus: "fetching" });
    render(); expect(visible).toBeUndefined();
    owner.setState({ status: "success", error: null, fetchStatus: "idle" });
    render(); expect(visible).toBe("private bytes");
    cache.removeQueries({ queryKey: key, exact: true });
    render(); expect(visible).toBeUndefined();
  } finally { act(() => root.unmount()); cache.clear(); }
});
