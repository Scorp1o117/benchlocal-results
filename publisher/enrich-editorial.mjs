#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs, readJson, writeJsonAtomic } from "./lib.mjs";

const LOGOS = [
  [/^dsv4-|deepseek/i, "icons/deepseek-color.png"],
  [/^ternary-bonsai/i, "icons/bonsai-logo.svg"],
  [/^gemma/i, "icons/gemma-color.png"],
  [/^n2mini$|^nex-/i, "icons/nex.svg"],
  [/^ornith/i, "icons/ornith-color.png"],
  [/^step/i, "icons/stepfun-color.png"],
  [/^(?:qwen|agents-a1)/i, "icons/qwen-color.png"],
];

const SUITES = [
  { key: "toolcall", name: "ToolCall" },
  { key: "bugfind", name: "BugFind" },
  { key: "hermes", name: "HermesAgent" },
];

function number(value) {
  return String(Number(Number(value).toFixed(1)));
}

function modeName(variant) {
  if (variant === "thinking") return { zh: "思考", en: "thinking" };
  if (variant === "no-thinking") return { zh: "无思考", en: "no-thinking" };
  return { zh: "默认", en: "default" };
}

function logoFor(snapshot) {
  const identity = `${snapshot.model.slug} ${snapshot.editorial?.metadata?.displayName ?? ""}`;
  return LOGOS.find(([pattern]) => pattern.test(identity))?.[1] ?? snapshot.editorial?.metadata?.logoUrl ?? null;
}

function suiteRange(snapshot) {
  const scored = SUITES.map((suite) => ({ ...suite, score: snapshot.suites[suite.key].totalScore })).sort((a, b) => b.score - a.score);
  return { strongest: scored[0], weakest: scored[scored.length - 1] };
}

function stabilityText(retries) {
  if (retries <= 2) return { zh: "达到最终成绩所需重试很少，稳定性较好", en: "it reaches the final score with very few retries and good stability" };
  if (retries <= 7) return { zh: "需要少量重试才能达到最终成绩，稳定性尚可", en: "it needs a small number of retries to reach the final score and remains reasonably stable" };
  if (retries <= 15) return { zh: "最终成绩依赖多次重试，实际使用时应关注稳定性", en: "the final score depends on repeated attempts, so practical stability deserves attention" };
  return { zh: "重试成本较高，能力上限与一次运行体验之间存在明显差距", en: "retry cost is high, leaving a clear gap between capability ceiling and one-pass experience" };
}

function comparisonText(snapshot, peer) {
  if (!peer) return null;
  const maxDelta = Number((snapshot.scoring.maxScore - peer.scoring.maxScore).toFixed(1));
  const effectiveDelta = Number((snapshot.scoring.effectiveScore - peer.scoring.effectiveScore).toFixed(1));
  const retryDelta = snapshot.scoring.retryPenalty - peer.scoring.retryPenalty;
  const peerMode = modeName(peer.model.variant);
  const maxDirection = maxDelta > 0 ? "高" : maxDelta < 0 ? "低" : "相同";
  const effectiveDirection = effectiveDelta > 0 ? "高" : effectiveDelta < 0 ? "低" : "相同";
  const maxDirectionEn = maxDelta > 0 ? "higher" : maxDelta < 0 ? "lower" : "equal";
  const effectiveDirectionEn = effectiveDelta > 0 ? "higher" : effectiveDelta < 0 ? "lower" : "equal";
  return {
    zh: `相较${peerMode.zh}版，能力上限${maxDirection} ${number(Math.abs(maxDelta))} 分，实用得分${effectiveDirection} ${number(Math.abs(effectiveDelta))} 分，重试数${retryDelta > 0 ? `多 ${retryDelta}` : retryDelta < 0 ? `少 ${Math.abs(retryDelta)}` : "相同"}。`,
    en: `Compared with the ${peerMode.en} variant, its max score is ${number(Math.abs(maxDelta))} points ${maxDirectionEn}, its effective score is ${number(Math.abs(effectiveDelta))} points ${effectiveDirectionEn}, and it uses ${retryDelta > 0 ? `${retryDelta} more retries` : retryDelta < 0 ? `${Math.abs(retryDelta)} fewer retries` : "the same number of retries"}.`,
  };
}

function generatedEditorial(snapshot, peer) {
  const metadata = snapshot.editorial?.metadata ?? {};
  const displayName = metadata.displayName ?? snapshot.model.label;
  const mode = modeName(snapshot.model.variant);
  const scoring = snapshot.scoring;
  const { strongest, weakest } = suiteRange(snapshot);
  const stability = stabilityText(scoring.retryPenalty);
  const comparison = comparisonText(snapshot, peer);
  const suiteSentenceZh = strongest.key === weakest.key
    ? `${strongest.name} 得分为 ${number(strongest.score)}。`
    : `优势项为 ${strongest.name}（${number(strongest.score)}），${weakest.name}（${number(weakest.score)}）是主要提升空间。`;
  const suiteSentenceEn = strongest.key === weakest.key
    ? `${strongest.name} scores ${number(strongest.score)}.`
    : `Its strongest suite is ${strongest.name} (${number(strongest.score)}), while ${weakest.name} (${number(weakest.score)}) offers the clearest room for improvement.`;
  return {
    summary: {
      zh: `${displayName} 在${mode.zh}模式下的能力上限为 ${number(scoring.maxScore)}，实用得分为 ${number(scoring.effectiveScore)}。ToolCall、BugFind、HermesAgent 分别为 ${number(snapshot.suites.toolcall.totalScore)}、${number(snapshot.suites.bugfind.totalScore)}、${number(snapshot.suites.hermes.totalScore)}；50 题中最终通过 ${scoring.counts.pass} 题，成功题累计重试 ${scoring.retryPenalty} 次。`,
      en: `${displayName} reaches a ${number(scoring.maxScore)} max score and a ${number(scoring.effectiveScore)} effective score in ${mode.en} mode. ToolCall, BugFind, and HermesAgent score ${number(snapshot.suites.toolcall.totalScore)}, ${number(snapshot.suites.bugfind.totalScore)}, and ${number(snapshot.suites.hermes.totalScore)}; it ultimately passes ${scoring.counts.pass} of 50 scenarios with ${scoring.retryPenalty} successful-case retries.`,
    },
    verdict: {
      zh: `${comparison?.zh ?? ""}${suiteSentenceZh}${stability.zh}。`,
      en: `${comparison?.en ? `${comparison.en} ` : ""}${suiteSentenceEn} Overall, ${stability.en}.`,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const force = Boolean(args.force);
  const directory = path.resolve(process.cwd(), typeof args.snapshots === "string" ? args.snapshots : "publisher/data/models");
  const sourceManifest = (await readJson(path.resolve(process.cwd(), "publisher/data/model-sources.json"))).data;
  const entries = [];
  for (const file of (await fs.readdir(directory)).filter((name) => name.endsWith(".json")).sort()) {
    const filePath = path.join(directory, file);
    entries.push({ filePath, snapshot: (await readJson(filePath)).data });
  }
  const bySlug = new Map();
  for (const entry of entries) {
    const group = bySlug.get(entry.snapshot.model.slug) ?? [];
    group.push(entry.snapshot);
    bySlug.set(entry.snapshot.model.slug, group);
  }

  let generated = 0;
  for (const { filePath, snapshot } of entries) {
    snapshot.editorial ??= {};
    snapshot.editorial.metadata ??= {};
    snapshot.editorial.metadata.logoUrl = logoFor(snapshot);
    const sources = sourceManifest.models[snapshot.model.slug];
    if (sources) {
      snapshot.editorial.metadata.artifactKind = sources.artifactKind;
      snapshot.editorial.metadata.artifactUrl = sources.artifactUrl;
      snapshot.editorial.metadata.upstreamUrl = sources.upstreamUrl;
      snapshot.editorial.metadata.publisherUrl = sources.publisherUrl;
      snapshot.editorial.metadata.sourceVerifiedAt = sourceManifest.verifiedAt;
      snapshot.editorial.metadata.hfUrl = sources.artifactUrl ?? sources.upstreamUrl;
    }
    const peer = bySlug.get(snapshot.model.slug)?.find((candidate) => candidate.model.variant !== snapshot.model.variant);
    const content = generatedEditorial(snapshot, peer);
    if (force || !snapshot.editorial.summary?.zh || !snapshot.editorial.summary?.en) {
      snapshot.editorial.summary = content.summary;
      snapshot.editorial.metadata.summarySource = "generated-from-scores";
      generated++;
    }
    if (force || !snapshot.editorial.verdict?.zh || !snapshot.editorial.verdict?.en) {
      snapshot.editorial.verdict = content.verdict;
      snapshot.editorial.metadata.verdictSource = "generated-from-scores";
    }
    await writeJsonAtomic(filePath, snapshot);
  }
  console.log(`Editorial enrichment complete: ${entries.length} variants, ${generated} summaries generated, local logos assigned where recognized.`);
}

main().catch((error) => {
  console.error(`editorial enrichment failed: ${error.message}`);
  process.exitCode = 1;
});
