import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import {
  HOST_MODEL_ROUTING,
  ModelRoutingGetResultSchema,
  ModelRoutingResolveResultSchema,
  type ModelRoutingItemChoice,
  type ModelRoutingResolution,
  type ModelRoutingRole,
  type ModelRoutingState,
  type ModelRoutingTarget,
} from "../../../../../src/shared/model/host-contracts/model-routing";

/** Whether the paired computer offers model order and groups (`models.routing.v1`). */
export function useModelRoutingSupported(): boolean {
  return useActiveMachine()?.capabilities?.includes(HOST_MODEL_ROUTING) === true;
}

/** The Host-wide routing document: the model order (`entries`) and model groups (`pools`). Same cache as the crew editor and Work caps. */
export function useModelRouting(enabled = true) {
  const supported = useModelRoutingSupported();
  return useHostQuery<ModelRoutingState>(["modelRouting"], "modelRouting.get", {}, {
    enabled: enabled && supported,
    queryFn: async (client, signal) =>
      ModelRoutingGetResultSchema.parse(await client.request("modelRouting.get", {}, { signal })).state,
  });
}

/** Which model the next run would use for this choice, as the Host decides it now. */
export function useModelRoutingResolution(
  role: ModelRoutingRole,
  choice: ModelRoutingItemChoice | undefined,
  options: { enabled: boolean; version?: number; fixed?: ModelRoutingTarget },
) {
  const supported = useModelRoutingSupported();
  const params = {
    role,
    ...(choice ? { choice } : {}),
    ...(options.fixed ? { fixed: options.fixed } : {}),
  };
  return useHostQuery<ModelRoutingResolution>(
    ["modelRouting", "resolve", options.version ?? 0],
    "modelRouting.resolve",
    params,
    {
      enabled: options.enabled && supported,
      queryFn: async (client, signal) =>
        ModelRoutingResolveResultSchema.parse(await client.request("modelRouting.resolve", params, { signal }))
          .resolution,
    },
  );
}
