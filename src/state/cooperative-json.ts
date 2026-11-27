type ArrayFrame = { kind: "array"; value: unknown[]; expect: "first" | "value" | "comma" };
type ObjectFrame = {
  kind: "object";
  value: Record<string, unknown>;
  expect: "first" | "key" | "colon" | "value" | "comma";
  key: string;
};
type Frame = ArrayFrame | ObjectFrame;
type NumberStage =
  | "sign"
  | "zero"
  | "integer"
  | "dot"
  | "fraction"
  | "exponent"
  | "exponentSign"
  | "exponentDigits";

function cancelled(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw Object.assign(new Error("Transcript decoding was cancelled."), { name: "AbortError" });
}

/** Characters that end a run of plain string text: a quote, a backslash or a control character. */
const STRING_STOP = /["\\\u0000-\u001f]/g;

export type JsonDecodeOptions ={ signal?: AbortSignal; assertCurrent?: () => void };

export function assertDecodeCurrent(options: JsonDecodeOptions) {
  cancelled(options.signal);
  options.assertCurrent?.();
}

function yieldTurn(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      try {
        cancelled(signal);
      } catch (error) {
        reject(error);
      }
    };
    const timer = setTimeout(finish, 0);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Strict JSON decoding without a full-source join or recursive container calls.
 * Scanning yields after at most 16 Ki UTF-16 units or roughly four milliseconds.
 * Input strings stay immutable, including a surrogate/escape split across chunks.
 * Final string joins and native decimal-to-number conversion still allocate/convert
 * each complete scalar; neither hides a whole-document JSON.parse fallback.
 */
export async function parseJsonParts(
  parts: readonly string[],
  options: JsonDecodeOptions = {},
): Promise<unknown> {
  const { signal } = options;
  assertDecodeCurrent(options);
  let part = 0,
    offset = 0,
    position = 0;
  let root: unknown;
  let hasRoot = false;
  const stack: Frame[] = [];
  let mode: "structure" | "string" | "number" | "literal" = "structure";
  let pieces: string[] = [];
  let tokenBuffer = "";
  let segment = 0;
  let stringKey = false;
  // 0 = plain text, 1 = escaped character, 2..5 = unicode hex digits.
  let escape = 0,
    unicode = 0;
  let numberStage: NumberStage = "integer";
  let literal = "",
    literalOffset = 0;
  let ticks = 0,
    units = 0,
    sliceStarted = Date.now();
  // Where the current plain-string run ends in parts[stopPart], found once per run.
  let stopPart = -1,
    stopAt = 0;
  const invalid = (): never => {
    throw new SyntaxError(`Invalid JSON at UTF-16 offset ${position}.`);
  };
  const appendPiece = (value: string) => {
    if (!value) return;
    if (value.length >= 4096) {
      if (tokenBuffer) pieces.push(tokenBuffer);
      tokenBuffer = "";
      pieces.push(value);
    } else {
      tokenBuffer += value;
      if (tokenBuffer.length >= 4096) {
        pieces.push(tokenBuffer);
        tokenBuffer = "";
      }
    }
  };
  const finishToken = () => {
    if (tokenBuffer) pieces.push(tokenBuffer);
    const value = pieces.join("");
    pieces = [];
    tokenBuffer = "";
    return value;
  };
  const accept = (value: unknown) => {
    const frame = stack[stack.length - 1];
    if (!frame) {
      if (hasRoot) invalid();
      root = value;
      hasRoot = true;
    } else if (frame.kind === "array") {
      if (frame.expect !== "first" && frame.expect !== "value") invalid();
      frame.value.push(value);
      frame.expect = "comma";
    } else {
      if (frame.expect !== "value") invalid();
      // Assignment would invoke Object.prototype.__proto__ instead of matching
      // JSON.parse's own, writable data property (including duplicate keys).
      Object.defineProperty(frame.value, frame.key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      frame.expect = "comma";
    }
  };
  const finishNumber = () => {
    if (["sign", "dot", "exponent", "exponentSign"].includes(numberStage)) invalid();
    appendPiece(parts[part]?.slice(segment, offset) ?? "");
    accept(Number(finishToken()));
    mode = "structure";
  };
  const beginString = (key: boolean) => {
    stringKey = key;
    pieces = [];
    tokenBuffer = "";
    segment = offset + 1;
    escape = 0;
    return "string" as const;
  };
  while (part < parts.length) {
    if (offset === parts[part].length) {
      if (mode === "number" || (mode === "string" && escape === 0))
        appendPiece(parts[part].slice(segment, offset));
      part++;
      offset = 0;
      segment = 0;
      continue;
    }
    if (++ticks >= 1024) {
      ticks = 0;
      assertDecodeCurrent(options);
      if (units >= 16 * 1024 || Date.now() - sliceStarted >= 4) {
        await yieldTurn(signal);
        assertDecodeCurrent(options);
        units = 0;
        sliceStarted = Date.now();
      }
    }
    const text = parts[part];
    if (mode === "string" && escape === 0) {
      // Plain string text (a long base64 frame, say) needs no per-unit step: find the next quote,
      // backslash or control character natively once, then advance toward it in steps that
      // still end at the 16 Ki unit yield point.
      if (stopPart !== part || stopAt < offset) {
        STRING_STOP.lastIndex = offset;
        stopAt = STRING_STOP.exec(text)?.index ?? text.length;
        stopPart = part;
      }
      if (units >= 16 * 1024) {
        ticks = 1023;
        continue;
      }
      const target = Math.min(stopAt, offset + (16 * 1024 - units));
      if (target > offset) {
        const skipped = target - offset;
        offset = target;
        position += skipped;
        units += skipped;
        if (units >= 16 * 1024) ticks = 1023;
        continue;
      }
    }
    const code = text.charCodeAt(offset);
    const char = text[offset];
    let consume = true;
    if (mode === "string") {
      if (escape >= 2) {
        const hex =
          code >= 48 && code <= 57
            ? code - 48
            : code >= 65 && code <= 70
              ? code - 55
              : code >= 97 && code <= 102
                ? code - 87
                : -1;
        if (hex < 0) invalid();
        unicode = unicode * 16 + hex;
        if (escape++ === 5) {
          appendPiece(String.fromCharCode(unicode));
          escape = 0;
          segment = offset + 1;
        }
      } else if (escape === 1) {
        if (char === "u") {
          escape = 2;
          unicode = 0;
        } else {
          const decoded =
            char === '"' || char === "\\" || char === "/"
              ? char
              : char === "b"
                ? "\b"
                : char === "f"
                  ? "\f"
                  : char === "n"
                    ? "\n"
                    : char === "r"
                      ? "\r"
                      : char === "t"
                        ? "\t"
                        : undefined;
          if (decoded === undefined) invalid();
          appendPiece(decoded!);
          escape = 0;
          segment = offset + 1;
        }
      } else if (char === '"') {
        appendPiece(text.slice(segment, offset));
        const value = finishToken();
        mode = "structure";
        if (stringKey) {
          const frame = stack[stack.length - 1];
          if (!frame || frame.kind !== "object") invalid();
          const object = frame as ObjectFrame;
          object.key = value;
          object.expect = "colon";
        } else accept(value);
      } else if (char === "\\") {
        appendPiece(text.slice(segment, offset));
        escape = 1;
      } else if (code < 32) invalid();
    } else if (mode === "literal") {
      if (char !== literal[literalOffset++]) invalid();
      if (literalOffset === literal.length) {
        accept(literal === "true" ? true : literal === "false" ? false : null);
        mode = "structure";
      }
    } else if (mode === "number") {
      const digit = code >= 48 && code <= 57;
      if (numberStage === "sign") {
        if (!digit) invalid();
        numberStage = char === "0" ? "zero" : "integer";
      } else if (numberStage === "dot") {
        if (!digit) invalid();
        numberStage = "fraction";
      } else if (numberStage === "exponent" || numberStage === "exponentSign") {
        if (numberStage === "exponent" && (char === "+" || char === "-"))
          numberStage = "exponentSign";
        else {
          if (!digit) invalid();
          numberStage = "exponentDigits";
        }
      } else if (digit && numberStage !== "zero") {
        // Continue integer/fraction/exponent digits.
      } else if (char === "." && (numberStage === "integer" || numberStage === "zero"))
        numberStage = "dot";
      else if ((char === "e" || char === "E") && numberStage !== "exponentDigits")
        numberStage = "exponent";
      else {
        finishNumber();
        consume = false;
      }
    } else if (code === 32 || code === 9 || code === 10 || code === 13) {
      // JSON permits exactly these four whitespace characters.
    } else {
      const frame = stack[stack.length - 1];
      if (frame?.expect === "comma") {
        const close = frame.kind === "array" ? "]" : "}";
        if (char === close) stack.pop();
        else if (char === ",") frame.expect = frame.kind === "array" ? "value" : "key";
        else invalid();
      } else if (frame?.kind === "object" && frame.expect === "colon") {
        if (char !== ":") invalid();
        frame.expect = "value";
      } else if (frame?.kind === "object" && (frame.expect === "first" || frame.expect === "key")) {
        if (char === "}" && frame.expect === "first") stack.pop();
        else if (char === '"') mode = beginString(true);
        else invalid();
      } else if (frame?.kind === "array" && frame.expect === "first" && char === "]") stack.pop();
      else if (char === "{" || char === "[") {
        if (char === "{") {
          const value = {};
          accept(value);
          stack.push({ kind: "object", value, expect: "first", key: "" });
        } else {
          const value: unknown[] = [];
          accept(value);
          stack.push({ kind: "array", value, expect: "first" });
        }
      } else if (char === '"') mode = beginString(false);
      else if (char === "-" || (code >= 48 && code <= 57)) {
        mode = "number";
        pieces = [];
        tokenBuffer = "";
        segment = offset;
        numberStage = char === "-" ? "sign" : char === "0" ? "zero" : "integer";
      } else if (char === "t" || char === "f" || char === "n") {
        mode = "literal";
        literal = char === "t" ? "true" : char === "f" ? "false" : "null";
        literalOffset = 1;
      } else invalid();
    }
    if (consume) {
      offset++;
      position++;
      units++;
    }
  }
  if (mode === "number") finishNumber();
  if (mode !== "structure" || stack.length || !hasRoot) invalid();
  assertDecodeCurrent(options);
  return root;
}
