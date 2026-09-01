#!/usr/bin/env node
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCES,
  CHUNK_SIZE,
  MAX_REGEX_RULES,
  fetchList,
  convertList,
  applyRegexCap,
  chunk,
  parseCosmetics,
  combineCosmetics,
  cosmeticsStats,
  fingerprint,
  ruleKey
} from './filter-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES_DIR = path.join(ROOT, 'rules');
const COSMETICS_DIR = path.join(ROOT, 'cosmetics');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

let remainingRegexBudget = MAX_REGEX_RULES;

async function writeRuleset(fileName, rules) {
  const filePath = path.join(RULES_DIR, fileName);
  const numbered = rules.map((rule, index) => ({
    ...rule,
    id: index + 1,
    priority: rule.priority || 1
  }));
  await writeFile(filePath, JSON.stringify(numbered));
  return numbered.length;
}

async function updateManifest(resources) {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  manifest.declarative_net_request = {
    rule_resources: resources.map((item) => ({
      id: item.id,
      enabled: true,
      path: `rules/${item.fileName}`
    }))
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  await mkdir(RULES_DIR, { recursive: true });
  await mkdir(COSMETICS_DIR, { recursive: true });
  const resources = [];
  const cosmeticParts = [];
  const sourceMeta = [];
  const packagedKeys = [];
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

  for (const source of SOURCES) {
    console.log(`下载 ${source.group}: ${source.url}`);
    const text = await fetchList(source.url);
    const cosmetics = parseCosmetics(text);
    cosmeticParts.push(cosmetics);
    const stats = cosmeticsStats(cosmetics);
    console.log(`[${source.group}] 化妆规则 通用 ${stats.generic}，站点 ${stats.specificSelectors}`);

    const rules = applyRegexCap(await convertList(text, source.group), remainingRegexBudget);
    remainingRegexBudget = Math.max(
      0,
      remainingRegexBudget - rules.filter((rule) => rule.condition?.regexFilter).length
    );
    console.log(`[${source.group}] 截取正则规则后剩余 ${rules.length} 条`);
    for (const rule of rules) {
      packagedKeys.push(ruleKey(rule));
    }

    const parts = chunk(rules, CHUNK_SIZE);
    for (let i = 0; i < parts.length; i += 1) {
      const id =
        source.idPrefix === 'easylist'
          ? `easylist_${i + 1}`
          : parts.length === 1
            ? source.idPrefix
            : `${source.idPrefix}_${i + 1}`;
      const fileName = `${id}.json`;
      await writeRuleset(fileName, parts[i]);
      resources.push({ id, fileName, count: parts[i].length });
      console.log(`写入 ${fileName}（${parts[i].length} 条）`);
    }

    sourceMeta.push({
      group: source.group,
      url: source.url,
      fingerprint: fingerprint(text),
      networkRules: rules.length,
      cosmetics: stats
    });
  }

  const cosmetics = combineCosmetics(cosmeticParts);
  await writeFile(path.join(COSMETICS_DIR, 'snapshot.json'), JSON.stringify(cosmetics));
  await writeFile(
    path.join(RULES_DIR, 'packaged-revision.json'),
    `${JSON.stringify(
      {
        extensionVersion: manifest.version,
        generatedAt: new Date().toISOString(),
        sources: sourceMeta,
        networkRuleCount: packagedKeys.length,
        cosmetics: cosmeticsStats(cosmetics)
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(RULES_DIR, 'packaged-keys.json'), JSON.stringify(packagedKeys));

  await updateManifest(resources);
  const summary = resources.map((item) => `${item.id}:${item.count}`).join(', ');
  console.log(`完成。规则集：${summary}`);
  console.log(`化妆快照：${JSON.stringify(cosmeticsStats(cosmetics))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
