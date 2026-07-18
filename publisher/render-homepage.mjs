#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assert, parseArgs, readJson } from "./lib.mjs";

const START_MARKER = "<!-- Generated model cards: publisher/render-homepage.mjs -->";
const END_MARKER = "<!-- End generated model cards -->";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function number(value) {
  return String(Number(Number(value).toFixed(1)));
}

function modeLabel(variant) {
  if (variant === "thinking") return { zh: "思考", en: "Thinking", icon: "🧠" };
  if (variant === "no-thinking") return { zh: "无思考", en: "No Thinking", icon: "⚡" };
  return { zh: "默认", en: "Default", icon: "●" };
}

function logo(model) {
  return model.logoUrl
    ? `<span class="model-logo"><img src="${escapeHtml(model.logoUrl)}" alt=""></span>`
    : `<span class="model-logo placeholder" data-logo-slot="true">LOGO</span>`;
}

function modeRow(snapshot) {
  const label = modeLabel(snapshot.model.variant);
  const score = snapshot.scoring;
  return `<div class="mode-readout ${escapeHtml(snapshot.model.variant)}">
    <div class="mode-readout-head"><span class="mode-dot"></span><span data-lang="zh">${label.zh}</span><span data-lang="en">${label.en}</span></div>
    <div class="mode-readout-scores"><strong>${number(score.maxScore)}</strong><span><span data-lang="zh">实用</span><span data-lang="en">Eff.</span> ${number(score.effectiveScore)}</span></div>
    <div class="mode-score-track" aria-hidden="true"><i class="mode-score-max" style="width:${number(score.maxScore)}%"></i><i class="mode-score-effective" style="width:${number(score.effectiveScore)}%"></i></div>
    <div class="mode-readout-suites"><span>TC ${number(snapshot.suites.toolcall.totalScore)}</span><span>BF ${number(snapshot.suites.bugfind.totalScore)}</span><span>HA ${number(snapshot.suites.hermes.totalScore)}</span></div>
  </div>`;
}

function renderCard(model, variants, rank) {
  const sorted = variants.slice().sort((a, b) => (a.model.variant === "thinking" ? -1 : b.model.variant === "thinking" ? 1 : a.model.variant.localeCompare(b.model.variant)));
  const best = (selector) => Math.max(...sorted.map(selector));
  const metrics = {
    total: best((item) => item.scoring.maxScore),
    adjusted: best((item) => item.scoring.effectiveScore),
    tc: best((item) => item.suites.toolcall.totalScore),
    bf: best((item) => item.suites.bugfind.totalScore),
    ha: best((item) => item.suites.hermes.totalScore),
  };
  const modes = sorted.map((item) => item.model.variant).join(",");
  const modeMetrics = sorted.map((item) => {
    const prefix = escapeHtml(item.model.variant);
    return `data-${prefix}-total="${number(item.scoring.maxScore)}" data-${prefix}-adjusted="${number(item.scoring.effectiveScore)}" data-${prefix}-tc="${number(item.suites.toolcall.totalScore)}" data-${prefix}-bf="${number(item.suites.bugfind.totalScore)}" data-${prefix}-ha="${number(item.suites.hermes.totalScore)}"`;
  }).join(" ");
  const dual = sorted.length > 1;
  return `<a class="model-card ${dual ? "dual-mode" : "single-mode"}" href="models/${escapeHtml(model.slug)}.html" aria-label="${escapeHtml(model.displayName)} model details" data-model-name="${escapeHtml(model.displayName)}" data-modes="${escapeHtml(modes)}" data-total="${number(metrics.total)}" data-adjusted="${number(metrics.adjusted)}" data-tc="${number(metrics.tc)}" data-bf="${number(metrics.bf)}" data-ha="${number(metrics.ha)}" ${modeMetrics}>
    <div class="model-rank"><span>#</span><strong>${String(rank).padStart(2, "0")}</strong></div>
    <div class="model-identity">${logo(model)}<div><h3>${escapeHtml(model.displayName)}</h3><p>${escapeHtml(model.modelFile)}</p></div></div>
    <div class="model-modes">${sorted.map(modeRow).join("")}</div>
    <div class="model-primary-score"><span><span data-lang="zh">能力上限</span><span data-lang="en">Max score</span></span><strong>${number(metrics.total)}</strong><small><span data-lang="zh">实用</span><span data-lang="en">Effective</span> ${number(metrics.adjusted)}</small></div>
    <span class="model-arrow" aria-hidden="true">→</span>
  </a>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const indexPath = path.resolve(cwd, "index.html");
  const manifest = (await readJson(path.resolve(cwd, "publisher/data/homepage-display.json"))).data;
  const snapshots = [];
  for (const file of (await fs.readdir(path.resolve(cwd, "publisher/data/models"))).filter((name) => name.endsWith(".json"))) snapshots.push((await readJson(path.resolve(cwd, "publisher/data/models", file))).data);
  const bySlug = new Map();
  for (const snapshot of snapshots) {
    const group = bySlug.get(snapshot.model.slug) ?? [];
    group.push(snapshot);
    bySlug.set(snapshot.model.slug, group);
  }
  const models = manifest.models.map((model) => {
    const variants = bySlug.get(model.slug) ?? [];
    const metadata = variants.map((item) => item.editorial?.metadata).find((item) => item?.logoPath || item?.logoUrl);
    return { model: { ...model, logoUrl: metadata?.logoPath ?? metadata?.logoUrl ?? model.logoUrl ?? null }, variants };
  });
  assert(models.every((item) => item.variants.length > 0), "Homepage manifest references a model without snapshots.");
  models.sort((left, right) => Math.max(...right.variants.map((item) => item.scoring.maxScore)) - Math.max(...left.variants.map((item) => item.scoring.maxScore)));

  const original = await fs.readFile(indexPath, "utf8");
  const markerStart = original.indexOf(START_MARKER);
  const markerEnd = original.indexOf(END_MARKER);
  assert(markerStart >= 0 && markerEnd > markerStart, "Cannot locate homepage model markers.");
  const cards = models.map((item, index) => renderCard(item.model, item.variants, index + 1)).join("\n");
  let expected = `${original.slice(0, markerStart)}${START_MARKER}\n${cards}\n    ${original.slice(markerEnd)}`;
  expected = expected.replace(/<strong data-model-count>\d+<\/strong>/, `<strong data-model-count>${models.length}</strong>`);
  expected = expected.replace(/<strong data-config-count>\d+<\/strong>/, `<strong data-config-count>${snapshots.length}</strong>`);

  if (args.check) assert(original === expected, "index.html merged model cards are stale; run npm run build:homepage.");
  else if (original !== expected) await fs.writeFile(indexPath, expected, "utf8");
  console.log(`${args.check ? "Homepage merged cards are current" : "Homepage merged cards updated"}: ${models.length} models, ${snapshots.length} configurations.`);
}

main().catch((error) => {
  console.error(`homepage render failed: ${error.message}`);
  process.exitCode = 1;
});
