import { useQuery } from "@tanstack/react-query";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { SecretRequestCard } from "./secret-request-card";
import {
  answerSecretRequest,
  SECRET_INPUT_CAPABILITY,
  SecretInputListResultSchema,
  secretExpired,
} from "./secret-request-model";

/** Only pending metadata enters query state; values stay inside the masked card. */
export function SessionSecretRequests({
  machineId,
  sessionId,
  disabled,
}: {
  machineId: string;
  sessionId: string;
  disabled: boolean;
}) {
  const client = useHostClient();
  const copy = useCopy();
  const active = useHostReadActive();
  const enabled =
    active &&
    !!client &&
    client.machine.id === machineId &&
    !disabled &&
    !!client.machine.capabilities?.includes(SECRET_INPUT_CAPABILITY);
  const pending = useQuery({
    queryKey: ["secret-inputs", machineId, sessionId],
    enabled,
    queryFn: async ({ signal }) =>
      SecretInputListResultSchema.parse(
        await client!.request("secrets.input.list", { sessionId }, { signal, retry: false }),
      ),
    refetchInterval: 1000,
    retry: false,
    gcTime: 0,
    networkMode: "always",
  });
  if (!enabled) return null;
  return (
    <>
      {pending.data?.requests
        .filter((request) => request.sessionId === sessionId && !secretExpired(request, Date.now()))
        .map((request) => (
          <SecretRequestCard
            key={`${machineId}:${request.id}:${request.signature}`}
            request={{
              ...request,
              title: copy("Gizli bilgi isteği", "Secret request"),
              confirmLabel: copy("Gizli bilgiyi kaydet", "Save secret"),
              cancelLabel: copy("İptal", "Cancel"),
            }}
            expired={false}
            onAnswer={async (answer) => {
              try {
                await answerSecretRequest(client!, request, answer);
              } finally {
                await pending.refetch();
              }
            }}
          />
        ))}
    </>
  );
}
