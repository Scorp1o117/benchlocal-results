import assert from "node:assert/strict";
import test from "node:test";
import { assertSuiteSequence, buildModelSnapshot, normalizeSuite, snapshotFileName } from "../lib.mjs";

function sampleRun({ packId, totalScore, results, events }) {
  const modelId = "provider:model";
  const data = {
    runId: `${packId}-2026-07-17T00-00-00.000Z-deadbeef`,
    benchPackId: packId,
    packVersion: "1.0.0",
    startedAt: "2026-07-17T00:00:00.000Z",
    completedAt: "2026-07-17T00:01:00.000Z",
    cancelled: false,
    events: [
      { type: "run_started", models: [{ id: modelId, label: "Test Model" }] },
      ...events,
      { type: "run_finished", scores: { [modelId]: { totalScore: totalScore - 10 } } },
    ],
    resultsByModel: { [modelId]: results },
    scores: { [modelId]: { totalScore, categories: [] } },
  };
  return normalizeSuite({
    data,
    raw: Buffer.from(JSON.stringify(data)),
    sourcePath: "summary.json",
    expectedPackId: packId,
  });
}

test("counts scenario_started attempts and penalizes only final passes", () => {
  const suite = sampleRun({
    packId: "toolcall-15",
    totalScore: 90,
    events: [
      { type: "scenario_started", scenarioId: "TC-01" },
      { type: "scenario_result", scenarioId: "TC-01", result: { status: "fail", score: 0 } },
      { type: "scenario_started", scenarioId: "TC-01" },
      { type: "scenario_result", scenarioId: "TC-01", result: { status: "pass", score: 100 } },
      { type: "scenario_started", scenarioId: "TC-02" },
      { type: "scenario_result", scenarioId: "TC-02", result: { status: "fail", score: 0 } },
      { type: "scenario_started", scenarioId: "TC-02" },
      { type: "scenario_result", scenarioId: "TC-02", result: { status: "partial", score: 50 } },
    ],
    results: [
      { scenarioId: "TC-01", status: "pass", score: 100, summary: "recovered" },
      { scenarioId: "TC-02", status: "partial", score: 50, summary: "still partial" },
    ],
  });

  assert.equal(suite.initialTotalScore, 80);
  assert.equal(suite.retryPenalty, 1);
  assert.deepEqual(
    suite.results.map(({ id, attempts, retries }) => ({ id, attempts, retries })),
    [
      { id: "TC-01", attempts: 2, retries: 1 },
      { id: "TC-02", attempts: 2, retries: 0 },
    ],
  );
});

test("calculates weighted and effective scores deterministically", () => {
  const suites = Object.fromEntries(
    [
      ["toolcall", "toolcall-15", 100],
      ["bugfind", "bugfind-15", 95],
      ["hermes", "hermesagent-20", 88],
    ].map(([key, packId, totalScore]) => [
      key,
      sampleRun({
        packId,
        totalScore,
        events: [
          { type: "scenario_started", scenarioId: `${packId}-01` },
          { type: "scenario_result", scenarioId: `${packId}-01`, result: { status: "pass", score: 100 } },
        ],
        results: [{ scenarioId: `${packId}-01`, status: "pass", score: 100, summary: "ok" }],
      }),
    ]),
  );
  suites.toolcall.retryPenalty = 3;
  suites.bugfind.retryPenalty = 1;
  suites.hermes.retryPenalty = 2;

  const snapshot = buildModelSnapshot({ suites, variant: "default" });
  assert.equal(snapshot.scoring.maxScore, 93.7);
  assert.equal(snapshot.scoring.retryPenalty, 6);
  assert.equal(snapshot.scoring.effectiveScore, 87.7);
  assert.equal(snapshot.generatedAt, "2026-07-17T00:01:00.000Z");
  assert.equal(snapshotFileName(snapshot.model), "test-model--default.json");
});

test("rejects latest runs that cross two variant sequences", () => {
  assert.throws(
    () => assertSuiteSequence({
      toolcall: { startedAt: "2026-07-17T12:39:00.000Z" },
      bugfind: { startedAt: "2026-07-17T11:11:00.000Z" },
      hermes: { startedAt: "2026-07-17T11:24:00.000Z" },
    }),
    /not a single TC → BF → HA sequence/,
  );
  assert.doesNotThrow(() => assertSuiteSequence({
    toolcall: { startedAt: "2026-07-17T10:57:00.000Z" },
    bugfind: { startedAt: "2026-07-17T11:11:00.000Z" },
    hermes: { startedAt: "2026-07-17T11:24:00.000Z" },
  }));
});
