import { z } from "zod";
import {
  RpcErrorResponseSchema,
  RpcSuccessResponseSchema,
  SubscriptionEventSchema,
  type JsonValue,
} from "../../../src/shared/model/host-contracts";

/**
 * Inbound Host frames reach `MobileHostWsConnection.receive` after `JSON.parse`, so every
 * payload is already JSON by construction. The envelope therefore validates identity and
 * ordering fields only and leaves `data` / `result` opaque; the domain schema of each
 * consumer (session view, project list, directory, RPC `resultSchema`) is the one
 * validation of the payload. Outbound and Host-side schemas keep the full `z.json()` walk.
 */
const OpaqueJsonSchema = z.custom<JsonValue>((value) => value !== undefined);

const eventParams = SubscriptionEventSchema.shape.params.shape;
/** Same identity, cursor and kind rules as `SubscriptionEventSchema`, without re-walking `data`. */
export const InboundSubscriptionEventSchema = z.strictObject({
  jsonrpc: SubscriptionEventSchema.shape.jsonrpc,
  method: SubscriptionEventSchema.shape.method,
  params: z.strictObject({ ...eventParams, data: OpaqueJsonSchema.optional() }),
});

/** Same id and error rules as `RpcResponseSchema`, without re-walking `result`. */
export const InboundRpcResponseSchema = z.union([
  z.strictObject({
    jsonrpc: RpcSuccessResponseSchema.shape.jsonrpc,
    id: RpcSuccessResponseSchema.shape.id,
    result: OpaqueJsonSchema,
  }),
  RpcErrorResponseSchema,
]);

const NON_ASCII = /[^\x00-\x7f]/;

/**
 * Whether the UTF-8 encoding of `text` is at most `limit` bytes, without allocating the
 * encoded copy. UTF-16 units never exceed UTF-8 bytes and a unit never needs more than
 * three, which settles most frames; only a large frame with non-ASCII text is counted.
 */
export function utf8WithinLimit(text: string, limit: number): boolean {
  if (text.length > limit) return false;
  if (text.length * 3 <= limit || !NON_ASCII.test(text)) return true;
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (
      unit >= 0xd800 &&
      unit <= 0xdbff &&
      index + 1 < text.length &&
      (text.charCodeAt(index + 1) & 0xfc00) === 0xdc00
    ) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > limit) return false;
  }
  return true;
}
