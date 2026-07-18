#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { buildCatalog } from "./catalog-lib.mjs";
import { parseArgs } from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const result = await buildCatalog({
    snapshotDirectory: path.resolve(cwd, typeof args.snapshots === "string" ? args.snapshots : "publisher/data/models"),
    catalogPath: path.resolve(cwd, typeof args.catalog === "string" ? args.catalog : "data/catalog.json"),
    comparisonsPath: path.resolve(cwd, typeof args.comparisons === "string" ? args.comparisons : "data/comparisons.json"),
    check: Boolean(args.check),
  });
  console.log(
    `${args.check ? "Generated data is current" : "Generated data updated"}: ${result.modelCount} variants, ${result.comparisonCount} comparisons.`,
  );
}

main().catch((error) => {
  console.error(`catalog build failed: ${error.message}`);
  process.exitCode = 1;
});
