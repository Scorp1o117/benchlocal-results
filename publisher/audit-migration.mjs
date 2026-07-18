#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildModelSnapshot, normalizeSuite, round1, snapshotFileName, writeJsonAtomic } from "./lib.mjs";

const cwd = process.cwd();
const archiveRoot = path.resolve(cwd, "../by-model");
const indexPath = path.resolve(cwd, "index.html");
const reportPath = path.resolve(cwd, "publisher/data/migration-audit.json");

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
    maxScore: scores[0],
    effectiveScore: scores[1],
    retryPenalty: round1(scores[0] - scores[1]),
    toolcall: suites[0],
    bugfind: suites[1],
    hermes: suites[2],
    outcomes,
  };
  });
}

function fingerprint(value) {
  return [value.maxScore, value.effectiveScore, value.retryPenalty, value.toolcall, value.bugfind, value.hermes]
    .map((item) => round1(Number(item)))
    .join("|");
}

async function archiveGroups() {
  const modelDirectories = (await fs.readdir(archiveRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const groups = [];
  for (const modelDirectory of modelDirectories) {
    const modelPath = path.join(archiveRoot, modelDirectory.name);
    const children = await fs.readdir(modelPath, { withFileTypes: true });
    const rootFiles = children.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(modelPath, entry.name));
    if (rootFiles.length > 0) groups.push({ archiveModel: modelDirectory.name, archiveVariant: null, files: rootFiles });
    for (const child of children.filter((entry) => entry.isDirectory())) {
      const childPath = path.join(modelPath, child.name);
      const files = (await fs.readdir(childPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => path.join(childPath, entry.name));
      if (files.length > 0) groups.push({ archiveModel: modelDirectory.name, archiveVariant: child.name, files });
    }
  }
  return groups;
}

async function snapshotFromGroup(group) {
  const candidates = { toolcall: [], bugfind: [], hermes: [] };
  for (const file of group.files) {
    const raw = await fs.readFile(file);
    const data = JSON.parse(raw.toString("utf8"));
    const key = data.benchPackId === "toolcall-15" ? "toolcall" : data.benchPackId === "bugfind-15" ? "bugfind" : data.benchPackId === "hermesagent-20" ? "hermes" : null;
    if (!key || data.cancelled !== false) continue;
    try {
      candidates[key].push(normalizeSuite({ data, raw, sourcePath: file, expectedPackId: data.benchPackId }));
    } catch {
      // Keep auditing other completed candidates; the final missing-suite error remains actionable.
    }
  }
  const suites = Object.fromEntries(Object.entries(candidates).flatMap(([key, values]) => {
    if (values.length === 0) return [];
    values.sort((left, right) => Date.parse(right.completedAt ?? right.startedAt) - Date.parse(left.completedAt ?? left.startedAt));
    return [[key, values[0]]];
  }));
  return buildModelSnapshot({ suites, variant: group.archiveVariant ?? "unclassified" });
}

async function main() {
  const homepage = homepageEntries(await fs.readFile(indexPath, "utf8"));
  const homepageByFingerprint = new Map();
  for (const entry of homepage) {
    const key = fingerprint(entry);
    const group = homepageByFingerprint.get(key) ?? [];
    group.push(entry);
    homepageByFingerprint.set(key, group);
  }
  const archives = [];
  const migrationCandidates = [];
  for (const group of await archiveGroups()) {
    try {
      const snapshot = await snapshotFromGroup(group);
      const summary = {
        archiveModel: group.archiveModel,
        archiveVariant: group.archiveVariant,
        modelId: snapshot.model.id,
        modelLabel: snapshot.model.label,
        maxScore: snapshot.scoring.maxScore,
        effectiveScore: snapshot.scoring.effectiveScore,
        retryPenalty: snapshot.scoring.retryPenalty,
        toolcall: snapshot.suites.toolcall.totalScore,
        bugfind: snapshot.suites.bugfind.totalScore,
        hermes: snapshot.suites.hermes.totalScore,
      };
      const matches = homepageByFingerprint.get(fingerprint(summary)) ?? [];
      const status = matches.length === 1 ? "unique" : matches.length === 0 ? "unmatched" : "ambiguous";
      archives.push({ ...summary, matches: matches.map(({ index, name, link }) => ({ index, name, link })), status });
      if (status === "unique") migrationCandidates.push({ snapshot, match: matches[0] });
    } catch (error) {
      archives.push({ archiveModel: group.archiveModel, archiveVariant: group.archiveVariant, status: "invalid", error: error.message });
    }
  }
  const matchedHomepageIndexes = new Set(archives.filter((item) => item.status === "unique").map((item) => item.matches[0].index));
  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      homepage: homepage.length,
      archiveGroups: archives.length,
      unique: archives.filter((item) => item.status === "unique").length,
      ambiguous: archives.filter((item) => item.status === "ambiguous").length,
      unmatchedArchives: archives.filter((item) => item.status === "unmatched").length,
      invalidArchives: archives.filter((item) => item.status === "invalid").length,
      unmatchedHomepage: homepage.filter((item) => !matchedHomepageIndexes.has(item.index)).length,
    },
    archives,
    unmatchedHomepage: homepage.filter((item) => !matchedHomepageIndexes.has(item.index)),
  };
  await writeJsonAtomic(reportPath, report);
  let migrated = 0;
  if (process.argv.includes("--migrate-unique")) {
    const outputDirectory = path.resolve(cwd, "publisher/data/models");
    for (const { snapshot, match } of migrationCandidates) {
      const slug = path.basename(match.link.split("#", 1)[0], ".html").replace(/-thinking$/, "");
      const variant = match.name.includes("无思考") ? "no-thinking" : match.name.includes("思考") ? "thinking" : "default";
      snapshot.model.slug = slug;
      snapshot.model.variant = variant;
      snapshot.editorial.metadata = { pageMode: "legacy", legacyPage: match.link, homepageName: match.name };
      const outputPath = path.join(outputDirectory, snapshotFileName(snapshot.model));
      try {
        await fs.access(outputPath);
      } catch {
        await writeJsonAtomic(outputPath, snapshot);
        migrated += 1;
      }
    }
  }
  console.log(`Migration audit updated: ${report.counts.unique}/${report.counts.archiveGroups} archive groups uniquely matched; ${migrated} snapshots migrated.`);
}

main().catch((error) => {
  console.error(`migration audit failed: ${error.message}`);
  process.exitCode = 1;
});
