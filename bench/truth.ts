// Ground truth straight from the raw docker capture, independent of the converter and of Codag.
// Usage: node bench/truth.ts data/run/postgres-docker.log
import { readFileSync } from "node:fs";

const lines = readFileSync(process.argv[2], "utf8").split("\n").filter((line) => line !== "");
const failures = new Map<string, string[]>();

for (const line of lines) {
  const match = /^(\S+) .*FATAL: {2}password authentication failed for user "([^"]+)"/.exec(line);

  if (match === null) continue;
  const times = failures.get(match[2]) ?? [];
  times.push(match[1]);
  failures.set(match[2], times);
}

const [user, times] = [...failures].toSorted((a, b) => b[1].length - a[1].length)[0];
const second = (iso: string) => iso.slice(11, 19);

// The sustained burst starts after the largest gap between consecutive failures.
let burstStart = 0;
let widest = 0;

for (let index = 1; index < times.length; index += 1) {
  const gap = Date.parse(times[index]) - Date.parse(times[index - 1]);

  if (gap > widest) {
    widest = gap;
    burstStart = index;
  }
}

const burst = times.slice(burstStart);

console.log(
  JSON.stringify({
    lines: lines.length,
    user,
    count: times.length,
    first: second(times[0]),
    last: second(times.at(-1) ?? times[0]),
    burst: { count: burst.length, first: second(burst[0]), last: second(burst.at(-1) ?? burst[0]) },
    others: Object.fromEntries([...failures].flatMap(([name, t]) => (name === user ? [] : [[name, t.length]]))),
  }),
);
