import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const datasetDir = join(here, "datasets", "sda-v1");
const casesPath = join(datasetDir, "cases.jsonl");
const manifestPath = join(datasetDir, "manifest.json");
const schemaPath = join(datasetDir, "schema.json");

const allowedStages = new Set(["requirements", "hld", "lld", "dsa", "learning"]);
const allowedSplits = new Set(["dev", "validation", "holdout"]);
const allowedPriorities = new Set(["must", "should", "could"]);
const requiredKeys = [
  "id",
  "dataset_version",
  "split",
  "stages",
  "domain",
  "complexity",
  "idea",
  "confirmed_requirements",
  "must_have_behaviors",
  "acceptable_alternatives",
  "anti_patterns",
  "component_expectations",
  "review",
  "tags",
];

const errors = [];
function fail(message) {
  errors.push(message);
}

const raw = readFileSync(casesPath, "utf8");
const hash = createHash("sha256").update(Buffer.from(raw)).digest("hex");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
JSON.parse(readFileSync(schemaPath, "utf8")); // schema must be valid JSON

const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
if (lines.length === 0) fail("cases.jsonl is empty");

const cases = [];
const seenIds = new Set();
const counts = { dev: 0, validation: 0, holdout: 0 };

for (const [index, line] of lines.entries()) {
  const label = `line ${index + 1}`;
  let item;
  try {
    item = JSON.parse(line);
  } catch (error) {
    fail(`${label}: invalid JSON (${error.message})`);
    continue;
  }

  for (const key of requiredKeys) {
    if (!(key in item)) fail(`${label}: missing ${key}`);
  }

  if (typeof item.id !== "string" || !/^TC-[A-Z0-9-]+-[0-9]{3}$/.test(item.id)) {
    fail(`${label}: invalid id`);
  } else if (seenIds.has(item.id)) {
    fail(`${label}: duplicate id ${item.id}`);
  } else {
    seenIds.add(item.id);
  }

  if (item.dataset_version !== manifest.dataset_version) {
    fail(`${label}: dataset_version does not match manifest`);
  }
  if (!allowedSplits.has(item.split)) fail(`${label}: invalid split`);
  else counts[item.split] += 1;

  if (!Array.isArray(item.stages) || item.stages.length === 0) {
    fail(`${label}: stages must be non-empty`);
  } else {
    for (const stage of item.stages) {
      if (!allowedStages.has(stage)) fail(`${label}: invalid stage ${stage}`);
    }
  }

  if (typeof item.idea !== "string" || item.idea.trim().length < 20) {
    fail(`${label}: idea is too short`);
  }
  if (!Array.isArray(item.tags) || item.tags.length === 0) {
    fail(`${label}: tags must be non-empty`);
  }

  const req = item.confirmed_requirements;
  if (req === null || typeof req !== "object") {
    fail(`${label}: confirmed_requirements must be an object`);
  } else {
    for (const key of ["functional", "nonFunctional", "assumptions", "clarifications"]) {
      if (!Array.isArray(req[key])) fail(`${label}: confirmed_requirements.${key} must be an array`);
    }
    if (Array.isArray(req.functional)) {
      if (req.functional.length === 0) fail(`${label}: at least one functional requirement is required`);
      const frIds = new Set();
      for (const fr of req.functional) {
        if (!fr || typeof fr !== "object") {
          fail(`${label}: invalid functional requirement`);
          continue;
        }
        if (typeof fr.id !== "string" || fr.id.trim() === "") fail(`${label}: FR id missing`);
        else if (frIds.has(fr.id)) fail(`${label}: duplicate FR id ${fr.id}`);
        else frIds.add(fr.id);
        if (typeof fr.text !== "string" || fr.text.trim() === "") fail(`${label}: FR text missing`);
        if (!allowedPriorities.has(fr.priority)) fail(`${label}: invalid FR priority`);
      }
    }
    if (Array.isArray(req.nonFunctional)) {
      const nfrIds = new Set();
      for (const nfr of req.nonFunctional) {
        if (!nfr || typeof nfr !== "object") {
          fail(`${label}: invalid non-functional requirement`);
          continue;
        }
        if (typeof nfr.id !== "string" || nfr.id.trim() === "") fail(`${label}: NFR id missing`);
        else if (nfrIds.has(nfr.id)) fail(`${label}: duplicate NFR id ${nfr.id}`);
        else nfrIds.add(nfr.id);
        if (typeof nfr.text !== "string" || nfr.text.trim() === "") fail(`${label}: NFR text missing`);
        if (!allowedPriorities.has(nfr.priority)) fail(`${label}: invalid NFR priority`);
        if (typeof nfr.category !== "string") fail(`${label}: NFR category missing`);
        if (typeof nfr.target !== "string") fail(`${label}: NFR target missing`);
      }
    }
  }

  for (const key of ["must_have_behaviors", "acceptable_alternatives", "anti_patterns"]) {
    if (!Array.isArray(item[key])) fail(`${label}: ${key} must be an array`);
  }
  if (!Array.isArray(item.must_have_behaviors) || item.must_have_behaviors.length === 0) {
    fail(`${label}: must_have_behaviors must be non-empty`);
  }

  const expectations = item.component_expectations;
  if (expectations === null || typeof expectations !== "object") {
    fail(`${label}: component_expectations must be an object`);
  } else {
    for (const key of ["hld", "lld", "dsa", "learning"]) {
      if (!Array.isArray(expectations[key])) fail(`${label}: component_expectations.${key} must be an array`);
    }
  }

  if (item.review === null || typeof item.review !== "object") {
    fail(`${label}: review must be an object`);
  } else if (!["draft", "reviewed", "retired"].includes(item.review.status)) {
    fail(`${label}: invalid review status`);
  }

  cases.push(item);
}

if (manifest.case_count !== cases.length) {
  fail(`manifest case_count=${manifest.case_count} but found ${cases.length}`);
}
for (const split of ["dev", "validation", "holdout"]) {
  if (manifest.splits?.[split] !== counts[split]) {
    fail(`manifest ${split} count=${manifest.splits?.[split]} but found ${counts[split]}`);
  }
}
if (manifest.case_file_sha256 !== hash) {
  fail(`manifest case_file_sha256 does not match ${hash}`);
}

if (errors.length > 0) {
  console.error(`Dataset validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      dataset_version: manifest.dataset_version,
      cases: cases.length,
      splits: counts,
      sha256: hash,
      review_status: Object.fromEntries(
        [...new Set(cases.map((item) => item.review.status))].map((status) => [
          status,
          cases.filter((item) => item.review.status === status).length,
        ]),
      ),
    },
    null,
    2,
  ),
);
