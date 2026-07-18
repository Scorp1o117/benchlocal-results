#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assert, parseArgs, readJson } from "./lib.mjs";

function score(value) {
  return Number(value).toFixed(1);
}

function suiteScore(value) {
  return String(Number(Number(value).toFixed(1)));
}

function replaceRequired(text, pattern, replacement, label) {
  assert(pattern.test(text), `Homepage card is missing ${label}.`);
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

function updateSuite(card, label, value) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const widthPattern = new RegExp(`(<span class="bar-label">${escaped}</span>[\\s\\S]*?<div class="bar-fill" style="width:)[^;%]+`);
  const valuePattern = new RegExp(`(<span class="bar-label">${escaped}</span>[\\s\\S]*?<span class="bar-val"[^>]*>)[^<]+`);
  let updated = replaceRequired(card, widthPattern, `$1${Math.max(0, Math.min(100, Number(value)))}`, `${label} bar width`);
  updated = replaceRequired(updated, valuePattern, `$1${suiteScore(value)}`, `${label} value`);
  return updated;
}

function updateCard(card, snapshot) {
  const scoring = snapshot.scoring;
  const counts = scoring.counts;
  let updated = replaceRequired(card, /data-outcomes="[^"]+"/, `data-outcomes="${counts.pass},${counts.partial},${counts.fail}"`, "data-outcomes");
  updated = replaceRequired(updated, /(card-score-box primary[\s\S]*?<div class="val">)[^<]+/, `$1${score(scoring.maxScore)}`, "max score");
  updated = replaceRequired(updated, /(card-score-box secondary[\s\S]*?<div class="val">)[^<]+/, `$1${score(scoring.effectiveScore)}`, "effective score");
  updated = updateSuite(updated, "ToolCall-15", snapshot.suites.toolcall.totalScore);
  updated = updateSuite(updated, "BugFind-15", snapshot.suites.bugfind.totalScore);
  updated = updateSuite(updated, "HermesAgent-20", snapshot.suites.hermes.totalScore);
  const retry = `<div class="card-retry"><span data-lang="zh">🔄 上限分 ${score(scoring.maxScore)} → 重试 -${scoring.retryPenalty} → 实用 <strong>${score(scoring.effectiveScore)}</strong></span><span data-lang="en">🔄 Max ${score(scoring.maxScore)} → retries -${scoring.retryPenalty} → Eff. <strong>${score(scoring.effectiveScore)}</strong></span></div>`;
  return replaceRequired(updated, /<div class="card-retry">[\s\S]*?<\/div>/, retry, "retry summary");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const indexPath = path.resolve(cwd, "index.html");
  const snapshotDirectory = path.resolve(cwd, "publisher/data/models");
  const snapshots = new Map();
  for (const file of (await fs.readdir(snapshotDirectory)).filter((name) => name.endsWith(".json"))) {
    const snapshot = (await readJson(path.join(snapshotDirectory, file))).data;
    const homepageName = snapshot.editorial?.metadata?.homepageName;
    if (!homepageName) continue;
    assert(!snapshots.has(homepageName), `Duplicate homepage snapshot for ${homepageName}.`);
    snapshots.set(homepageName, snapshot);
  }

  const original = await fs.readFile(indexPath, "utf8");
  const cards = [...original.matchAll(/<div class="[^"]*\bmodel-card\b[^"]*"[^>]*>/gi)];
  let cursor = 0;
  let expected = "";
  let updatedCount = 0;
  for (let index = 0; index < cards.length; index += 1) {
    const start = cards[index].index;
    const end = cards[index + 1]?.index ?? original.indexOf("</section>", start);
    expected += original.slice(cursor, start);
    const card = original.slice(start, end);
    const homepageName = cards[index][0].match(/data-model-name="([^"]+)"/)?.[1];
    const snapshot = snapshots.get(homepageName);
    expected += snapshot ? updateCard(card, snapshot) : card;
    if (snapshot) updatedCount += 1;
    cursor = end;
  }
  expected += original.slice(cursor);

  if (args.check) {
    assert(original === expected, "index.html snapshot-backed cards are stale; run npm run sync:homepage.");
  } else if (original !== expected) {
    await fs.writeFile(indexPath, expected, "utf8");
  }
  console.log(`${args.check ? "Homepage cards are current" : "Homepage cards synchronized"}: ${updatedCount} snapshot-backed cards.`);
}

main().catch((error) => {
  console.error(`homepage sync failed: ${error.message}`);
  process.exitCode = 1;
});
