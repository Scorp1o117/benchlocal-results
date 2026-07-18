#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { SUITE_DEFINITIONS, assert, parseArgs, readJson, round1, snapshotFileName } from "./lib.mjs";

function finiteScore(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number.`);
  assert(value >= 0 && value <= 100, `${label} must be between 0 and 100.`);
}

function validateSuite(key, suite, definition, fileName) {
  const prefix = `${fileName}:${key}`;
  assert(suite?.packId === definition.packId, `${prefix} must use ${definition.packId}.`);
  assert(typeof suite.runId === "string" && suite.runId.startsWith(`${definition.packId}-`), `${prefix} has an invalid runId.`);
  assert(typeof suite.source?.sha256 === "string" && /^[a-f0-9]{64}$/.test(suite.source.sha256), `${prefix} has an invalid SHA-256.`);
  finiteScore(suite.totalScore, `${prefix}.totalScore`);
  assert(Array.isArray(suite.results) && suite.results.length > 0, `${prefix}.results must be non-empty.`);

  const ids = new Set();
  let retryPenalty = 0;
  const counts = { pass: 0, partial: 0, fail: 0 };
  for (const result of suite.results) {
    assert(typeof result.id === "string" && !ids.has(result.id), `${prefix} has duplicate scenario ${result.id}.`);
    ids.add(result.id);
    finiteScore(result.score, `${prefix}/${result.id}.score`);
    assert(Number.isInteger(result.attempts) && result.attempts >= 1, `${prefix}/${result.id}.attempts must be >= 1.`);
    assert(Number.isInteger(result.retries) && result.retries >= 0, `${prefix}/${result.id}.retries must be >= 0.`);
    const expectedRetries = result.status === "pass" ? result.attempts - 1 : 0;
    assert(result.retries === expectedRetries, `${prefix}/${result.id} retries should be ${expectedRetries}, got ${result.retries}.`);
    retryPenalty += result.retries;
    if (result.status === "pass") counts.pass += 1;
    else if (result.status === "partial") counts.partial += 1;
    else counts.fail += 1;
  }

  assert(retryPenalty === suite.retryPenalty, `${prefix}.retryPenalty should be ${retryPenalty}.`);
  for (const status of Object.keys(counts)) {
    assert(counts[status] === suite.counts?.[status], `${prefix}.counts.${status} should be ${counts[status]}.`);
  }
}

function validateSnapshot(snapshot, fileName) {
  assert(snapshot?.schemaVersion === 1, `${fileName} has an unsupported schemaVersion.`);
  assert(!Number.isNaN(Date.parse(snapshot.generatedAt)), `${fileName}.generatedAt is invalid.`);
  assert(typeof snapshot.model?.id === "string" && snapshot.model.id, `${fileName} is missing model.id.`);
  assert(typeof snapshot.model?.label === "string" && snapshot.model.label, `${fileName} is missing model.label.`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(snapshot.model?.slug ?? ""), `${fileName} has an invalid model.slug.`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(snapshot.model?.variant ?? ""), `${fileName} has an invalid model.variant.`);
  assert(fileName === snapshotFileName(snapshot.model), `${fileName} must include both model.slug and model.variant.`);

  const modelIds = new Set();
  for (const [key, definition] of Object.entries(SUITE_DEFINITIONS)) {
    const suite = snapshot.suites?.[key];
    validateSuite(key, suite, definition, fileName);
    modelIds.add(suite.model?.id);
  }
  assert(modelIds.size === 1 && modelIds.has(snapshot.model.id), `${fileName} suite model IDs do not match model.id.`);

  const expectedMax = round1(
    Object.entries(SUITE_DEFINITIONS).reduce(
      (sum, [key, definition]) => sum + snapshot.suites[key].totalScore * definition.weight,
      0,
    ),
  );
  const expectedPenalty = Object.keys(SUITE_DEFINITIONS).reduce(
    (sum, key) => sum + snapshot.suites[key].retryPenalty,
    0,
  );
  assert(snapshot.scoring?.maxScore === expectedMax, `${fileName} maxScore should be ${expectedMax}.`);
  assert(snapshot.scoring?.retryPenalty === expectedPenalty, `${fileName} retryPenalty should be ${expectedPenalty}.`);
  assert(snapshot.scoring?.effectiveScore === round1(expectedMax - expectedPenalty), `${fileName} effectiveScore is inconsistent.`);

  const expectedCounts = Object.keys(SUITE_DEFINITIONS).reduce(
    (acc, key) => {
      for (const status of Object.keys(acc)) acc[status] += snapshot.suites[key].counts[status];
      return acc;
    },
    { pass: 0, partial: 0, fail: 0 },
  );
  for (const status of Object.keys(expectedCounts)) {
    assert(snapshot.scoring.counts?.[status] === expectedCounts[status], `${fileName} scoring.counts.${status} is inconsistent.`);
  }

  const metadata = snapshot.editorial?.metadata;
  assert(typeof metadata?.displayName === "string" && metadata.displayName.trim(), `${fileName} is missing editorial.metadata.displayName.`);
  assert(typeof metadata?.modelFile === "string" && metadata.modelFile.trim(), `${fileName} is missing editorial.metadata.modelFile.`);
  assert(typeof metadata?.logoUrl === "string" && metadata.logoUrl.trim(), `${fileName} is missing editorial.metadata.logoUrl.`);
  for (const field of ["summary", "verdict"]) {
    for (const language of ["zh", "en"]) {
      assert(typeof snapshot.editorial?.[field]?.[language] === "string" && snapshot.editorial[field][language].trim(), `${fileName} is missing editorial.${field}.${language}.`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDirectory = path.resolve(process.cwd(), typeof args.data === "string" ? args.data : "publisher/data/models");
  const sourceManifest = (await readJson(path.resolve(process.cwd(), "publisher/data/model-sources.json"))).data;
  assert(sourceManifest.schemaVersion === 1, "model-sources.json has an unsupported schemaVersion.");
  await fs.mkdir(dataDirectory, { recursive: true });
  const files = (await fs.readdir(dataDirectory)).filter((name) => name.endsWith(".json")).sort();
  const slugs = new Set();
  for (const file of files) {
    const { data } = await readJson(path.join(dataDirectory, file));
    validateSnapshot(data, file);
    if (!/^https?:\/\//i.test(data.editorial.metadata.logoUrl)) {
      const logoPath = path.resolve(process.cwd(), data.editorial.metadata.logoUrl);
      await fs.access(logoPath).catch(() => assert(false, `${file} references missing local logo ${data.editorial.metadata.logoUrl}.`));
    }
    const sources = sourceManifest.models[data.model.slug];
    assert(sources, `${file} has no entry in model-sources.json.`);
    for (const key of ["artifactUrl", "upstreamUrl", "publisherUrl"]) {
      assert(sources[key] === null || /^https:\/\//.test(sources[key]), `${data.model.slug}.${key} must be an HTTPS URL or null.`);
      assert(data.editorial.metadata[key] === sources[key], `${file} ${key} is stale; run npm run build.`);
    }
    const identity = `${data.model.slug}::${data.model.variant}`;
    assert(!slugs.has(identity), `Duplicate model variant: ${identity}.`);
    slugs.add(identity);
  }
  const sourceSlugs = Object.keys(sourceManifest.models).sort();
  const snapshotSlugs = [...new Set([...slugs].map((identity) => identity.split("::", 1)[0]))].sort();
  assert(JSON.stringify(sourceSlugs) === JSON.stringify(snapshotSlugs), "model-sources.json must contain exactly one entry per model slug.");
  console.log(`Data validation passed: ${files.length} model snapshot${files.length === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(`data validation failed: ${error.message}`);
  process.exitCode = 1;
});
