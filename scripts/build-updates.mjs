#!/usr/bin/env node
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCES,
  MAX_REGEX_RULES,
  fetchList,
  convertList,
  applyRegexCap,
  parseCosmetics,
  combineCosmetics,
  cosmeticsStats,
  fingerprint,
  ruleKey
} from './filter-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES_DIR = path.join(ROOT, 'rules');
const UPDATES_DIR = path.join(ROOT, 'updates');
const LIST_EXTRA_MAX = 25000;

async function loadPackagedKeys() {
  try {
    return new Set(JSON.parse(await readFile(path.join(RULES_DIR, 'packaged-keys.json'), 'utf8')));
  } catch {
    const keys = new Set();
    const files = (await readdir(RULES_DIR)).filter((name) => name.endsWith('.json') && name !== 'packaged-revision.json' && name !== 'packaged-keys.json');
    for (const file of files) {
      const rules = JSON.parse(await readFile(path.join(RULES_DIR, file), 'utf8'));
      for (const rule of rules) {
        keys.add(ruleKey(rule));
      }
    }
    return keys;
  }
}

async function main() {
  await mkdir(UPDATES_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
  const packagedKeys = await loadPackagedKeys();
  let remainingRegexBudget = MAX_REGEX_RULES;
  const extra = [];
  const cosmeticParts = [];
  const sourceMeta = [];

  for (const source of SOURCES) {
    console.log(`下载 ${source.group}: ${source.url}`);
    const text = await fetchList(source.url);
    cosmeticParts.push(parseCosmetics(text));
    const rules = applyRegexCap(await convertList(text, source.group), remainingRegexBudget);
    remainingRegexBudget = Math.max(
      0,
      remainingRegexBudget - rules.filter((rule) => rule.condition?.regexFilter).length
    );
    sourceMeta.push({
      group: source.group,
      fingerprint: fingerprint(text),
      networkRules: rules.length
    });
    for (const rule of rules) {
      if (rule.condition?.regexFilter) continue;
      if (!packagedKeys.has(ruleKey(rule))) extra.push(rule);
    }
  }

  const truncated = extra.length > LIST_EXTRA_MAX;
  const dnrExtra = extra.slice(0, LIST_EXTRA_MAX).map((rule) => {
    const copy = { ...rule, condition: { ...rule.condition } };
    delete copy.id;
    return copy;
  });
  const cosmetics = combineCosmetics(cosmeticParts);

  const meta = {
    generatedAt: new Date().toISOString(),
    baselineVersion: manifest.version,
    extraRuleCount: dnrExtra.length,
    extraRuleTotal: extra.length,
    truncated,
    sources: sourceMeta,
    cosmetics: cosmeticsStats(cosmetics)
  };

  await writeFile(path.join(UPDATES_DIR, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  await writeFile(path.join(UPDATES_DIR, 'dnr-extra.json'), JSON.stringify(dnrExtra));
  await writeFile(path.join(UPDATES_DIR, 'cosmetics.json'), JSON.stringify(cosmetics));
  console.log(`增量 DNR ${dnrExtra.length}/${extra.length}${truncated ? '（已截断）' : ''}`);
  console.log(`化妆表 ${JSON.stringify(cosmeticsStats(cosmetics))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
