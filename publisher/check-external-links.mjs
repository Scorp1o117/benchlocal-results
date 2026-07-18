#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const timeoutMs = 15000;
const concurrency = 6;

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(fullPath);
  }
  return files;
}

async function collectUrls() {
  const urls = new Set();
  for (const file of await htmlFiles(root)) {
    const html = await fs.readFile(file, "utf8");
    for (const match of html.matchAll(/\bhref=["'](https?:\/\/[^"']+)["']/gi)) urls.add(match[1].replaceAll("&amp;", "&"));
  }
  return [...urls].sort();
}

async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "BenchLocal-Results-Link-Audit/1.0", ...(method === "GET" ? { range: "bytes=0-0" } : {}) },
  });
  if (response.body) await response.body.cancel();
  return response;
}

async function probe(url) {
  try {
    let response = await request(url, "HEAD");
    if ([403, 405, 501].includes(response.status)) response = await request(url, "GET");
    return { url, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { url, status: 0, error: error.message };
  }
}

async function main() {
  const urls = await collectUrls();
  const results = new Array(urls.length);
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      results[index] = await probe(urls[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));

  const failures = results.filter((item) => item.status === 404 || item.status === 410);
  const restricted = results.filter((item) => [401, 403, 429].includes(item.status));
  const unverified = results.filter((item) => item.status === 0 || item.status >= 500);
  if (process.env.BENCHLOCAL_LINK_REPORT) {
    const reportPath = path.resolve(root, process.env.BENCHLOCAL_LINK_REPORT);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
  }
  for (const item of results) console.log(`${item.status || "ERR"} ${item.url}${item.error ? ` (${item.error})` : ""}`);
  for (const item of restricted) console.warn(`warning: reachable but restricted/rate-limited: ${item.status} ${item.url}`);
  for (const item of unverified) console.warn(`warning: could not verify automatically: ${item.status || "ERR"} ${item.url}`);
  if (failures.length) throw new Error(`${failures.length} external link(s) failed.`);
  console.log(`External link audit passed: ${results.length} checked, ${restricted.length} restricted/rate-limited, ${unverified.length} unverified.`);
}

main().catch((error) => {
  console.error(`external link audit failed: ${error.message}`);
  process.exitCode = 1;
});
