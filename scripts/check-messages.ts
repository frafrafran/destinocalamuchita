/**
 * Verifies every locale file has exactly the same keys as messages/es.json (the source language).
 *   npx tsx scripts/check-messages.ts
 */
import { readFileSync } from "node:fs";
import { LOCALES } from "../src/i18n/config";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  );
}

const load = (locale: string) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Tree;
const source = new Set(keys(load("es")));
let problems = 0;
function report(message: string) {
  problems++;
  console.error(message);
}

// next-intl uses "." for nesting, so it can never appear inside a single key.
function dottedKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => [
    ...(key.includes(".") ? [`${prefix}${key}`] : []),
    ...(typeof value === "string" ? [] : dottedKeys(value, `${prefix}${key}.`)),
  ]);
}
for (const locale of LOCALES) {
  for (const key of dottedKeys(load(locale))) report(`[${locale}] key contains a dot: ${key}`);
}

for (const locale of LOCALES.filter((l) => l !== "es")) {
  const target = new Set(keys(load(locale)));
  for (const key of source) if (!target.has(key)) report(`[${locale}] missing: ${key}`);
  for (const key of target) if (!source.has(key)) report(`[${locale}] extra: ${key}`);
}

if (problems) {
  console.error(`\n${problems} problem(s) found.`);
  process.exit(1);
}
console.log(`All ${LOCALES.length} locales have the same ${source.size} keys.`);
