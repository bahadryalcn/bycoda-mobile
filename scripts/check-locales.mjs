import { readFileSync } from "node:fs";
import { localeSource } from "./locale-source.mjs";
const root = new URL("../src/locales/", import.meta.url);
const source = localeSource();
const contract = readFileSync(
  new URL("../../src/shared/i18n/languages.ts", import.meta.url),
  "utf8",
);
const locales = [...contract.matchAll(/value: "([^"]+)"/g)].map((match) => match[1]);
const errors = [];
const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
const plugin = app.expo.plugins.find(
  (value) => Array.isArray(value) && value[0] === "expo-localization",
);
if (
  JSON.stringify(plugin?.[1]?.supportedLocales?.slice().sort()) !==
  JSON.stringify(locales.slice().sort())
)
  errors.push("Native supportedLocales must match the desktop language contract.");
const placeholders = (text) =>
  [...text.matchAll(/\{p\d+\}/g)]
    .map((match) => match[0])
    .sort()
    .join(",");
for (const locale of locales) {
  const catalog = JSON.parse(readFileSync(new URL(`${locale}.json`, root), "utf8"));
  for (const key of Object.keys(source)) {
    const value = catalog[key];
    if (typeof value !== "string" || !value.trim()) errors.push(`${locale}: missing ${key}`);
    else if (placeholders(key) !== placeholders(value))
      errors.push(`${locale}: placeholders changed in ${key}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Mobile locales passed: ${locales.length} languages, ${Object.keys(source).length} messages with matching placeholders.`,
  );
