#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  SUITE_DEFINITIONS,
  archiveSafeName,
  assert,
  assertSuiteSequence,
  buildModelSnapshot,
  copyVerified,
  latestSummary,
  normalizeSuite,
  parseArgs,
  readJson,
  snapshotFileName,
  slugify,
  writeJsonAtomic,
} from "./lib.mjs";

function usage() {
  return `
Usage:
  npm run extract -- --latest [--bench-root ..] [--variant thinking]

or:

  npm run extract -- \\
    --toolcall <summary.json> \\
    --bugfind <summary.json> \\
    --hermes <summary.json> \\
    --variant thinking|no-thinking \\
    [--slug model-slug] \\
    [--output publisher/data/models] \\
    [--archive ../by-model] \\
    [--replace] \\
    [--no-archive]

The command validates one single-model run from each published suite, creates a
normalized model snapshot, and archives byte-identical source summaries.
`.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  assert(typeof args.variant === "string" && slugify(args.variant), `Missing --variant; mode cannot be inferred from BenchLocal model ID.\n\n${usage()}`);

  const cwd = process.cwd();
  const benchRoot = path.resolve(cwd, typeof args["bench-root"] === "string" ? args["bench-root"] : "..");
  const sourcePaths = {};
  if (args.latest) {
    for (const [key, definition] of Object.entries(SUITE_DEFINITIONS)) {
      sourcePaths[key] = await latestSummary(benchRoot, definition.packId);
    }
  } else {
    for (const key of Object.keys(SUITE_DEFINITIONS)) {
      assert(typeof args[key] === "string", `Missing --${key}; pass all three paths or use --latest.\n\n${usage()}`);
      sourcePaths[key] = path.resolve(cwd, args[key]);
    }
  }

  const sources = {};
  const suites = {};
  for (const [key, definition] of Object.entries(SUITE_DEFINITIONS)) {
    const sourcePath = sourcePaths[key];
    const { raw, data } = await readJson(sourcePath);
    sources[key] = sourcePath;
    suites[key] = normalizeSuite({
      data,
      raw,
      sourcePath,
      expectedPackId: definition.packId,
    });
  }

  if (args.latest) {
    assertSuiteSequence(suites);
  }

  const variant = slugify(args.variant);
  const requestedSlug = typeof args.slug === "string" ? slugify(args.slug) : null;
  const snapshot = buildModelSnapshot({ suites, slug: requestedSlug, variant });
  const outputDirectory = path.resolve(cwd, typeof args.output === "string" ? args.output : "publisher/data/models");
  const outputPath = path.join(outputDirectory, snapshotFileName(snapshot.model));

  try {
    const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const previousRuns = Object.keys(SUITE_DEFINITIONS).map((key) => existing.suites?.[key]?.runId);
    const nextRuns = Object.keys(SUITE_DEFINITIONS).map((key) => snapshot.suites[key].runId);
    const sameRuns = previousRuns.every((runId, index) => runId === nextRuns[index]);
    assert(sameRuns || args.replace, `${path.basename(outputPath)} already references different runs; pass --replace to update it intentionally.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let archiveDirectory = null;
  const archiveResults = [];
  if (!args["no-archive"]) {
    const archiveRoot = path.resolve(cwd, typeof args.archive === "string" ? args.archive : path.join(benchRoot, "by-model"));
    archiveDirectory = path.join(archiveRoot, archiveSafeName(snapshot.model.label));
    archiveDirectory = path.join(archiveDirectory, archiveSafeName(variant));

    for (const [key, definition] of Object.entries(SUITE_DEFINITIONS)) {
      const suite = suites[key];
      const destination = path.join(archiveDirectory, `${definition.packId}_${suite.runId}.json`);
      const status = await copyVerified(sources[key], destination, suite.source.sha256);
      archiveResults.push({ packId: definition.packId, destination, status });
    }
  }

  await writeJsonAtomic(outputPath, snapshot);
  const relativeOutput = path.relative(cwd, outputPath) || outputPath;
  console.log(`Model: ${snapshot.model.label} (${variant})`);
  console.log(
    `Scores: TC ${suites.toolcall.totalScore} · BF ${suites.bugfind.totalScore} · HA ${suites.hermes.totalScore}`,
  );
  console.log(
    `Max ${snapshot.scoring.maxScore} · retries -${snapshot.scoring.retryPenalty} · effective ${snapshot.scoring.effectiveScore}`,
  );
  console.log(`Outcomes: ${snapshot.scoring.counts.pass} pass · ${snapshot.scoring.counts.partial} partial · ${snapshot.scoring.counts.fail} fail`);
  console.log(`Snapshot: ${relativeOutput}`);
  if (archiveDirectory) {
    for (const result of archiveResults) {
      console.log(`Archive ${result.status}: ${path.relative(cwd, result.destination)}`);
    }
  }

  // Ensure callers never proceed with a partially written snapshot.
  await fs.access(outputPath);
}

main().catch((error) => {
  console.error(`extract failed: ${error.message}`);
  process.exitCode = 1;
});
