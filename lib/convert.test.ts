import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, csvField, detectFormat, epochUnit, HEADER, levelFromText, parseTime } from "./convert.ts";

const DOCKER = [
  "2026-11-07T14:41:12.304581225Z 2026-11-07 14:41:12.304 UTC [88] LOG:  connection received: host=127.0.0.1 port=50012",
  '2026-11-07T14:41:12.311402118Z 2026-11-07 14:41:12.311 UTC [88] FATAL:  password authentication failed for user "billing"',
  '2026-11-07T14:41:12.311420001Z 2026-11-07 14:41:12.311 UTC [88] DETAIL:  Connection matched file "/var/lib/postgresql/data/pg_hba.conf" line 128: "host all all all scram-sha-256"',
  "",
].join("\n");

test("docker --timestamps output becomes Codag's OTel header with ISO UTC times", () => {
  const result = convert(DOCKER, "postgres");
  assert.ok(result);
  assert.equal(result.format, "docker-timestamps");
  const lines = result.csv.trimEnd().split("\n");
  assert.equal(lines[0], HEADER);
  assert.equal(result.rows, 3);
  assert.match(lines[1], /^2026-11-07T14:41:12\.304Z,postgres,INFO,2026-11-07 14:41:12\.304 UTC \[88\] LOG:/);
  assert.match(lines[2], /^2026-11-07T14:41:12\.311Z,postgres,FATAL,"[^"]*password authentication failed for user ""billing"""$/);
  // DETAIL continues the FATAL event
  assert.match(lines[3], /^2026-11-07T14:41:12\.311Z,postgres,FATAL,/);
  assert.deepEqual([...result.levels], [["INFO", 1], ["FATAL", 2]]);
});

test("docker lines with an empty body are dropped and counted, not written as empty rows", () => {
  const result = convert(`2026-11-07T14:44:23.748258533Z \n${DOCKER}`, "postgres");
  assert.ok(result);
  assert.equal(result.blank, 1);
  assert.equal(result.rows, 3);
});

test("lines without a docker timestamp are skipped and reported, never guessed", () => {
  const result = convert(`${DOCKER}no timestamp here\n`, "pg");
  assert.ok(result);
  assert.deepEqual(result.skipped, [4]);
  assert.equal(result.rows, 3);
});

test("json lines: epoch units are detected by magnitude and reported", () => {
  const text = [
    '{"time":1796893966123,"level":50,"msg":"db down","service":"api"}',
    '{"ts":1796893966,"level":"warn","message":"retrying"}',
    '{"timeUnixNano":"1796893966500000000","SeverityText":"ERROR","Body":"otlp line"}',
    '{"@timestamp":"2026-12-10T09:12:46.250+00:00","severity":"info","msg":"iso"}',
    "not json",
  ].join("\n");

  const result = convert(text, "app");
  assert.ok(result);
  assert.equal(result.format, "json-lines");
  assert.deepEqual(result.units, ["epoch-ms", "epoch-s", "epoch-ns", "iso-8601"]);
  assert.deepEqual(result.skipped, [5]);
  const lines = result.csv.trimEnd().split("\n");
  assert.equal(lines[1], "2026-12-10T09:12:46.123Z,api,ERROR,db down");
  assert.equal(lines[2], "2026-12-10T09:12:46.000Z,app,WARN,retrying");
  assert.equal(lines[3], "2026-12-10T09:12:46.500Z,app,ERROR,otlp line");
  assert.equal(lines[4], "2026-12-10T09:12:46.250Z,app,INFO,iso");
});

test("json record with no time field is skipped", () => {
  const result = convert('{"msg":"x"}\n{"time":1796893966,"msg":"y"}\n', "app");
  assert.ok(result);
  assert.deepEqual(result.skipped, [1]);
  assert.equal(result.rows, 1);
});

test("unsupported input returns null instead of a half-right file", () => {
  assert.equal(convert("Dec 10 06:55:46 LabSZ sshd[24200]: Invalid user webmaster", "ssh"), null);
  assert.equal(convert("LineId,Date,Day,Time,Component\n1,Dec,10,06:55:46,LabSZ", "ssh"), null);
  assert.equal(convert("", "x"), null);
  assert.equal(detectFormat("\n\n"), null);
});

test("epoch unit boundaries", () => {
  assert.equal(epochUnit(1796893966), "epoch-s");
  assert.equal(epochUnit(1796893966123), "epoch-ms");
  assert.equal(epochUnit(1796893966123456), "epoch-us");
  assert.equal(epochUnit(1.796893966123456e18), "epoch-ns");
});

test("parseTime: naive and ' UTC' times are UTC; garbage is rejected", () => {
  assert.equal(parseTime("2026-12-10 09:12:46")?.time.toISOString(), "2026-12-10T09:12:46.000Z");
  assert.equal(parseTime("2026-12-10 09:12:46.5 UTC")?.time.toISOString(), "2026-12-10T09:12:46.500Z");
  assert.equal(parseTime("2026-12-10T09:12:46-05:00")?.time.toISOString(), "2026-12-10T14:12:46.000Z");
  assert.equal(parseTime("yesterday"), null);
  assert.equal(parseTime("2026-13-45 99:99:99"), null);
});

test("levelFromText maps common spellings", () => {
  assert.equal(levelFromText("level=WARNING retry"), "WARN");
  assert.equal(levelFromText("[ERR] boom"), "ERROR");
  assert.equal(levelFromText("DEBUG2: planner"), "DEBUG");
  assert.equal(levelFromText("all good"), "");
  assert.equal(levelFromText("x DETAIL: y", "FATAL"), "FATAL");
});

test("csvField quotes commas, quotes and newlines only", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField('a "b", c'), '"a ""b"", c"');
  assert.equal(csvField("a\nb"), '"a\nb"');
});
