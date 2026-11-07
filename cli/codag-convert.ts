// Usage: node cli/codag-convert.ts <input> <output.csv> [service-name]
// Same converter as the web page, for files too big to paste.
import { readFileSync, writeFileSync } from "node:fs";
import { convert } from "../lib/convert.ts";

const [input, output, service = "app"] = process.argv.slice(2);

if (input === undefined || output === undefined) {
  console.error("usage: node cli/codag-convert.ts <input> <output.csv> [service-name]");
  process.exit(2);
}

const result = convert(readFileSync(input, "utf8"), service);

if (result === null) {
  console.error(
    "Unrecognized input. Supported: `docker logs --timestamps` / `kubectl logs --timestamps` text, or JSON lines with a time field.",
  );
  process.exit(1);
}

writeFileSync(output, result.csv);

console.error(
  `${result.format}: ${result.rows} rows, time units ${result.units.join(", ")}, ` +
    `${result.skipped.length} skipped${result.skipped.length > 0 ? ` (lines ${result.skipped.slice(0, 10).join(", ")})` : ""}`,
);

console.error(`Next: codag-log-mcp setup --log-file ${output}`);
