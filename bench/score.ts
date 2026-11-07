// Scores the claude -p runs against truth.json and writes sanitized logs + results.json.
// Usage: node bench/score.ts /tmp/codag-bench-run data/run
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";

// Only the parts of a claude -p stream-json event this script reads.
const streamEvent = z.object({
  type: z.string(),
  result: z.string().optional().catch(undefined),
  message: z
    .object({ content: z.array(z.object({ type: z.string(), name: z.string().optional() }).loose()).catch([]) })
    .optional()
    .catch(undefined),
});

const [work, out] = process.argv.slice(2);
const truth = JSON.parse(readFileSync(path.join(out, "truth.json"), "utf8"));

const scrub = (text: string) =>
  text.replaceAll(os.homedir(), "~").replaceAll(work, ".").replaceAll(path.resolve(out), "data/run");

const runs = [];

for (const file of readdirSync(work).filter((name) => /^run-\d+\.jsonl$/.test(name)).toSorted()) {
  const kept: string[] = [];
  let calls = 0;
  let answer = "";

  for (const line of readFileSync(path.join(work, file), "utf8").split("\n")) {
    if (line === "") continue;
    const event = streamEvent.parse(JSON.parse(line));

    if (event.type === "system") continue; // init event lists local setup; not evidence

    if (event.type === "assistant") {
      for (const part of event.message?.content ?? []) if (part.type === "tool_use" && part.name?.startsWith("mcp__codag-logs__")) calls += 1;
    }

    if (event.type === "result" && event.result !== undefined) {
      const found = [...event.result.matchAll(/ANSWER:\s*(.+)/g)].at(-1);

      if (found) answer = found[1].trim();
    }

    kept.push(scrub(line));
  }

  writeFileSync(path.join(out, file.replace("run-", "agent-")), `${kept.join("\n")}\n`);
  const [user, first, last, count] = answer.split(/\s+/);

  const matches = (want: { first: string; last: string; count: number }) =>
    user === truth.user && first === want.first && last === want.last && Number(count) === want.count;

  const reading = matches(truth) ? "every failure" : matches(truth.burst) ? "sustained burst" : "wrong";
  runs.push({ id: Number(/\d+/.exec(file)?.[0]), calls, answer, correct: reading !== "wrong", reading });
}

writeFileSync(path.join(out, "results.json"), `${JSON.stringify(runs, null, 2)}\n`);

console.log(runs, truth);
