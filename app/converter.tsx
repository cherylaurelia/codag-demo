"use client";

import { useMemo, useState } from "react";
import { convert, HEADER } from "@/lib/convert";

const PREVIEW_ROWS = 6;

export function Converter() {
  const [text, setText] = useState("");
  const [service, setService] = useState("app");
  const [fileName, setFileName] = useState("logs");
  const result = useMemo(() => (text.trim() === "" ? null : convert(text, service || "app")), [text, service]);
  const outName = `${fileName.replace(/\.[^.]+$/, "")}.codag.csv`;

  const download = () => {
    if (result === null) return;
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = outName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadFile = async (file: File | undefined) => {
    if (file === undefined) return;
    setFileName(file.name);
    setText(await file.text());
  };

  return (
    <div className="rounded-lg border border-line bg-deep">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 font-mono text-xs text-muted">
        <label className="flex items-center gap-2">
          ServiceName
          <input
            value={service}
            onChange={(event) => setService(event.target.value)}
            className="w-28 rounded border border-line bg-bg px-2 py-1 text-fg"
          />
        </label>
        <label className="cursor-pointer rounded border border-line px-2 py-1 text-fg hover:border-accent">
          Open file
          <input type="file" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])} />
        </label>
        <button
          type="button"
          onClick={async () => {
            const response = await fetch("/postgres-docker.log");
            setFileName("postgres-docker");
            setService("postgres");
            setText(await response.text());
          }}
          className="rounded border border-line px-2 py-1 text-fg hover:border-accent"
        >
          Load the recorded Postgres capture
        </button>
        <span className="ml-auto">Runs in your browser. Nothing is uploaded.</span>
      </div>
      <label className="sr-only" htmlFor="logs">
        Logs to convert
      </label>
      <textarea
        id="logs"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void loadFile(event.dataTransfer.files[0]);
        }}
        spellCheck={false}
        placeholder={
          "Paste or drop logs here:\n  docker logs --timestamps <container>\n  kubectl logs --timestamps <pod>\n  JSON lines with a time / ts / timestamp / @timestamp / timeUnixNano field"
        }
        className="h-44 w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed text-soft outline-none placeholder:text-faint"
      />
      <div className="border-t border-line p-4 font-mono text-xs" aria-live="polite">
        {text.trim() === "" && <p className="text-faint">Waiting for logs.</p>}
        {text.trim() !== "" && result === null && (
          <p className="text-warn">
            Not recognized. The first line should start with an RFC 3339 timestamp (
            <code>--timestamps</code>) or be a JSON object with a time field. Syslog and LogHub CSVs have no
            year or zone, so this page won't guess one.
          </p>
        )}
        {result !== null && (
          <div className="space-y-3">
            <p className="text-soft">
              <span className="text-accent">{result.format}</span> · {result.rows} rows · time read as{" "}
              {result.units.join(", ")} · written as ISO-8601 UTC · {result.blank} blank lines dropped ·{" "}
              <span className={result.skipped.length > 0 ? "text-warn" : ""}>
                {result.skipped.length} skipped
                {result.skipped.length > 0 && ` (lines ${result.skipped.slice(0, 8).join(", ")})`}
              </span>
            </p>
            <p className="text-muted">
              SeverityText:{" "}
              {[...result.levels]
                .toSorted((a, b) => b[1] - a[1])
                .map(([level, count]) => `${level || "(none in line)"} ${count}`)
                .join(" · ")}
            </p>
            <pre className="overflow-x-auto rounded bg-bg p-3 text-soft">
              {[
                HEADER,
                ...result.csv
                  .split("\n")
                  .slice(1)
                  .filter((line) => line.split(",")[2] !== "")
                  .slice(0, PREVIEW_ROWS),
              ].join("\n")}
              {`\n… preview shows the first rows with a SeverityText; the download has all ${result.rows}`}
            </pre>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={download}
                className="rounded bg-accent px-3 py-1.5 font-sans text-sm font-semibold text-deep hover:bg-accent-light"
              >
                Download {outName}
              </button>
              <code className="text-muted">codag-log-mcp setup --log-file ./{outName}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
