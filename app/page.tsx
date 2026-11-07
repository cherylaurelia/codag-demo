import { readFileSync } from "node:fs";
import path from "node:path";
import { Converter } from "./converter";
import { RUNS, TRUTH } from "@/lib/runs";

const REPO = "https://github.com/cherylaurelia/codag-demo";

function readRun(name: string): string {
  return readFileSync(path.join(process.cwd(), "data/run", name), "utf8").trimEnd();
}

function Terminal({ title, body, tone }: { title: string; body: string; tone?: "bad" | "good" }) {
  const border = tone === "bad" ? "border-bad/50" : tone === "good" ? "border-accent/50" : "border-line";

  return (
    <figure className={`min-w-0 overflow-hidden rounded-lg border ${border} bg-deep`}>
      <figcaption className="border-b border-line px-4 py-2 font-mono text-xs text-muted">{title}</figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-soft">{body}</pre>
    </figure>
  );
}

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-line py-14">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{kicker}</p>
      <h2 className="mt-2 font-serif text-3xl text-fg sm:text-4xl">{title}</h2>
      <div className="mt-6 space-y-6 text-soft">{children}</div>
    </section>
  );
}

const SUGGESTED_ERROR = `Error: logs.csv: missing timestamp column

codag-log-mcp reads CSV/TSV with one of these headers:
  Timestamp,ServiceName,SeverityText,Body        (OpenTelemetry / ClickHouse otel_logs)
  timestamp,cmdb_id,log_name,value               (AIOps layout)
Timestamps: epoch seconds or ISO-8601 (UTC if no zone).
Found: LineId,Date,Day,Time,Component,Pid,Content,EventId,EventTemplate`;

const SUGGESTED_QUICKSTART = `1. Install the log MCP
   curl -fsSL https://codag.ai/install.sh | sh

2. Point it at a CSV/TSV with one of the two headers above
   codag-log-mcp setup --log-file ./logs.csv --client claude --apply

3. Restart Claude Code / Codex and ask about the logs.
   The account CLI (codag setup / status / savings / doctor)
   now installs from https://codag.ai/install-cli.sh`;

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export default function Page() {

  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-8">
      <header className="flex items-center justify-between py-6 font-mono text-sm">
        <span className="font-serif text-2xl text-fg">
          codag <span className="font-mono text-sm text-muted">log MCP</span>
          <span className="hidden font-mono text-sm text-muted sm:inline"> · bring your logs</span>
        </span>
        <a href={REPO} className="rounded border border-line px-3 py-1.5 text-fg hover:border-accent">
          Repo
        </a>
      </header>

      <section className="pb-14 pt-10">
        <p className="font-mono text-xs text-muted">unofficial · tested on codag-log-mcp 0.1.0 (353957d), 2026-11-07</p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-tight text-fg sm:text-6xl">
          Bring the logs you already have <span className="text-accent">to Codag&apos;s log MCP</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-soft">
          <strong className="text-fg">Problem:</strong> <code className="font-mono">codag-log-mcp setup</code> opens
          two exact CSV headers and doesn&apos;t say which, so docker logs, plain .log files and JSON lines stop at{" "}
          <code className="font-mono text-pink">missing timestamp column</code>.
        </p>
        <p className="mt-3 max-w-2xl text-lg text-soft">
          <strong className="text-fg">Fix:</strong> this page converts them to one in your browser, and on a real
          Postgres capture Claude Code + Codag then got the incident right in{" "}
          {RUNS.filter((run) => run.correct).length} of {RUNS.length} runs.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <a href="#convert" className="rounded bg-accent px-4 py-2 font-semibold text-deep hover:bg-accent-light">
            Convert my logs
          </a>
          <a href="#run" className="rounded border border-line px-4 py-2 text-fg hover:border-accent">
            See the recorded run
          </a>
        </div>
      </section>

      <Section id="docs" kicker="1 · first run" title="The Quickstart points to a command the installer no longer ships">
        <p>
          The Quickstart on{" "}
          <a className="text-accent underline" href="https://codag.ai/docs.html">
            codag.ai/docs
          </a>{" "}
          (&ldquo;Last synced 2026-08-16&rdquo;) says to run the installer, then <code className="font-mono">codag setup</code>,{" "}
          <code className="font-mono">status</code>, <code className="font-mono">savings</code> and{" "}
          <code className="font-mono">doctor</code>. Since{" "}
          <a className="text-accent underline" href="https://github.com/codag-megalith/codag-releases/commits/main">
            2026-09-24
          </a>{" "}
          that installer ships <code className="font-mono">codag-log-mcp</code> only, and the account CLI moved
          to <code className="font-mono">install-cli.sh</code>. Following the docs in an empty HOME:
        </p>
        <Terminal title="clean HOME, macOS arm64 · each command run with zsh -c, output unedited" body={readRun("docs-break.txt")} tone="bad" />
      </Section>

      <Section id="run" kicker="2 · recorded run" title="A real Postgres incident, before and after converting">
        <p>
          I ran <code className="font-mono">postgres:16-alpine</code> in Docker with connection logging on and
          sent it about 5½ minutes of real traffic. Partway through, a <code className="font-mono">billing</code>{" "}
          worker started sending a new password the database didn&apos;t have. I then captured <code className="font-mono">docker logs --timestamps</code>{" "}
          ({TRUTH.lines.toLocaleString()} lines) and gave it to Codag.
        </p>
        <div className="grid gap-4">
          <Terminal title="before: the raw capture" body={readRun("before.txt")} tone="bad" />
          <Terminal title="after: converted with this page's code" body={readRun("after.txt")} tone="good" />
        </div>
        <p>
          Then <code className="font-mono">claude -p</code> (Sonnet, Codag tools only, no shell) was asked which
          user was failing to authenticate, from when to when, and how many times. Ground truth came from a
          script over the raw capture:{" "}
          <code className="font-mono text-fg">
            {TRUTH.user}, {TRUTH.first} → {TRUTH.last} UTC, {TRUTH.count} failures
          </code>
          . One of those failures (14:44:30) is my own connection test from before the traffic started, so the
          sustained burst alone (
          <code className="font-mono text-fg">
            {TRUTH.burst.first} → {TRUTH.burst.last}, {TRUTH.burst.count}
          </code>
          ) would also count as right; every run gave the full count.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[36rem] text-left font-mono text-xs">
            <thead className="bg-deep text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">run</th>
                <th className="px-4 py-2 font-normal">Codag tool calls</th>
                <th className="px-4 py-2 font-normal">tool output read</th>
                <th className="px-4 py-2 font-normal">answer</th>
                <th className="px-4 py-2 font-normal">matches truth</th>
                <th className="px-4 py-2 font-normal">reading</th>
              </tr>
            </thead>
            <tbody>
              {RUNS.map((run) => (
                <tr key={run.id} className="border-t border-line text-soft">
                  <td className="px-4 py-2">{run.id}</td>
                  <td className="px-4 py-2">{run.calls}</td>
                  <td className="px-4 py-2">{kb(run.toolBytes)}</td>
                  <td className="px-4 py-2">{run.answer}</td>
                  <td className={`px-4 py-2 ${run.correct ? "text-accent" : "text-bad"}`}>{run.correct ? "yes" : "no"}</td>
                  <td className="px-4 py-2">{run.reading}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          &ldquo;Tool output read&rdquo; is the bytes of every tool result the agent received. There was no
          no-Codag control arm, so it isn&apos;t a savings figure. Postgres writes a FATAL line plus a DETAIL line
          per failed login, which is why the converter counts more FATAL rows than failures. Full sanitized agent logs, the capture and the scoring script are in{" "}
          <a className="text-accent underline" href={`${REPO}/tree/main/data/run`}>
            data/run
          </a>
          .
        </p>
      </Section>

      <Section id="convert" kicker="3 · try it" title="Convert your logs">
        <p>
          Takes <code className="font-mono">docker logs --timestamps</code> /{" "}
          <code className="font-mono">kubectl logs --timestamps</code> output and JSON lines (pino, zap, OTLP-style{" "}
          <code className="font-mono">timeUnixNano</code>). Epoch seconds, ms, µs and ns are told apart by
          magnitude and written out as ISO-8601 UTC. Lines it can&apos;t date are skipped and listed, never
          guessed. For big files: <code className="font-mono">node cli/codag-convert.ts in.log out.csv postgres</code>.
        </p>
        <Converter />
      </Section>

      <Section id="suggest" kicker="4 · the real fix" title="Two pastes on Codag's side">
        <p>
          The converter is a stopgap. The two layouts may well be deliberate, and naming them in the setup error
          and the Quickstart is probably a ten-minute change that removes the need for it. These only say which ones are accepted, so nobody has to find
          out by trial and error.
        </p>
        <div className="grid gap-4">
          <Terminal title="setup error that names the accepted headers" body={SUGGESTED_ERROR} />
          <Terminal title="Quickstart for the log MCP" body={SUGGESTED_QUICKSTART} />
        </div>
      </Section>

      <footer className="border-t border-line py-10 font-mono text-xs text-muted">
        Unofficial demo by Cheryl Aurelia: not affiliated with Codag. Built against the public installer at
        codag.ai/install.sh. ·{" "}
        <a className="text-accent underline" href={REPO}>
          source
        </a>
      </footer>
    </main>
  );
}
