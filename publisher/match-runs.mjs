#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildModelSnapshot, normalizeSuite, round1, snapshotFileName, writeJsonAtomic } from "./lib.mjs";

const cwd = process.cwd();
const runsRoot = path.resolve(cwd, "../runs");
const indexPath = path.resolve(cwd, "index.html");
const snapshotDirectory = path.resolve(cwd, "publisher/data/models");
const reportPath = path.resolve(cwd, "publisher/data/run-matches.json");
const MAX_SPAN_MS = 48 * 60 * 60 * 1000;
const EXTENDED_SPAN_MS = 14 * 24 * 60 * 60 * 1000;

function homepageEntries(html) {
  const cards = [...html.matchAll(/<div class="[^"]*\bmodel-card\b[^"]*"[^>]*>/gi)];
  return cards.map((card, index) => {
    const opening = card[0];
    const body = html.slice(card.index, cards[index + 1]?.index ?? html.indexOf("</section>", card.index));
    const scores = [...body.matchAll(/card-score-box[^>]*>[\s\S]*?class="val">([^<]+)/g)].slice(0, 2).map((match) => Number(match[1]));
    const suites = [...body.matchAll(/class="bar-val"[^>]*>([^<]+)/g)].slice(0, 3).map((match) => Number(match[1]));
    const name = opening.match(/data-model-name="([^"]+)"/)?.[1];
    const outcomes = opening.match(/data-outcomes="([^"]+)"/)?.[1]?.split(",").map(Number);
    const link = opening.match(/onclick="location\.href='([^']+)'"/)?.[1];
    if (!name || !link || scores.length !== 2 || suites.length !== 3 || outcomes?.length !== 3) throw new Error(`Homepage card ${index + 1} is missing canonical data.`);
    return {
      index: index + 1,
      name,
      link,
      slug: path.basename(link.split("#", 1)[0], ".html").replace(/-thinking$/, ""),
      variant: name.includes("无思考") ? "no-thinking" : name.includes("思考") ? "thinking" : "default",
      maxScore: scores[0],
      effectiveScore: scores[1],
      retryPenalty: round1(scores[0] - scores[1]),
      toolcall: suites[0],
      bugfind: suites[1],
      hermes: suites[2],
      counts: { pass: outcomes[0], partial: outcomes[1], fail: outcomes[2] },
    };
  });
}

async function summaryFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await summaryFiles(fullPath));
    else if (entry.isFile() && entry.name === "summary.json") files.push(fullPath);
  }
  return files;
}

async function normalizedRuns() {
  const valid = [];
  const rejected = [];
  for (const file of await summaryFiles(runsRoot)) {
    try {
      const raw = await fs.readFile(file);
      const data = JSON.parse(raw.toString("utf8"));
      if (!data?.benchPackId || data.cancelled !== false) {
        rejected.push({ file: path.relative(runsRoot, file).replaceAll("\\", "/"), reason: data?.cancelled ? "cancelled" : "invalid" });
        continue;
      }
      const suite = normalizeSuite({ data, raw, sourcePath: file, expectedPackId: data.benchPackId });
      valid.push({ suite, file });
    } catch (error) {
      rejected.push({ file: path.relative(runsRoot, file).replaceAll("\\", "/"), reason: error.message });
    }
  }
  return { valid, rejected };
}

function close(left, right, tolerance = 0.11) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function candidateSummary(snapshot, files, spanMs) {
  return {
    modelId: snapshot.model.id,
    modelLabel: snapshot.model.label,
    runIds: {
      toolcall: snapshot.suites.toolcall.runId,
      bugfind: snapshot.suites.bugfind.runId,
      hermes: snapshot.suites.hermes.runId,
    },
    sources: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, path.relative(runsRoot, file).replaceAll("\\", "/")])),
    spanHours: round1(spanMs / 3_600_000),
    scoring: snapshot.scoring,
    suites: {
      toolcall: snapshot.suites.toolcall.totalScore,
      bugfind: snapshot.suites.bugfind.totalScore,
      hermes: snapshot.suites.hermes.totalScore,
    },
  };
}

function identityTokens(value) {
  const ignored = new Set(["thinking", "no", "uncensored", "heretic", "native", "mtp", "preserved", "apex", "gguf", "original", "i"]);
  return String(value).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token && !ignored.has(token));
}

function identityMatches(targetName, modelLabel) {
  const target = [...new Set(identityTokens(targetName))];
  const model = new Set(identityTokens(modelLabel));
  const overlap = target.filter((token) => model.has(token)).length;
  return overlap >= Math.min(2, target.length) && overlap / target.length >= 0.6;
}

function isSuiteOrdered(candidate) {
  const toolcall = Date.parse(candidate.snapshot.suites.toolcall.startedAt);
  const bugfind = Date.parse(candidate.snapshot.suites.bugfind.startedAt);
  const hermes = Date.parse(candidate.snapshot.suites.hermes.startedAt);
  return toolcall <= bugfind && bugfind <= hermes;
}

function matchesTarget(snapshot, target) {
  return close(snapshot.scoring.maxScore, target.maxScore)
    && close(snapshot.scoring.effectiveScore, target.effectiveScore)
    && snapshot.scoring.retryPenalty === target.retryPenalty
    && close(snapshot.suites.toolcall.totalScore, target.toolcall, 0.6)
    && close(snapshot.suites.bugfind.totalScore, target.bugfind, 0.6)
    && close(snapshot.suites.hermes.totalScore, target.hermes, 0.6)
    && snapshot.scoring.counts.pass === target.counts.pass
    && snapshot.scoring.counts.partial === target.counts.partial
    && snapshot.scoring.counts.fail === target.counts.fail;
}

function matchesScoreTarget(snapshot, target) {
  return close(snapshot.scoring.maxScore, target.maxScore, 0.6)
    && close(snapshot.suites.toolcall.totalScore, target.toolcall, 0.6)
    && close(snapshot.suites.bugfind.totalScore, target.bugfind, 0.6)
    && close(snapshot.suites.hermes.totalScore, target.hermes, 0.6);
}

function matchesLegacyDisplayTarget(snapshot, target) {
  return close(snapshot.scoring.maxScore, target.maxScore, 1.5)
    && close(snapshot.suites.toolcall.totalScore, target.toolcall, 3.1)
    && close(snapshot.suites.bugfind.totalScore, target.bugfind, 3.1)
    && close(snapshot.suites.hermes.totalScore, target.hermes, 3.1);
}

function findCandidates(target, byModel, { matcher = matchesTarget, suiteTolerance = 0.6, maxSpanMs = MAX_SPAN_MS } = {}) {
  const found = [];
  for (const runs of byModel.values()) {
    const toolcalls = runs.filter((item) => item.suite.packId === "toolcall-15" && close(item.suite.totalScore, target.toolcall, suiteTolerance));
    const bugfinds = runs.filter((item) => item.suite.packId === "bugfind-15" && close(item.suite.totalScore, target.bugfind, suiteTolerance));
    const hermesRuns = runs.filter((item) => item.suite.packId === "hermesagent-20" && close(item.suite.totalScore, target.hermes, suiteTolerance));
    for (const toolcall of toolcalls) for (const bugfind of bugfinds) for (const hermes of hermesRuns) {
      const times = [toolcall.suite.startedAt, bugfind.suite.startedAt, hermes.suite.startedAt].map(Date.parse);
      if (times.some((time) => !Number.isFinite(time))) continue;
      const spanMs = Math.max(...times) - Math.min(...times);
      if (spanMs > maxSpanMs) continue;
      try {
        const snapshot = buildModelSnapshot({ suites: { toolcall: toolcall.suite, bugfind: bugfind.suite, hermes: hermes.suite }, slug: target.slug, variant: target.variant });
        if (matcher(snapshot, target)) found.push({ snapshot, files: { toolcall: toolcall.file, bugfind: bugfind.file, hermes: hermes.file }, spanMs });
      } catch {
        // Candidate suites can share a score while belonging to different model labels; ignore those combinations.
      }
    }
  }
  return found.sort((left, right) => left.spanMs - right.spanMs);
}

async function main() {
  const homepage = homepageEntries(await fs.readFile(indexPath, "utf8"));
  const { valid, rejected } = await normalizedRuns();
  const byModel = new Map();
  for (const item of valid) {
    const group = byModel.get(item.suite.model.id) ?? [];
    group.push(item);
    byModel.set(item.suite.model.id, group);
  }

  const results = [];
  const uniqueCandidates = [];
  for (const target of homepage) {
    const candidates = findCandidates(target, byModel);
    const nearestIsDistinct = candidates.length > 1
      && candidates[0].snapshot.model.id === candidates[1].snapshot.model.id
      && candidates[0].spanMs * 2 < candidates[1].spanMs;
    const nearCandidates = candidates.length === 0 ? findCandidates(target, byModel, { matcher: matchesScoreTarget, maxSpanMs: EXTENDED_SPAN_MS }).slice(0, 10) : [];
    const identityCandidates = nearCandidates.filter((candidate) => candidate.spanMs <= MAX_SPAN_MS && identityMatches(target.name, candidate.snapshot.model.label));
    const identityNearestIsDistinct = identityCandidates.length === 1
      || (identityCandidates.length > 1
        && identityCandidates[0].snapshot.model.id === identityCandidates[1].snapshot.model.id
        && identityCandidates[0].spanMs * 2 < identityCandidates[1].spanMs);
    const legacyCandidates = candidates.length === 0 && !identityNearestIsDistinct
      ? findCandidates(target, byModel, { matcher: matchesLegacyDisplayTarget, suiteTolerance: 3.1 })
        .filter((candidate) => identityMatches(target.name, candidate.snapshot.model.label))
      : [];
    const orderedLegacyCandidates = legacyCandidates.filter(isSuiteOrdered);
    const legacyPool = orderedLegacyCandidates.length > 0 ? orderedLegacyCandidates : legacyCandidates;
    const legacyNearestIsDistinct = legacyPool.length === 1
      || (legacyPool.length > 1
        && legacyPool[0].snapshot.model.id === legacyPool[1].snapshot.model.id
        && legacyPool[0].spanMs * 2 < legacyPool[1].spanMs);
    const status = candidates.length === 1
      ? "unique"
      : candidates.length > 1
        ? nearestIsDistinct ? "resolved-nearest" : "ambiguous"
        : identityNearestIsDistinct
          ? "resolved-identity-nearest"
          : legacyNearestIsDistinct ? "resolved-legacy-display" : "unmatched";
    const selected = status === "unique" || status === "resolved-nearest"
      ? candidates[0]
      : status === "resolved-identity-nearest"
        ? identityCandidates[0]
        : status === "resolved-legacy-display" ? legacyPool[0] : null;
    results.push({ target, status, selected: selected ? candidateSummary(selected.snapshot, selected.files, selected.spanMs) : null, candidates: candidates.map((candidate) => candidateSummary(candidate.snapshot, candidate.files, candidate.spanMs)), nearCandidates: nearCandidates.map((candidate) => candidateSummary(candidate.snapshot, candidate.files, candidate.spanMs)), legacyCandidates: legacyCandidates.map((candidate) => candidateSummary(candidate.snapshot, candidate.files, candidate.spanMs)) });
    if (selected) uniqueCandidates.push({ target, ...selected });
  }

  let migrated = 0;
  let existing = 0;
  if (process.argv.includes("--migrate-unique")) {
    for (const { target, snapshot } of uniqueCandidates) {
      snapshot.editorial.metadata = { pageMode: "legacy", legacyPage: target.link, homepageName: target.name, matchedFromRuns: true };
      const outputPath = path.join(snapshotDirectory, snapshotFileName(snapshot.model));
      try {
        await fs.access(outputPath);
        existing += 1;
      } catch {
        await writeJsonAtomic(outputPath, snapshot);
        migrated += 1;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rules: { maxRunSpanHours: MAX_SPAN_MS / 3_600_000, extendedDiagnosticSpanHours: EXTENDED_SPAN_MS / 3_600_000, suiteDisplayTolerance: 0.6, aggregateTolerance: 0.11, requireExactRetriesAndOutcomes: true, nearestRunResolution: "same model and best span less than half the next candidate span", identityResolution: "at least two identity tokens and 60 percent target token coverage, then unique or distinctly nearest run cluster", legacyDisplayResolution: "same model within 48 hours, max score within 1.5 and each displayed suite within 3.1; prefer TC then BF then HA order" },
    counts: {
      summaries: valid.length + rejected.length,
      validRuns: valid.length,
      rejectedRuns: rejected.length,
      homepage: homepage.length,
      unique: results.filter((item) => item.status === "unique").length,
      resolvedNearest: results.filter((item) => item.status === "resolved-nearest").length,
      resolvedIdentityNearest: results.filter((item) => item.status === "resolved-identity-nearest").length,
      resolvedLegacyDisplay: results.filter((item) => item.status === "resolved-legacy-display").length,
      ambiguous: results.filter((item) => item.status === "ambiguous").length,
      unmatched: results.filter((item) => item.status === "unmatched").length,
      migrated,
      existing,
    },
    results,
    rejected,
  };
  await writeJsonAtomic(reportPath, report);
  console.log(`Run matching updated: ${report.counts.unique} unique, ${report.counts.resolvedNearest} nearest-run, ${report.counts.resolvedIdentityNearest} identity-nearest, ${report.counts.resolvedLegacyDisplay} legacy-display, ${report.counts.ambiguous} ambiguous, ${report.counts.unmatched} unmatched; ${migrated} migrated.`);
}

main().catch((error) => {
  console.error(`run matching failed: ${error.message}`);
  process.exitCode = 1;
});
