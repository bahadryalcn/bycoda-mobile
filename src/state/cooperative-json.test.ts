import { describe, expect, it } from "vitest";
import { parseJsonParts } from "./cooperative-json";

const split = (text: string, width: number) => {
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += width)
    parts.push(text.slice(index, index + width));
  return parts;
};

// Compare JSON's own values/descriptors directly: generic deep comparators
// treat an own `constructor` object as a class constructor and can reject two
// equivalent JSON objects. This also preserves -0 and avoids recursive tests.
const expectSameJson = (actual: unknown, expected: unknown) => {
  const pending: [unknown, unknown][] = [[actual, expected]];
  while (pending.length) {
    const [left, right] = pending.pop()!;
    if (right !== null && typeof right === "object") {
      expect(left !== null && typeof left === "object").toBe(true);
      expect(Object.getPrototypeOf(left)).toBe(Object.getPrototypeOf(right));
      expect(Object.keys(left as object)).toEqual(Object.keys(right));
      for (const key of Object.keys(right)) {
        const actualProperty = Object.getOwnPropertyDescriptor(left, key)!;
        const expectedProperty = Object.getOwnPropertyDescriptor(right, key)!;
        expect(actualProperty.enumerable).toBe(expectedProperty.enumerable);
        expect(actualProperty.writable).toBe(expectedProperty.writable);
        expect(actualProperty.configurable).toBe(expectedProperty.configurable);
        pending.push([actualProperty.value, expectedProperty.value]);
      }
    } else expect(Object.is(left, right)).toBe(true);
  }
};

describe("cooperative JSON decoding", () => {
  it.each([
    "null",
    "true",
    "false",
    "0",
    "-0",
    "-0.0e4",
    "1e400",
    "-1e400",
    "1e-400",
    "4.9406564584124654e-324",
    "2.2250738585072014e-308",
    "9007199254740993",
    "1234567890123456789012345678901234567890.123456789e-20",
    "1E+3",
    "-12.34e-5",
    '""',
    '"raw 🙂 Türkçe \u2028\u2029"',
    '"\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0000\\ud83d\\ude42\\ud800"',
    '"\ud800\udc00\ud800"',
    "[]",
    "{}",
    "[true,false,null,{},[1,2,3]]",
    '{"__proto__":{"polluted":true},"constructor":7,"x":1,"x":2,"2":"two","1":"one","01":0}',
    ' \r\n\t { "a" : [ -0, "x" ], "b" : {} } \n',
  ])("matches native scalar/container semantics for %s", async (json) => {
    const expected = JSON.parse(json);
    for (const width of [1, 7, 31, json.length + 1])
      expect(await parseJsonParts(split(json, width))).toStrictEqual(expected);
  });

  it("defines __proto__ as an own data property and preserves integer key ordering", async () => {
    const value = (await parseJsonParts([
      '{"__pro',
      'to__":1,"2":2,"1":1,"__proto__":3}',
    ])) as object;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(value, "__proto__")).toEqual({
      value: 3,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    expect(Object.keys(value)).toEqual(["1", "2", "__proto__"]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("handles every possible chunk boundary through escapes, surrogate pairs and exponents", async () => {
    const text = '{"a":"🙂\\ud83d\\ude42\\u0000\\\"\\\\","n":-123.456e+12,"b":[null,true,false]}';
    for (let index = 0; index <= text.length; index++)
      expect(
        await parseJsonParts(["", text.slice(0, index), "", text.slice(index), ""]),
      ).toStrictEqual(JSON.parse(text));
  });

  it.each([
    "",
    " \t\r\n",
    "undefined",
    "NaN",
    "Infinity",
    "+1",
    ".1",
    "01",
    "-01",
    "1.",
    "1e",
    "1e+",
    "1e-",
    "1e1e1",
    "--1",
    "nul",
    "truefalse",
    "null null",
    "[",
    "{",
    "[1,]",
    "[1 2]",
    "[,1]",
    "{a:1}",
    '{"a":}',
    '{"a":1,}',
    '{"a" 1}',
    '{"a":1 "b":2}',
    '"unterminated',
    '"\\"',
    '"\\v"',
    '"\\u12"',
    '"\\u12xz"',
    '"a\nb"',
    '"\u0000"',
    "\u00a0null",
    "\ufeffnull",
    "[1]]",
    "{}[]",
  ])("rejects malformed JSON %s", async (text) => {
    expect(() => JSON.parse(text)).toThrow();
    await expect(parseJsonParts(split(text, 1))).rejects.toBeInstanceOf(SyntaxError);
  });

  it("matches deterministic diverse nested JSON and mutated input fuzz cases", async () => {
    let seed = 0x12ab34cd;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const strings = [
      "",
      'quoted"\\',
      "\0\b\f\n\r\t",
      "🙂",
      "\ud800",
      "Türkçe",
      "__proto__",
      "\u2028",
    ];
    const value = (depth: number): unknown => {
      const kind = Math.floor(random() * (depth ? 6 : 4));
      if (kind === 0) return null;
      if (kind === 1) return random() > 0.5;
      if (kind === 2) return (random() - 0.5) * 10 ** Math.floor(random() * 600 - 300);
      if (kind === 3) return strings[Math.floor(random() * strings.length)];
      if (kind === 4)
        return Array.from({ length: Math.floor(random() * 6) }, () => value(depth - 1));
      const object = {};
      for (let i = 0; i < Math.floor(random() * 6); i++)
        Object.defineProperty(
          object,
          ["__proto__", "constructor", "0", "2", "text"][Math.floor(random() * 5)],
          {
            value: value(depth - 1),
            configurable: true,
            writable: true,
            enumerable: true,
          },
        );
      return object;
    };
    const alphabet = '{}[],:"\\-+0a\n';
    for (let i = 0; i < 400; i++) {
      const json = JSON.stringify(value(5));
      expectSameJson(
        await parseJsonParts(split(json, 1 + Math.floor(random() * 19))),
        JSON.parse(json),
      );
      const index = Math.floor(random() * (json.length + 1));
      const mutation =
        json.slice(0, index) +
        alphabet[Math.floor(random() * alphabet.length)] +
        json.slice(index + 1);
      let expected: unknown;
      try {
        expected = JSON.parse(mutation);
      } catch {
        await expect(parseJsonParts(split(mutation, 3))).rejects.toBeInstanceOf(SyntaxError);
        continue;
      }
      expectSameJson(await parseJsonParts(split(mutation, 3)), expected);
    }
  });

  it("decodes very deep containers without recursive parser calls", async () => {
    const depth = 20_000;
    const text = "[".repeat(depth) + "0" + "]".repeat(depth);
    let value = await parseJsonParts([text]);
    for (let i = 0; i < depth; i++) {
      expect(Array.isArray(value)).toBe(true);
      value = (value as unknown[])[0];
    }
    expect(value).toBe(0);
  });

  it.each(["string", "escaped", "array", "number"])(
    "allows timers to progress inside one huge %s",
    async (kind) => {
      const text =
        kind === "string"
          ? '"' + "x".repeat(1_000_000) + '"'
          : kind === "escaped"
            ? '"' + "\\ud83d\\ude42".repeat(70_000) + '"'
            : kind === "array"
              ? "[" + "123,".repeat(100_000) + "0]"
              : "1" + "0".repeat(400_000);
      let progress = 0;
      const timer = setInterval(() => progress++, 0);
      try {
        const actual = await parseJsonParts([text]);
        expect(progress).toBeGreaterThan(1);
        expect(actual).toStrictEqual(JSON.parse(text));
      } finally {
        clearInterval(timer);
      }
    },
  );

  it("rejects cancellation before and during a large scalar, without publishing partial data", async () => {
    const controller = new AbortController();
    const pending = parseJsonParts(['"' + "x".repeat(2_000_000) + '"'], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(parseJsonParts(["null"], { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("rechecks its owner after yielding and before publishing even a small value", async () => {
    let allowed = true;
    const error = new Error("Access changed");
    const assertCurrent = () => {
      if (!allowed) throw error;
    };
    const pending = parseJsonParts(['"' + "x".repeat(500_000) + '"'], { assertCurrent });
    setTimeout(() => {
      allowed = false;
    }, 0);
    await expect(pending).rejects.toBe(error);
    let checks = 0;
    await expect(
      parseJsonParts(["null"], {
        assertCurrent: () => {
          if (++checks === 2) throw error;
        },
      }),
    ).rejects.toBe(error);
    expect(checks).toBe(2);
  });

  it("matches JSON.parse on long plain strings split across parts, with escapes and control characters", async () => {
    const base64 = "QUJD".repeat(60_000);
    const source = JSON.stringify({ mime: "image/png", base64, note: 'a"b\\cé\n' + base64.slice(0, 9) });
    for (const width of [7, 4096, 65_536, source.length])
      expectSameJson(await parseJsonParts(split(source, width)), JSON.parse(source));
    await expect(parseJsonParts(['"' + "x".repeat(40_000) + "\n" + '"'])).rejects.toThrow(SyntaxError);
    await expect(parseJsonParts(['"' + "x".repeat(40_000), '"'])).resolves.toBe("x".repeat(40_000));
  });
});
