#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readJson, writeJsonAtomic } from "./lib.mjs";

const cwd = process.cwd();
const snapshotDirectory = path.resolve(cwd, "publisher/data/models");
const indexPath = path.resolve(cwd, "index.html");
const manifestPath = path.resolve(cwd, "publisher/data/homepage-display.json");

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function cardSegments(html) {
  const starts = [...html.matchAll(/<(?:a|div) class="[^"]*\bmodel-card\b[^"]*"[^>]*>/gi)];
  return starts.map((match, index) => ({
    opening: match[0],
    html: html.slice(match.index, starts[index + 1]?.index ?? html.indexOf("</section>", match.index)),
    name: match[0].match(/data-model-name="([^"]+)"/)?.[1] ?? null,
  }));
}

function cardMetadata(card) {
  if (!card) return {};
  const description = stripHtml(card.html.match(/<div class="desc">([\s\S]*?)<\/div>/)?.[1]);
  const modelFile = description.split("·")[0]?.trim() || null;
  const metaBlock = card.html.match(/<div class="card-meta">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const displayTags = [...metaBlock.matchAll(/<span class="card-tag"[^>]*>([\s\S]*?)<\/span>/g)].map((match) => stripHtml(match[1])).filter(Boolean);
  return {
    modelFile,
    displayTags,
    logoUrl: card.html.match(/<h3>[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1] ?? null,
    hfUrl: card.html.match(/<a href="([^"]+)"[^>]*class="hf-link"/)?.[1] ?? null,
  };
}

async function formalName(snapshot) {
  const meta = snapshot.editorial?.metadata ?? {};
  if (meta.displayName) return meta.displayName;
  if (meta.legacyPage) {
    const pagePath = path.resolve(cwd, meta.legacyPage.split("#", 1)[0]);
    const html = await fs.readFile(pagePath, "utf8").catch(() => "");
    const heading = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    const beforeMode = heading.split("<span", 1)[0];
    const name = stripHtml(beforeMode);
    if (name) return name;
  }
  return snapshot.model.label.replace(/(?:[-_.](?:gguf|q\d.*))$/i, "");
}

async function main() {
  const indexHtml = await fs.readFile(indexPath, "utf8");
  const cards = cardSegments(indexHtml);
  const snapshots = [];
  for (const file of (await fs.readdir(snapshotDirectory)).filter((name) => name.endsWith(".json")).sort()) {
    const filePath = path.join(snapshotDirectory, file);
    const snapshot = (await readJson(filePath)).data;
    const meta = snapshot.editorial.metadata ?? {};
    const card = cards.find((item) => item.name === meta.homepageName);
    const extracted = cardMetadata(card);
    snapshot.editorial.metadata = {
      ...meta,
      displayName: await formalName(snapshot),
      modelFile: meta.modelFile ?? extracted.modelFile ?? snapshot.model.label,
      displayTags: meta.displayTags ?? extracted.displayTags ?? [],
      logoUrl: meta.logoUrl ?? extracted.logoUrl,
      hfUrl: meta.hfUrl ?? extracted.hfUrl,
      pageMode: "generated",
    };
    await writeJsonAtomic(filePath, snapshot);
    snapshots.push(snapshot);
  }

  const groups = new Map();
  for (const snapshot of snapshots) {
    const group = groups.get(snapshot.model.slug) ?? [];
    group.push(snapshot);
    groups.set(snapshot.model.slug, group);
  }
  const models = [...groups.entries()].map(([slug, variants]) => {
    const primary = variants.find((item) => item.model.variant === "thinking") ?? variants[0];
    const meta = primary.editorial.metadata;
    return {
      slug,
      displayName: meta.displayName,
      modelFile: meta.modelFile,
      displayTags: meta.displayTags ?? [],
      logoUrl: meta.logoUrl ?? null,
      hfUrl: meta.hfUrl ?? null,
      variants: variants.map((item) => item.model.variant).sort(),
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName));
  await writeJsonAtomic(manifestPath, { schemaVersion: 1, generatedAt: new Date().toISOString(), models });
  console.log(`Display metadata prepared: ${snapshots.length} variants, ${models.length} model cards.`);
}

main().catch((error) => {
  console.error(`display preparation failed: ${error.message}`);
  process.exitCode = 1;
});
