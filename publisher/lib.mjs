import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const SUITE_DEFINITIONS = Object.freeze({
  toolcall: { packId: "toolcall-15", weight: 0.3 },
  bugfind: { packId: "bugfind-15", weight: 0.3 },
  hermes: { packId: "hermesagent-20", weight: 0.4 },
});

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function round1(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function archiveSafeName(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, "_");
}

export function snapshotFileName(model) {
  const variant = slugify(model.variant || "default");
  assert(variant.length > 0, "Model variant must produce a non-empty slug.");
  return `${model.slug}--${variant}.json`;
}

export function assertSuiteSequence(suites) {
  const ordered = [suites.toolcall, suites.bugfind, suites.hermes];
  const timestamps = ordered.map((suite) => Date.parse(suite?.startedAt));
  assert(timestamps.every(Number.isFinite), "Latest-run safety check requires valid startedAt timestamps.");
  assert(
    timestamps[0] <= timestamps[1] && timestamps[1] <= timestamps[2],
    "Latest runs are not a single TC → BF → HA sequence. Another variant may be in progress; pass three explicit paths instead.",
  );
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath);
  return { raw, data: JSON.parse(raw.toString("utf8")) };
}

export async function latestSummary(benchRoot, packId) {
  const runsDirectory = path.join(benchRoot, "runs", packId);
  const entries = await fs.readdir(runsDirectory, { withFileTypes: true });
  const runDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packId}-`))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  assert(runDirectories.length > 0, `No runs found for ${packId} under ${runsDirectory}.`);
  for (const runDirectory of runDirectories) {
    const candidate = path.join(runsDirectory, runDirectory, "summary.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Ignore incomplete run directories and continue to the next candidate.
    }
  }
  throw new Error(`No summary.json found for ${packId} under ${runsDirectory}.`);
}

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function objectEntry(object, label) {
  assert(object && typeof object === "object" && !Array.isArray(object), `${label} must be an object.`);
  const entries = Object.entries(object);
  assert(entries.length === 1, `${label} must contain exactly one model; found ${entries.length}.`);
  return entries[0];
}

function finalScenarioResults(data, modelId) {
  const results = data.resultsByModel?.[modelId];
  assert(Array.isArray(results), `Missing resultsByModel entry for ${modelId}.`);
  return results;
}

function attemptCounts(events) {
  const counts = new Map();
  for (const event of events ?? []) {
    if (event?.type !== "scenario_started" || !event.scenarioId) continue;
    counts.set(event.scenarioId, (counts.get(event.scenarioId) ?? 0) + 1);
  }
  return counts;
}

function firstAttemptResults(events) {
  const first = new Map();
  for (const event of events ?? []) {
    if (event?.type !== "scenario_result" || !event.scenarioId || first.has(event.scenarioId)) continue;
    first.set(event.scenarioId, event.result);
  }
  return first;
}

function initialScore(data, modelId) {
  const event = (data.events ?? []).find((item) => item?.type === "run_finished");
  const value = event?.scores?.[modelId]?.totalScore;
  return typeof value === "number" ? value : null;
}

export function normalizeSuite({ data, raw, sourcePath, expectedPackId }) {
  assert(data?.benchPackId === expectedPackId, `Expected ${expectedPackId}, got ${data?.benchPackId ?? "unknown"}.`);
  assert(data.cancelled === false, `${data.runId ?? expectedPackId} was cancelled.`);
  assert(typeof data.runId === "string" && data.runId.length > 0, `Missing runId for ${expectedPackId}.`);

  const [scoreModelId, score] = objectEntry(data.scores, `${expectedPackId}.scores`);
  assert(typeof score?.totalScore === "number", `Missing final totalScore for ${expectedPackId}.`);
  const [resultModelId] = objectEntry(data.resultsByModel, `${expectedPackId}.resultsByModel`);
  assert(scoreModelId === resultModelId, `${expectedPackId} score and result model IDs differ.`);

  const started = (data.events ?? []).find((event) => event?.type === "run_started");
  const startedModel = started?.models?.find((model) => model.id === scoreModelId) ?? started?.models?.[0];
  const modelLabel = startedModel?.label ?? scoreModelId.split(":").at(-1);
  const attempts = attemptCounts(data.events);
  const first = firstAttemptResults(data.events);
  const results = finalScenarioResults(data, scoreModelId).map((result) => {
    const attemptCount = attempts.get(result.scenarioId) ?? 0;
    assert(attemptCount >= 1, `${expectedPackId}/${result.scenarioId} has a final result but no scenario_started event.`);
    const passed = result.status === "pass";
    return {
      id: result.scenarioId,
      status: result.status,
      score: result.score,
      summary: result.summary ?? "",
      attempts: attemptCount,
      retries: passed ? Math.max(0, attemptCount - 1) : 0,
      firstAttempt: first.has(result.scenarioId)
        ? {
            status: first.get(result.scenarioId)?.status ?? null,
            score: first.get(result.scenarioId)?.score ?? null,
          }
        : null,
    };
  });

  const retryPenalty = results.reduce((sum, result) => sum + result.retries, 0);
  const counts = results.reduce(
    (acc, result) => {
      if (result.status === "pass") acc.pass += 1;
      else if (result.status === "partial") acc.partial += 1;
      else acc.fail += 1;
      return acc;
    },
    { pass: 0, partial: 0, fail: 0 },
  );

  return {
    packId: expectedPackId,
    packVersion: data.packVersion ?? null,
    runId: data.runId,
    startedAt: data.startedAt ?? null,
    completedAt: data.completedAt ?? null,
    model: { id: scoreModelId, label: modelLabel },
    source: {
      fileName: path.basename(sourcePath),
      sha256: sha256(raw),
    },
    initialTotalScore: initialScore(data, scoreModelId),
    totalScore: score.totalScore,
    categories: Array.isArray(score.categories) ? score.categories : [],
    retryPenalty,
    counts,
    results,
  };
}

export function buildModelSnapshot({ suites, slug, variant = "default" }) {
  const suiteValues = Object.values(suites);
  assert(suiteValues.length === 3, "Exactly three suites are required.");
  const modelIds = new Set(suiteValues.map((suite) => suite.model.id));
  const labels = new Set(suiteValues.map((suite) => suite.model.label));
  assert(modelIds.size === 1, `Suite model IDs differ: ${[...modelIds].join(", ")}`);
  assert(labels.size === 1, `Suite model labels differ: ${[...labels].join(", ")}`);

  for (const [key, definition] of Object.entries(SUITE_DEFINITIONS)) {
    assert(suites[key]?.packId === definition.packId, `Missing or invalid ${definition.packId} suite.`);
  }

  const modelLabel = suiteValues[0].model.label;
  const completedTimes = suiteValues
    .map((suite) => Date.parse(suite.completedAt ?? suite.startedAt ?? ""))
    .filter(Number.isFinite);
  assert(completedTimes.length === suiteValues.length, "Every suite must have a valid completion timestamp.");
  const maxScore = round1(
    Object.entries(SUITE_DEFINITIONS).reduce(
      (sum, [key, definition]) => sum + suites[key].totalScore * definition.weight,
      0,
    ),
  );
  const retryPenalty = suiteValues.reduce((sum, suite) => sum + suite.retryPenalty, 0);
  const counts = suiteValues.reduce(
    (acc, suite) => ({
      pass: acc.pass + suite.counts.pass,
      partial: acc.partial + suite.counts.partial,
      fail: acc.fail + suite.counts.fail,
    }),
    { pass: 0, partial: 0, fail: 0 },
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date(Math.max(...completedTimes)).toISOString(),
    model: {
      id: suiteValues[0].model.id,
      label: modelLabel,
      slug: slug || slugify(modelLabel),
      variant,
    },
    scoring: {
      weights: { toolcall: 0.3, bugfind: 0.3, hermes: 0.4 },
      maxScore,
      retryPenalty,
      effectiveScore: round1(maxScore - retryPenalty),
      counts,
    },
    suites,
    editorial: {
      metadata: {},
      summary: { zh: "", en: "" },
      verdict: { zh: "", en: "" },
    },
  };
}

export async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

export async function copyVerified(sourcePath, destinationPath, expectedHash) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    const existing = await fs.readFile(destinationPath);
    assert(sha256(existing) === expectedHash, `Archive collision at ${destinationPath}.`);
    return "unchanged";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.copyFile(sourcePath, destinationPath);
  const copied = await fs.readFile(destinationPath);
  assert(sha256(copied) === expectedHash, `Archive verification failed for ${destinationPath}.`);
  return "copied";
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    assert(token.startsWith("--"), `Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}
