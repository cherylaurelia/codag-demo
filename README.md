# Bring your logs to Codag's log MCP (unofficial)

Live: https://codag-bring-your-logs.vercel.app

[Codag](https://codag.ai)'s log MCP (`codag-log-mcp` 0.1.0, installed by `codag.ai/install.sh`) gives Claude Code, Codex and OpenCode search, template and time-window tools over a log file. It works well once the file fits: in the recorded run below, Claude Code got a Postgres auth incident right in 4 of 4 runs. Getting a file to fit is the hard part.

## What I hit (2026-11-07, codag-log-mcp 0.1.0, source 353957d, macOS arm64)

- **The docs Quickstart is out of date.** [codag.ai/docs](https://codag.ai/docs.html) ("Last synced 2026-08-16") says to run `install.sh`, then `codag setup` / `status` / `savings` / `doctor`. Since [2026-09-24](https://github.com/codag-megalith/codag-releases/commits/main), `install.sh` installs only `codag-log-mcp`, so in a clean HOME `codag setup` fails with `command not found` ([data/run/docs-break.txt](data/run/docs-break.txt)).
- **Setup takes two exact CSV headers and doesn't say which.** `codag-log-mcp setup` rejects all of these with `missing timestamp column`, then names the next missing column one at a time:
  - `docker logs --timestamps` output
  - a plain `.log`
  - JSON lines
  - the LogHub CSVs used in [codag-drain's benchmarks](https://github.com/codag-megalith/codag-drain/blob/main/docs/PUBLIC_BENCHMARKS.md)

  The accepted layouts are `Timestamp,ServiceName,SeverityText,Body` and `timestamp,cmdb_id,log_name,value`. The second appears only in [their installer test](https://github.com/codag-megalith/codag-releases/blob/main/tests/test_install.py), and I found the first by probing.

## What this does

- `lib/convert.ts` turns the following into `Timestamp,ServiceName,SeverityText,Body` with ISO-8601 UTC times, skipping and listing any line it can't date:
  - `docker logs --timestamps` / `kubectl logs --timestamps` output
  - JSON lines (`time` / `ts` / `timestamp` / `@timestamp` / `timeUnixNano`; epoch s, ms, µs and ns told apart by magnitude; pino numeric levels)

  It doesn't handle syslog or LogHub CSVs: they carry no year or zone, and a converter shouldn't guess one.
- The page runs the converter in the browser (nothing is uploaded). `cli/codag-convert.ts` does the same for big files.
- `bench/` is the recorded run:
  1. a real `postgres:16-alpine` container with connection logging and ~5½ minutes of traffic, where a `billing` worker started sending a password the database didn't have
  2. `docker logs --timestamps` → setup fails → convert → setup loads → 4 × `claude -p` (Sonnet, Codag tools only)
  3. answers scored against `bench/truth.ts`, which reads the raw capture directly

## Recorded result

Truth: `billing`, 107 failed logins from 14:44:30 to 14:49:01 UTC. One of them (14:44:30) is my own connection test from before the traffic, so the sustained burst is 106 from 14:47:02. All 4 runs named `billing` and gave one of the two readings; 2 set the stray failure aside on their own and said why. Details are in `data/run/results.json`, and the sanitized agent logs are in `data/run/agent-*.jsonl` (init event dropped, paths replaced).

## Run it

```sh
npm install
npm test                      # converter tests
npm run dev                   # page on :3000
node cli/codag-convert.ts my.log my.codag.csv my-service
codag-log-mcp setup --log-file ./my.codag.csv --client claude

# re-record (needs codag-log-mcp and claude on PATH, plus a fresh docker capture in data/run/)
./bench/run.sh && node bench/score.ts /tmp/codag-bench-run data/run
```

Unofficial demo by Cheryl Aurelia: not affiliated with Codag.
