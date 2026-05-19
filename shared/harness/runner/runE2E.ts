import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { CONFIG_PATH, E2E_DIR, testConfig } from "../config.ts";

type TestCaseResult = {
  suite: string;
  file: string;
  test: string;
  status: "ok" | "fail" | "skip";
  durationMs: number;
  assertions: number;
  errorMessage: string;
  errorDetails: string;
  stdoutLog: string;
  stderrLog: string;
};

type SuiteResult = {
  file: string;
  exitCode: number;
  stdoutLog: string;
  stderrLog: string;
  stdout: string;
  stderr: string;
  cases: TestCaseResult[];
};

type ProfileEvent = {
  suite: string;
  file: string;
  line: number;
  label: string;
  phase: "start" | "end";
  instructions: bigint;
  heapBytes: bigint;
  memoryBytes: bigint;
  totalAllocation: bigint;
};

type ProfileSpan = {
  suite: string;
  file: string;
  label: string;
  instructions: bigint;
  heapDeltaBytes: bigint;
  memoryDeltaBytes: bigint;
  totalAllocationDeltaBytes: bigint;
};

type BenchAggregate = {
  suite: string;
  label: string;
  samples: number;
  avgInstructions: bigint;
  totalInstructions: bigint;
  peakInstructions: bigint;
  hasPeakInstructions?: boolean;
  avgHeapDeltaBytes: bigint;
  totalHeapDeltaBytes: bigint;
  avgMemoryDeltaBytes: bigint;
  totalMemoryDeltaBytes: bigint;
};

type RunPaths = {
  runId: string;
  runDir: string;
  junitDir: string;
  logDir: string;
  testCsv: string;
  testMd: string;
  benchEventsCsv: string;
  benchSpansCsv: string;
  benchAggregateCsv: string;
  benchMd: string;
};

const PROFILE_PREFIX = "SR9P|";
const LEGACY_PROFILE_PREFIX = "SR9_PROFILE|";

async function main(): Promise<void> {
  const config = testConfig();
  const runPaths = prepareRun(config.reportsDir);
  const specs = discoverSpecs(process.argv.slice(2), config.specGlob);
  if (specs.length === 0) {
    throw new Error(`No test specs matched ${config.specGlob}.`);
  }

  const suites = await runSpecs(specs, config.jobs, config.timeoutMs, runPaths);
  const cases = suites.flatMap((suite) => suite.cases);
  const events = suites.flatMap(parseSuiteProfileEvents);
  const { spans, unpaired } = pairProfileEvents(events);
  const aggregates = aggregateSpans(spans);
  const previous = readPreviousAggregates(config.reportsDir, runPaths.runId);

  writeTestReports(cases, suites, runPaths);
  writeBenchmarkReports(events, spans, aggregates, previous, unpaired, runPaths);
  writeLatestCopies(config.reportsDir, runPaths);

  const totals = summarize(cases, suites, spans, unpaired);
  console.log(
    `Suites: ${totals.suitesOk} ok, ${totals.suitesFail} fail | ` +
      `Tests: ${totals.testsOk} ok, ${totals.testsFail} fail, ${totals.testsSkip} skipped | ` +
      `Bench: ${spans.length} spans, ${unpaired.length} unpaired | ` +
      `Report: ${relative(E2E_DIR, runPaths.testMd)} | Bench: ${relative(E2E_DIR, runPaths.benchMd)}`,
  );

  if (totals.suitesFail > 0 || totals.testsFail > 0) {
    process.exit(1);
  }
}

function prepareRun(reportsDir: string): RunPaths {
  const runId = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
  const runDir = resolve(reportsDir, "runs", runId);
  const paths: RunPaths = {
    runId,
    runDir,
    junitDir: resolve(runDir, "junit"),
    logDir: resolve(runDir, "logs"),
    testCsv: resolve(runDir, "test-results.csv"),
    testMd: resolve(runDir, "test-results.md"),
    benchEventsCsv: resolve(runDir, "bench-events.csv"),
    benchSpansCsv: resolve(runDir, "bench-spans.csv"),
    benchAggregateCsv: resolve(runDir, "bench-aggregate.csv"),
    benchMd: resolve(runDir, "bench-summary.md"),
  };
  mkdirSync(paths.junitDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
  return paths;
}

function discoverSpecs(args: string[], specGlob: string): string[] {
  const includeSlow =
    process.env.E2E_INCLUDE_SLOW === "1" ||
    process.env.E2E_INCLUDE_SLOW === "true";
  const all = listFiles(resolve(E2E_DIR, "spec"))
    .filter((file) => file.endsWith(".test.ts"))
    .filter((file) => includeSlow || !basename(file).includes(".slow."))
    .sort();
  if (args.length === 0) {
    return all;
  }
  const matches = new Set<string>();
  for (const arg of args) {
    const exact = resolve(E2E_DIR, arg);
    if (existsSync(exact)) {
      matches.add(exact);
      continue;
    }
    for (const file of all) {
      if (relative(E2E_DIR, file).includes(arg) || basename(file).includes(arg)) {
        matches.add(file);
      }
    }
  }
  if (matches.size === 0) {
    throw new Error(`No specs matched args ${args.join(", ")} for ${specGlob}.`);
  }
  return [...matches].sort();
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(path));
    } else {
      out.push(path);
    }
  }
  return out;
}

async function runSpecs(
  specs: string[],
  jobs: number,
  timeoutMs: number,
  paths: RunPaths,
): Promise<SuiteResult[]> {
  const queue = [...specs];
  const results: SuiteResult[] = [];
  const workerCount = Math.max(1, Math.min(jobs, specs.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const spec = queue.shift();
        if (spec === undefined) {
          return;
        }
        results.push(await runSpec(spec, timeoutMs, paths));
      }
    }),
  );
  return results.sort((a, b) => a.file.localeCompare(b.file));
}

async function runSpec(
  spec: string,
  timeoutMs: number,
  paths: RunPaths,
): Promise<SuiteResult> {
  const rel = relative(E2E_DIR, spec);
  const safe = safeName(rel);
  const junitPath = resolve(paths.junitDir, `${safe}.xml`);
  const stdoutLog = resolve(paths.logDir, `${safe}.stdout.log`);
  const stderrLog = resolve(paths.logDir, `${safe}.stderr.log`);
  const command = [
    "bun",
    "test",
    "--timeout",
    String(timeoutMs),
    "--reporter=junit",
    `--reporter-outfile=${junitPath}`,
    rel,
  ];
  const proc = Bun.spawn(
    ["sh", "-c", `${command.map(shellQuote).join(" ")} & wait $!`],
    {
      cwd: E2E_DIR,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        E2E_CONFIG: CONFIG_PATH,
        PIC_SHOW_CANISTER_LOGS: "1",
        PIC_SHOW_RUNTIME_LOGS: process.env.PIC_SHOW_RUNTIME_LOGS ?? "0",
      },
    },
  );
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  writeFileSync(stdoutLog, stdout);
  writeFileSync(stderrLog, stderr);

  const cases = existsSync(junitPath)
    ? parseJUnit(readFileSync(junitPath, "utf8"), rel, stdoutLog, stderrLog)
    : [crashedCase(rel, exitCode, stderr, stdoutLog, stderrLog)];
  if (exitCode !== 0 && cases.every((testCase) => testCase.status !== "fail")) {
    cases.push(crashedCase(rel, exitCode, stderr, stdoutLog, stderrLog));
  }
  return {
    file: rel,
    exitCode,
    stdoutLog,
    stderrLog,
    stdout,
    stderr,
    cases,
  };
}

function parseJUnit(
  xml: string,
  fallbackFile: string,
  stdoutLog: string,
  stderrLog: string,
): TestCaseResult[] {
  const cases: TestCaseResult[] = [];
  const suiteRe = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>|<testsuite\b([^>]*)\/>/g;
  for (const suiteMatch of xml.matchAll(suiteRe)) {
    const suiteAttrs = parseAttrs(suiteMatch[1] ?? suiteMatch[3] ?? "");
    const body = suiteMatch[2] ?? "";
    const file = suiteAttrs.file ?? suiteAttrs.name ?? fallbackFile;
    const caseRe = /<testcase\b([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    for (const caseMatch of body.matchAll(caseRe)) {
      const attrs = parseAttrs(caseMatch[1] ?? "");
      const content = caseMatch[2] ?? "";
      const failure = firstTagContent(content, "failure") ?? firstTagContent(content, "error");
      const skipped = /<skipped\b/.test(content);
      cases.push({
        suite: decodeXml(attrs.classname ?? suiteAttrs.name ?? file),
        file: decodeXml(attrs.file ?? file),
        test: decodeXml(attrs.name ?? "(unnamed test)"),
        status: failure !== undefined ? "fail" : skipped ? "skip" : "ok",
        durationMs: secondsToMs(attrs.time),
        assertions: Number.parseInt(attrs.assertions ?? "0", 10) || 0,
        errorMessage: failure === undefined ? "" : compact(stripXml(failure)).slice(0, 500),
        errorDetails: failure === undefined ? "" : stripXml(failure),
        stdoutLog,
        stderrLog,
      });
    }
  }
  return cases.length === 0
    ? [crashedCase(fallbackFile, 1, "JUnit contained no test cases.", stdoutLog, stderrLog)]
    : cases;
}

function crashedCase(
  file: string,
  exitCode: number,
  stderr: string,
  stdoutLog: string,
  stderrLog: string,
): TestCaseResult {
  return {
    suite: file,
    file,
    test: "(process)",
    status: "fail",
    durationMs: 0,
    assertions: 0,
    errorMessage: `Spec process exited with ${exitCode}.`,
    errorDetails: stderr,
    stdoutLog,
    stderrLog,
  };
}

function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of attrs.matchAll(/([A-Za-z_:-]+)="([^"]*)"/g)) {
    out[match[1]] = decodeXml(match[2]);
  }
  return out;
}

function firstTagContent(text: string, tag: string): string | undefined {
  const match = text.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1];
}

function parseSuiteProfileEvents(suite: SuiteResult): ProfileEvent[] {
  const combined = `${suite.stdout}\n${suite.stderr}`;
  const events: ProfileEvent[] = [];
  const lines = combined.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const profile = lines[i].match(/(?:SR9P|SR9_PROFILE)\|[^\r\n]*/)?.[0];
    if (profile === undefined) {
      continue;
    }
    const parsed = parseProfileLine(profile);
    if (parsed !== undefined) {
      events.push({ ...parsed, suite: suite.file, file: suite.file, line: i + 1 });
    }
  }
  return events;
}

function parseProfileLine(line: string): Omit<ProfileEvent, "suite" | "file" | "line"> | undefined {
  if (line.startsWith(PROFILE_PREFIX)) {
    const parts = line.split("|");
    const label = parts[1];
    const phase = profilePhase(label);
    if (label === undefined || phase === undefined) {
      return undefined;
    }
    return {
      label,
      phase,
      instructions: parseBigIntField(parts[2]),
      heapBytes: parseBigIntField(parts[3]),
      memoryBytes: parseBigIntField(parts[4]),
      totalAllocation: parseBigIntField(parts[5]),
    };
  }
  if (!line.startsWith(LEGACY_PROFILE_PREFIX)) {
    return undefined;
  }
  const fields: Record<string, string> = {};
  for (const part of line.split("|").slice(1)) {
    const sep = part.indexOf("=");
    if (sep > 0) {
      fields[part.slice(0, sep)] = part.slice(sep + 1);
    }
  }
  const label = fields.label;
  const phase = profilePhase(label);
  if (label === undefined || phase === undefined) {
    return undefined;
  }
  return {
    label,
    phase,
    instructions: parseBigIntField(fields.instructions),
    heapBytes: parseBigIntField(fields.heapBytes),
    memoryBytes: parseBigIntField(fields.memoryBytes),
    totalAllocation: parseBigIntField(fields.totalAllocation),
  };
}

function profilePhase(label: string | undefined): ProfileEvent["phase"] | undefined {
  return label?.endsWith(":start")
    ? "start"
    : label?.endsWith(":end")
      ? "end"
      : undefined;
}

function pairProfileEvents(events: ProfileEvent[]): {
  spans: ProfileSpan[];
  unpaired: string[];
} {
  const stacks = new Map<string, ProfileEvent[]>();
  const spans: ProfileSpan[] = [];
  const unpaired: string[] = [];
  for (const event of events) {
    const label = baseProfileLabel(event.label);
    const key = `${event.suite}\n${label}`;
    if (event.phase === "start") {
      const stack = stacks.get(key) ?? [];
      stack.push(event);
      stacks.set(key, stack);
      continue;
    }
    const stack = stacks.get(key);
    const start = stack?.pop();
    if (start === undefined) {
      unpaired.push(`${event.suite}: ${label} end without start at log line ${event.line}`);
      continue;
    }
    spans.push({
      suite: event.suite,
      file: event.file,
      label,
      instructions: event.instructions - start.instructions,
      heapDeltaBytes: event.heapBytes - start.heapBytes,
      memoryDeltaBytes: event.memoryBytes - start.memoryBytes,
      totalAllocationDeltaBytes: event.totalAllocation - start.totalAllocation,
    });
  }
  for (const [key, stack] of stacks) {
    const [, label] = key.split("\n");
    for (const event of stack) {
      unpaired.push(`${event.suite}: ${label} start without end at log line ${event.line}`);
    }
  }
  return { spans, unpaired };
}

function aggregateSpans(spans: ProfileSpan[]): BenchAggregate[] {
  const grouped = new Map<string, ProfileSpan[]>();
  for (const span of spans) {
    for (const suite of [span.suite, "ALL"]) {
      const key = `${suite}\n${span.label}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push({ ...span, suite });
      grouped.set(key, bucket);
    }
  }
  return [...grouped.entries()]
    .map(([key, bucket]) => {
      const [suite, label] = key.split("\n");
      const samples = bucket.length;
      const totalInstructions = sumBigInt(bucket.map((span) => span.instructions));
      const peakInstructions = maxBigInt(bucket.map((span) => span.instructions));
      const totalHeapDeltaBytes = sumBigInt(bucket.map((span) => span.heapDeltaBytes));
      const totalMemoryDeltaBytes = sumBigInt(bucket.map((span) => span.memoryDeltaBytes));
      return {
        suite,
        label,
        samples,
        avgInstructions: totalInstructions / BigInt(samples),
        totalInstructions,
        peakInstructions,
        avgHeapDeltaBytes: totalHeapDeltaBytes / BigInt(samples),
        totalHeapDeltaBytes,
        avgMemoryDeltaBytes: totalMemoryDeltaBytes / BigInt(samples),
        totalMemoryDeltaBytes,
      };
    })
    .sort((a, b) => a.suite.localeCompare(b.suite) || a.label.localeCompare(b.label));
}

function readPreviousAggregates(
  reportsDir: string,
  currentRunId: string,
): Map<string, BenchAggregate> {
  const runsDir = resolve(reportsDir, "runs");
  if (!existsSync(runsDir)) {
    return new Map();
  }
  const previous = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== currentRunId)
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .find((runId) => existsSync(resolve(runsDir, runId, "bench-aggregate.csv")));
  if (previous === undefined) {
    return new Map();
  }
  const csvText = readFileSync(resolve(runsDir, previous, "bench-aggregate.csv"), "utf8").trim();
  if (csvText.length === 0) {
    return new Map();
  }
  const csvLines = csvText.split(/\r?\n/);
  const header = parseCsvLine(csvLines[0] ?? "");
  const rows = csvLines.slice(1).map(parseCsvLine);
  const out = new Map<string, BenchAggregate>();
  const hasPeakInstructions = header.includes("peak_instructions");
  for (const row of rows) {
    const field = (name: string, fallbackIndex: number): string | undefined => {
      const index = header.indexOf(name);
      return row[index >= 0 ? index : fallbackIndex];
    };
    const aggregate: BenchAggregate = {
      suite: field("suite", 0) ?? "",
      label: field("label", 1) ?? "",
      samples: Number.parseInt(field("samples", 2) ?? "0", 10) || 0,
      avgInstructions: parseBigIntField(field("avg_instructions", 3)),
      totalInstructions: parseBigIntField(field("total_instructions", 4)),
      peakInstructions: hasPeakInstructions
        ? parseBigIntField(field("peak_instructions", 5))
        : 0n,
      hasPeakInstructions,
      avgHeapDeltaBytes: parseBigIntField(field("avg_heap_delta_bytes", 5)),
      totalHeapDeltaBytes: parseBigIntField(field("total_heap_delta_bytes", 6)),
      avgMemoryDeltaBytes: parseBigIntField(field("avg_memory_delta_bytes", 7)),
      totalMemoryDeltaBytes: parseBigIntField(field("total_memory_delta_bytes", 8)),
    };
    out.set(`${aggregate.suite}\n${aggregate.label}`, aggregate);
  }
  return out;
}

function writeTestReports(
  cases: TestCaseResult[],
  suites: SuiteResult[],
  paths: RunPaths,
): void {
  writeCsv(paths.testCsv, [
    [
      "suite",
      "file",
      "test",
      "status",
      "duration_ms",
      "assertions",
      "error_message",
      "error_details",
      "stdout_log",
      "stderr_log",
    ],
    ...cases.map((testCase) => [
      testCase.suite,
      testCase.file,
      testCase.test,
      testCase.status,
      String(testCase.durationMs),
      String(testCase.assertions),
      testCase.errorMessage,
      testCase.errorDetails,
      relative(E2E_DIR, testCase.stdoutLog),
      relative(E2E_DIR, testCase.stderrLog),
    ]),
  ]);

  const totals = summarize(cases, suites, [], []);
  const lines = [
    "# E2E Test Results",
    "",
    `Run: ${paths.runId}`,
    "",
    `Suites: ${totals.suitesOk} ok, ${totals.suitesFail} fail`,
    `Tests: ${totals.testsOk} ok, ${totals.testsFail} fail, ${totals.testsSkip} skipped`,
    "",
    "| Suite | OK | Fail | Skip | Log |",
    "|---|---:|---:|---:|---|",
    ...suiteRows(cases).map(
      (row) =>
        `| ${md(row.suite)} | ${row.ok} | ${row.fail} | ${row.skip} | ${md(row.log)} |`,
    ),
    "",
    "| Suite | Test | Status | Duration | Error |",
    "|---|---|---|---:|---|",
    ...cases.map(
      (testCase) =>
        `| ${md(testCase.suite)} | ${md(testCase.test)} | ${statusText(testCase.status)} | ${testCase.durationMs.toFixed(1)} ms | ${md(testCase.errorMessage)} |`,
    ),
  ];
  writeFileSync(paths.testMd, `${lines.join("\n")}\n`);
}

function writeBenchmarkReports(
  events: ProfileEvent[],
  spans: ProfileSpan[],
  aggregates: BenchAggregate[],
  previous: Map<string, BenchAggregate>,
  unpaired: string[],
  paths: RunPaths,
): void {
  writeCsv(paths.benchEventsCsv, [
    [
      "suite",
      "file",
      "line",
      "label",
      "phase",
      "instructions",
      "heap_bytes",
      "memory_bytes",
      "total_allocation",
    ],
    ...events.map((event) => [
      event.suite,
      event.file,
      String(event.line),
      event.label,
      event.phase,
      event.instructions.toString(),
      event.heapBytes.toString(),
      event.memoryBytes.toString(),
      event.totalAllocation.toString(),
    ]),
  ]);
  writeCsv(paths.benchSpansCsv, [
    [
      "suite",
      "file",
      "label",
      "instructions",
      "heap_delta_bytes",
      "memory_delta_bytes",
      "total_allocation_delta",
    ],
    ...spans.map((span) => [
      span.suite,
      span.file,
      span.label,
      span.instructions.toString(),
      span.heapDeltaBytes.toString(),
      span.memoryDeltaBytes.toString(),
      span.totalAllocationDeltaBytes.toString(),
    ]),
  ]);
  writeCsv(paths.benchAggregateCsv, [
    [
      "suite",
      "label",
      "samples",
      "avg_instructions",
      "total_instructions",
      "peak_instructions",
      "avg_heap_delta_bytes",
      "total_heap_delta_bytes",
      "avg_memory_delta_bytes",
      "total_memory_delta_bytes",
    ],
    ...aggregates.map((aggregate) => [
      aggregate.suite,
      aggregate.label,
      String(aggregate.samples),
      aggregate.avgInstructions.toString(),
      aggregate.totalInstructions.toString(),
      aggregate.peakInstructions.toString(),
      aggregate.avgHeapDeltaBytes.toString(),
      aggregate.totalHeapDeltaBytes.toString(),
      aggregate.avgMemoryDeltaBytes.toString(),
      aggregate.totalMemoryDeltaBytes.toString(),
    ]),
  ]);

  const overall = aggregates.filter((aggregate) => aggregate.suite === "ALL");
  const suiteTotals = aggregateSuiteTotals(spans);
  const totalInstructions = sumBigInt(overall.map((row) => row.totalInstructions));
  const peakInstructions = maxBigInt(overall.map((row) => row.peakInstructions));
  const totalHeap = sumBigInt(overall.map((row) => row.totalHeapDeltaBytes));
  const lines = [
    "# E2E Benchmark Summary",
    "",
    `Run: ${paths.runId}`,
    "",
    `Measured spans: ${spans.length}`,
    `Total measured instructions: ${formatInstructions(totalInstructions)}`,
    `Peak measured instructions: ${formatInstructions(peakInstructions)}`,
    `Total measured heap delta: ${formatBytes(totalHeap)}`,
    "",
    "## Overall",
    "",
    "| Label | Samples | Avg Instructions | Change | Peak Instructions | Change | Avg Heap Delta | Change | Total Instructions |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...overall.map((row) => benchmarkRow(row, previous)),
    "",
    "## Suite Totals",
    "",
    "| Suite | Spans | Total Instructions | Peak Instructions | Total Heap Delta |",
    "|---|---:|---:|---:|---:|",
    ...suiteTotals.map(
      (row) =>
        `| ${md(row.suite)} | ${row.spans} | ${formatInstructions(row.instructions)} | ${formatInstructions(row.peakInstructions)} | ${formatBytes(row.heapDeltaBytes)} |`,
    ),
    "",
    "## By Suite",
    "",
    ...suiteBenchmarkSections(aggregates),
  ];
  if (unpaired.length > 0) {
    lines.push("", "## Unpaired Marks", "");
    for (const item of unpaired) {
      lines.push(`- ${item}`);
    }
  }
  writeFileSync(paths.benchMd, `${lines.join("\n")}\n`);
}

function suiteBenchmarkSections(aggregates: BenchAggregate[]): string[] {
  const bySuite = new Map<string, BenchAggregate[]>();
  for (const aggregate of aggregates) {
    if (aggregate.suite === "ALL") {
      continue;
    }
    const rows = bySuite.get(aggregate.suite) ?? [];
    rows.push(aggregate);
    bySuite.set(aggregate.suite, rows);
  }

  const lines: string[] = [];
  for (const suite of [...bySuite.keys()].sort()) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(
      `### ${md(suite)}`,
      "",
      "| Label | Samples | Avg Instructions | Peak Instructions | Avg Heap Delta | Total Instructions |",
      "|---|---:|---:|---:|---:|---:|",
      ...bySuite
        .get(suite)!
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(
          (row) =>
            `| ${md(row.label)} | ${row.samples} | ${formatInstructions(row.avgInstructions)} | ${formatInstructions(row.peakInstructions)} | ${formatBytes(row.avgHeapDeltaBytes)} | ${formatInstructions(row.totalInstructions)} |`,
        ),
    );
  }
  return lines;
}

function aggregateSuiteTotals(spans: ProfileSpan[]): Array<{
  suite: string;
  spans: number;
  instructions: bigint;
  peakInstructions: bigint;
  heapDeltaBytes: bigint;
}> {
  const totals = new Map<string, {
    suite: string;
    spans: number;
    instructions: bigint;
    peakInstructions: bigint;
    heapDeltaBytes: bigint;
  }>();
  for (const span of spans) {
    const current =
      totals.get(span.suite) ??
      { suite: span.suite, spans: 0, instructions: 0n, peakInstructions: 0n, heapDeltaBytes: 0n };
    current.spans += 1;
    current.instructions += span.instructions;
    current.peakInstructions = maxBigInt([current.peakInstructions, span.instructions]);
    current.heapDeltaBytes += span.heapDeltaBytes;
    totals.set(span.suite, current);
  }
  return [...totals.values()].sort((a, b) => a.suite.localeCompare(b.suite));
}

function writeLatestCopies(reportsDir: string, paths: RunPaths): void {
  mkdirSync(reportsDir, { recursive: true });
  const copies: Array<[string, string]> = [
    [paths.testCsv, "latest-test-results.csv"],
    [paths.testMd, "latest-test-results.md"],
    [paths.benchEventsCsv, "latest-bench-events.csv"],
    [paths.benchSpansCsv, "latest-bench-spans.csv"],
    [paths.benchAggregateCsv, "latest-bench-aggregate.csv"],
    [paths.benchMd, "latest-bench-summary.md"],
  ];
  for (const [from, name] of copies) {
    copyFileSync(from, resolve(reportsDir, name));
  }
}

function suiteRows(cases: TestCaseResult[]): Array<{
  suite: string;
  ok: number;
  fail: number;
  skip: number;
  log: string;
}> {
  const rows = new Map<string, { suite: string; ok: number; fail: number; skip: number; log: string }>();
  for (const testCase of cases) {
    const row =
      rows.get(testCase.file) ??
      {
        suite: testCase.file,
        ok: 0,
        fail: 0,
        skip: 0,
        log: relative(E2E_DIR, testCase.stderrLog),
      };
    row[testCase.status] += 1;
    rows.set(testCase.file, row);
  }
  return [...rows.values()].sort((a, b) => a.suite.localeCompare(b.suite));
}

function summarize(
  cases: TestCaseResult[],
  suites: SuiteResult[],
  spans: ProfileSpan[],
  unpaired: string[],
): {
  suitesOk: number;
  suitesFail: number;
  testsOk: number;
  testsFail: number;
  testsSkip: number;
  spans: number;
  unpaired: number;
} {
  const suitesFail = suites.filter(
    (suite) => suite.exitCode !== 0 || suite.cases.some((testCase) => testCase.status === "fail"),
  ).length;
  return {
    suitesOk: suites.length - suitesFail,
    suitesFail,
    testsOk: cases.filter((testCase) => testCase.status === "ok").length,
    testsFail: cases.filter((testCase) => testCase.status === "fail").length,
    testsSkip: cases.filter((testCase) => testCase.status === "skip").length,
    spans: spans.length,
    unpaired: unpaired.length,
  };
}

function benchmarkRow(
  row: BenchAggregate,
  previous: Map<string, BenchAggregate>,
): string {
  const old = previous.get(`${row.suite}\n${row.label}`);
  const oldPeak = old?.hasPeakInstructions === false ? undefined : old?.peakInstructions;
  return `| ${md(row.label)} | ${row.samples} | ${formatInstructions(row.avgInstructions)} | ${change(row.avgInstructions, old?.avgInstructions)} | ${formatInstructions(row.peakInstructions)} | ${change(row.peakInstructions, oldPeak)} | ${formatBytes(row.avgHeapDeltaBytes)} | ${change(row.avgHeapDeltaBytes, old?.avgHeapDeltaBytes)} | ${formatInstructions(row.totalInstructions)} |`;
}

function writeCsv(path: string, rows: string[][]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${rows.map((row) => row.map(csv).join(",")).join("\n")}\n`);
}

function csv(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else if (ch === '"') {
      quoted = true;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function safeName(path: string): string {
  return path.replace(/[^A-Za-z0-9_.-]+/g, "__");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function baseProfileLabel(label: string): string {
  return label.replace(/:(start|end)$/, "");
}

function parseBigIntField(value: string | undefined): bigint {
  if (value === undefined || value.length === 0) {
    return 0n;
  }
  return BigInt(value);
}

function sumBigInt(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

function maxBigInt(values: bigint[]): bigint {
  return values.reduce((max, value) => (value > max ? value : max), 0n);
}

function secondsToMs(value: string | undefined): number {
  return value === undefined ? 0 : (Number.parseFloat(value) || 0) * 1000;
}

function formatInstructions(value: bigint): string {
  return `${(Number(value) / 1_000_000_000).toFixed(5)} B`;
}

function formatBytes(value: bigint): string {
  return `${(Number(value) / (1024 * 1024)).toFixed(5)} MB`;
}

function change(current: bigint, previous: bigint | undefined): string {
  if (previous === undefined) {
    return "n/a";
  }
  if (previous === 0n) {
    return current === 0n ? "0.0%" : "new";
  }
  const pct = ((Number(current - previous) / Math.abs(Number(previous))) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function statusText(status: TestCaseResult["status"]): string {
  switch (status) {
    case "ok":
      return "OK";
    case "fail":
      return "FAIL";
    case "skip":
      return "SKIP";
  }
}

function md(value: string): string {
  return compact(value).replaceAll("|", "\\|");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripXml(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, ""));
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`E2E runner failed: ${message}`);
  process.exit(1);
});
