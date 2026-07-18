#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { SUITE_DEFINITIONS, assertSuiteSequence, latestSummary, parseArgs, readJson } from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const benchRoot = path.resolve(cwd, typeof args["bench-root"] === "string" ? args["bench-root"] : "..");
  const suites = {};
  for (const [key, definition] of Object.entries(SUITE_DEFINITIONS)) {
    const file = await latestSummary(benchRoot, definition.packId);
    const { data } = await readJson(file);
    const modelEntry = Object.entries(data.scores ?? {})[0];
    const started = (data.events ?? []).find((event) => event?.type === "run_started");
    suites[key] = {
      packId: definition.packId,
      runId: data.runId,
      model: started?.models?.[0]?.label ?? modelEntry?.[0] ?? "unknown",
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      score: modelEntry?.[1]?.totalScore ?? null,
    };
  }

  console.table(Object.values(suites).map((suite) => ({
    pack: suite.packId,
    model: suite.model,
    score: suite.score,
    startedAt: suite.startedAt,
    completedAt: suite.completedAt,
  })));
  try {
    assertSuiteSequence(suites);
    const models = new Set(Object.values(suites).map((suite) => suite.model));
    if (models.size !== 1) throw new Error("Latest suites belong to different model labels.");
    console.log("Ready: latest runs form one TC → BF → HA sequence.");
  } catch (error) {
    console.log(`Not ready: ${error.message}`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`status failed: ${error.message}`);
  process.exitCode = 1;
});
