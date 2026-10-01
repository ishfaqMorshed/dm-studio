// DM Studio · Node shim for the Edge Function unit tests (spec 3.4).
// deno is not installed on the studio machines; node >= 22.18 strips types natively, so the Deno.test files run as is.
//   npm run test:functions            -> every suite
//   node --experimental-strip-types supabase/functions/_test/run.mjs prompt-engine   -> suites whose path contains the word
// Exit code 1 when any test fails. Test files never import from jsr:, only relative .ts / .json (with { type: "json" }).
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const suites = [
  "../prompt-engine/render_test.ts",
  "../qc-judge/qc_test.ts",
  "../style-card-check/check_test.ts",
].map((p) => resolve(here, p));
const filter = process.argv.slice(2);
const selected = filter.length ? suites.filter((f) => filter.some((w) => f.includes(w))) : suites;
if (!selected.length) {
  console.error("no suite matches " + filter.join(" "));
  process.exit(1);
}

const tests = [];
let current = "";
globalThis.Deno = {
  test: (nameOrDef, fn) => {
    if (typeof nameOrDef === "object" && nameOrDef) tests.push({ suite: current, name: nameOrDef.name, fn: nameOrDef.fn ?? fn });
    else tests.push({ suite: current, name: String(nameOrDef), fn });
  },
  env: { get: () => undefined },
  serve: () => undefined,
};

for (const file of selected) {
  current = file.replace(/^.*\/supabase\/functions\//, "");
  await import("file://" + file);
}

let failed = 0;
const started = Date.now();
for (const t of tests) {
  try {
    await t.fn();
    console.log("ok   - [" + t.suite + "] " + t.name);
  } catch (e) {
    failed++;
    console.log("FAIL - [" + t.suite + "] " + t.name + "\n       " + String(e && e.message ? e.message : e).split("\n").join("\n       "));
  }
}
const bySuite = {};
for (const t of tests) bySuite[t.suite] = (bySuite[t.suite] ?? 0) + 1;
console.log("\n" + Object.entries(bySuite).map(([k, n]) => k + ": " + n).join(" | "));
console.log((tests.length - failed) + "/" + tests.length + " passed" + (failed ? ", " + failed + " FAILED" : "") + " in " + (Date.now() - started) + " ms");
process.exit(failed ? 1 : 0);
