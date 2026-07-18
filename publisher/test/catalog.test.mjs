import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCatalog } from "../catalog-lib.mjs";

function snapshot(variant, maxScore, effectiveScore, retryPenalty) {
  const suite = (packId, totalScore) => ({
    packId,
    runId: `${packId}-run-${variant}`,
    completedAt: "2026-07-17T12:00:00.000Z",
    totalScore,
    initialTotalScore: totalScore - 1,
    retryPenalty: 0,
    counts: { pass: 1, partial: 0, fail: 0 },
  });
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-17T12:00:00.000Z",
    model: { id: "provider:model", label: "Model", slug: "model", variant },
    scoring: {
      weights: { toolcall: 0.3, bugfind: 0.3, hermes: 0.4 },
      maxScore,
      effectiveScore,
      retryPenalty,
      counts: { pass: 3, partial: 0, fail: 0 },
    },
    suites: {
      toolcall: suite("toolcall-15", variant === "thinking" ? 100 : 90),
      bugfind: suite("bugfind-15", variant === "thinking" ? 95 : 92),
      hermes: suite("hermesagent-20", variant === "thinking" ? 88 : 80),
    },
    editorial: { metadata: {}, summary: { zh: "", en: "" }, verdict: { zh: "", en: "" } },
  };
}

test("builds a thinking versus no-thinking comparison", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchlocal-catalog-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshots = path.join(root, "snapshots");
  await fs.mkdir(snapshots);
  await fs.writeFile(path.join(snapshots, "model--thinking.json"), JSON.stringify(snapshot("thinking", 93.7, 87.7, 6)));
  await fs.writeFile(path.join(snapshots, "model--no-thinking.json"), JSON.stringify(snapshot("no-thinking", 88.6, 85.6, 3)));
  const catalogPath = path.join(root, "catalog.json");
  const comparisonsPath = path.join(root, "comparisons.json");

  const result = await buildCatalog({ snapshotDirectory: snapshots, catalogPath, comparisonsPath });
  assert.deepEqual(result, { modelCount: 2, comparisonCount: 1 });
  const comparisons = JSON.parse(await fs.readFile(comparisonsPath, "utf8"));
  assert.deepEqual(comparisons.models[0].deltaThinkingMinusNoThinking, {
    maxScore: 5.1,
    effectiveScore: 2.1,
    retryPenalty: 3,
    toolcall: 10,
    bugfind: 3,
    hermes: 8,
  });
  await buildCatalog({ snapshotDirectory: snapshots, catalogPath, comparisonsPath, check: true });
});
