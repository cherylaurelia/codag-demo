import { z } from "zod";

// Converts logs people already have into the CSV layout codag-log-mcp 0.1.0 opens:
// Timestamp,ServiceName,SeverityText,Body (timestamps written as ISO-8601 UTC).

export type SourceFormat = "docker-timestamps" | "json-lines";

export type TimeUnit = "iso-8601" | "epoch-s" | "epoch-ms" | "epoch-us" | "epoch-ns";

export interface Converted {
  format: SourceFormat;
  units: TimeUnit[];
  csv: string;
  rows: number;
  skipped: number[];
}

export const HEADER = "Timestamp,ServiceName,SeverityText,Body";

const DOCKER_LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})) (.*)$/;

const LEVEL_WORD =
  /\b(PANIC|FATAL|CRITICAL|ERROR|ERR|WARNING|WARN|NOTICE|INFO|LOG|DEBUG\d?|TRACE|DETAIL|HINT|STATEMENT|CONTEXT)\b/;

// Postgres-style follow-up lines that belong to the previous line's event.
const CONTINUATION = new Set(["DETAIL", "HINT", "STATEMENT", "CONTEXT"]);

const LEVEL_NAMES = new Map([
  ["PANIC", "FATAL"],
  ["FATAL", "FATAL"],
  ["CRITICAL", "FATAL"],
  ["ERROR", "ERROR"],
  ["ERR", "ERROR"],
  ["WARNING", "WARN"],
  ["WARN", "WARN"],
  ["NOTICE", "INFO"],
  ["INFO", "INFO"],
  ["LOG", "INFO"],
  ["TRACE", "TRACE"],
]);

// pino / bunyan numeric levels
const NUMERIC_LEVELS = new Map([
  [10, "TRACE"],
  [20, "DEBUG"],
  [30, "INFO"],
  [40, "WARN"],
  [50, "ERROR"],
  [60, "FATAL"],
]);

const TIME_KEYS = ["timestamp", "Timestamp", "@timestamp", "time", "ts", "timeUnixNano"];
const LEVEL_KEYS = ["level", "severity", "SeverityText", "lvl", "levelname"];
const MESSAGE_KEYS = ["msg", "message", "Body", "body", "event"];
const SERVICE_KEYS = ["service", "ServiceName", "app", "name", "logger"];

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function row(time: Date, service: string, level: string, body: string): string {
  return [time.toISOString(), service, level, body].map(csvField).join(",");
}

export function levelFromText(text: string, previous = ""): string {
  const match = LEVEL_WORD.exec(text.slice(0, 120));

  if (match === null) return "";
  const word = match[1];

  if (CONTINUATION.has(word)) return previous;

  if (word.startsWith("DEBUG")) return "DEBUG";

  return LEVEL_NAMES.get(word) ?? "";
}

// Epoch numbers carry no unit, so infer it from magnitude (valid for dates 1973–2286).
export function epochUnit(value: number): TimeUnit {
  const abs = Math.abs(value);

  if (abs < 1e11) return "epoch-s";

  if (abs < 1e14) return "epoch-ms";

  if (abs < 1e17) return "epoch-us";

  return "epoch-ns";
}

const UNIT_TO_MS = new Map<TimeUnit, number>([
  ["epoch-s", 1000],
  ["epoch-ms", 1],
  ["epoch-us", 1e-3],
  ["epoch-ns", 1e-6],
]);

export function parseTime(value: string): { time: Date; unit: TimeUnit } | null {
  const numeric = /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;

  if (Number.isFinite(numeric)) {
    const unit = epochUnit(numeric);
    const time = new Date(numeric * (UNIT_TO_MS.get(unit) ?? 1));

    return Number.isNaN(time.getTime()) ? null : { time, unit };
  }

  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return null;
  const iso = value.replace(" ", "T").replace(/ UTC$/, "Z");
  const time = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);

  return Number.isNaN(time.getTime()) ? null : { time, unit: "iso-8601" };
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);

  if (lines.at(-1) === "") lines.pop();

  return lines;
}

export function detectFormat(text: string): SourceFormat | null {
  const first = splitLines(text).find((line) => line.trim() !== "");

  if (first === undefined) return null;

  if (first.trimStart().startsWith("{")) return "json-lines";

  if (DOCKER_LINE.test(first)) return "docker-timestamps";

  return null;
}

function convertDocker(lines: string[], service: string): Converted {
  const out = [HEADER];
  const skipped: number[] = [];
  let previousLevel = "";
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    const match = DOCKER_LINE.exec(line);
    const parsed = match === null ? null : parseTime(match[1]);

    if (match === null || parsed === null) {
      skipped.push(index + 1);

      return;
    }

    const body = match[2];
    const level = levelFromText(body, previousLevel);
    previousLevel = level;
    out.push(row(parsed.time, service, level, body));
  });

  return { format: "docker-timestamps", units: ["iso-8601"], csv: `${out.join("\n")}\n`, rows: out.length - 1, skipped };
}

const timeValue = z.union([z.number().transform(String), z.string()]);

const levelValue = z.union([
  z.number().transform((value) => NUMERIC_LEVELS.get(value) ?? ""),
  z.string().transform((value) => levelFromText(value.toUpperCase())),
]);

const textValue = z.string().min(1);

// One JSON log line, decoded at the boundary. Any other keys are ignored.
const logLineFields: Record<string, z.ZodType<string | undefined>> = Object.fromEntries([
    ...TIME_KEYS.map((key) => [key, timeValue.optional().catch(undefined)]),
    ...LEVEL_KEYS.map((key) => [key, levelValue.optional().catch(undefined)]),
  ...[...MESSAGE_KEYS, ...SERVICE_KEYS].map((key) => [key, textValue.optional().catch(undefined)]),
]);

const jsonLine = z.object(logLineFields);

type JsonLine = Map<string, string | undefined>;

function decodeLine(line: string): JsonLine | null {
  try {
    const decoded = jsonLine.safeParse(JSON.parse(line));

    return decoded.success ? new Map(Object.entries(decoded.data)) : null;
  } catch {
    return null;
  }
}

function first(record: JsonLine, keys: string[]): string | undefined {
  return keys.map((key) => record.get(key)).find((value) => value !== undefined);
}

function convertJsonLines(lines: string[], service: string): Converted {
  const out = [HEADER];
  const skipped: number[] = [];
  const units = new Set<TimeUnit>();
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    const record = decodeLine(line);
    const rawTime = record === null ? undefined : first(record, TIME_KEYS);
    const parsed = rawTime === undefined ? null : parseTime(rawTime);

    if (record === null || parsed === null) {
      skipped.push(index + 1);

      return;
    }

    units.add(parsed.unit);
    const level = first(record, LEVEL_KEYS) ?? "";
    out.push(row(parsed.time, first(record, SERVICE_KEYS) ?? service, level, first(record, MESSAGE_KEYS) ?? line));
  });

  return { format: "json-lines", units: [...units], csv: `${out.join("\n")}\n`, rows: out.length - 1, skipped };
}

export function convert(text: string, service: string): Converted | null {
  const format = detectFormat(text);
  const lines = splitLines(text);

  if (format === "docker-timestamps") return convertDocker(lines, service);

  if (format === "json-lines") return convertJsonLines(lines, service);

  return null;
}
