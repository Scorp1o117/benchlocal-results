import fs from "node:fs/promises";
import path from "node:path";
import { assert, readJson, round1, writeJsonAtomic } from "./lib.mjs";

function publicSuite(suite) {
  return {
    packId: suite.packId,
    runId: suite.runId,
    completedAt: suite.completedAt,
    totalScore: suite.totalScore,
    initialTotalScore: suite.initialTotalScore,
    retryPenalty: suite.retryPenalty,
    counts: suite.counts,
  };
}

function publicModel(snapshot) {
  return {
    slug: snapshot.model.slug,
    variant: snapshot.model.variant,
    label: snapshot.model.label,
    generatedAt: snapshot.generatedAt,
    scoring: snapshot.scoring,
    suites: {
      toolcall: publicSuite(snapshot.suites.toolcall),
      bugfind: publicSuite(snapshot.suites.bugfind),
      hermes: publicSuite(snapshot.suites.hermes),
    },
    editorial: snapshot.editorial,
  };
}

function comparisonFor(slug, variants) {
  const byVariant = Object.fromEntries(variants.map((item) => [item.variant, item]));
  const thinking = byVariant.thinking;
  const noThinking = byVariant["no-thinking"];
  const comparison = {
    slug,
    label: variants[0].label,
    variants: Object.fromEntries(
      variants
        .slice()
        .sort((a, b) => a.variant.localeCompare(b.variant))
        .map((item) => [
          item.variant,
          {
            maxScore: item.scoring.maxScore,
            effectiveScore: item.scoring.effectiveScore,
            retryPenalty: item.scoring.retryPenalty,
            toolcall: item.suites.toolcall.totalScore,
            bugfind: item.suites.bugfind.totalScore,
            hermes: item.suites.hermes.totalScore,
          },
        ]),
    ),
  };
  if (thinking && noThinking) {
    comparison.deltaThinkingMinusNoThinking = {
      maxScore: round1(thinking.scoring.maxScore - noThinking.scoring.maxScore),
      effectiveScore: round1(thinking.scoring.effectiveScore - noThinking.scoring.effectiveScore),
      retryPenalty: thinking.scoring.retryPenalty - noThinking.scoring.retryPenalty,
      toolcall: thinking.suites.toolcall.totalScore - noThinking.suites.toolcall.totalScore,
      bugfind: thinking.suites.bugfind.totalScore - noThinking.suites.bugfind.totalScore,
      hermes: thinking.suites.hermes.totalScore - noThinking.suites.hermes.totalScore,
    };
  }
  return comparison;
}

export async function buildCatalog({ snapshotDirectory, catalogPath, comparisonsPath, check = false }) {
  const files = (await fs.readdir(snapshotDirectory)).filter((name) => name.endsWith(".json")).sort();
  const snapshots = [];
  for (const file of files) snapshots.push((await readJson(path.join(snapshotDirectory, file))).data);
  const models = snapshots.map(publicModel).sort((left, right) => {
    if (right.scoring.maxScore !== left.scoring.maxScore) return right.scoring.maxScore - left.scoring.maxScore;
    return `${left.slug}:${left.variant}`.localeCompare(`${right.slug}:${right.variant}`);
  });
  const generatedAt = models.length > 0
    ? new Date(Math.max(...models.map((model) => Date.parse(model.generatedAt)))).toISOString()
    : null;
  const catalog = { schemaVersion: 1, generatedAt, models };

  const groups = new Map();
  for (const model of models) {
    const group = groups.get(model.slug) ?? [];
    group.push(model);
    groups.set(model.slug, group);
  }
  const comparisons = {
    schemaVersion: 1,
    generatedAt,
    models: [...groups.entries()]
      .filter(([, variants]) => variants.length > 1)
      .map(([slug, variants]) => comparisonFor(slug, variants))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
  };

  const expectedCatalog = `${JSON.stringify(catalog, null, 2)}\n`;
  const expectedComparisons = `${JSON.stringify(comparisons, null, 2)}\n`;
  if (check) {
    const actualCatalog = await fs.readFile(catalogPath, "utf8").catch(() => null);
    const actualComparisons = await fs.readFile(comparisonsPath, "utf8").catch(() => null);
    assert(actualCatalog === expectedCatalog, `${catalogPath} is stale; run npm run build:data.`);
    assert(actualComparisons === expectedComparisons, `${comparisonsPath} is stale; run npm run build:data.`);
  } else {
    await writeJsonAtomic(catalogPath, catalog);
    await writeJsonAtomic(comparisonsPath, comparisons);
  }
  return { modelCount: models.length, comparisonCount: comparisons.models.length };
}
