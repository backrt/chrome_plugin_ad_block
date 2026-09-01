import { createHash } from 'node:crypto';
import { convertFilter } from '@eyeo/abp2dnr';

export const SOURCES = [
  {
    group: 'easylist',
    idPrefix: 'easylist',
    url: 'https://easylist.to/easylist/easylist.txt'
  },
  {
    group: 'easylist_china',
    idPrefix: 'easylist_china',
    url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt'
  }
];

export const SAFE_ACTIONS = new Set(['block', 'allow', 'allowAllRequests', 'upgradeScheme']);
export const CHUNK_SIZE = 15000;
export const CONCURRENCY = 12;
export const MAX_REGEX_RULES = 1000;

export function fingerprint(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export async function fetchList(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'chrome-plugin-ad-block/1.0' }
  });
  if (!response.ok) {
    throw new Error(`下载失败 ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function parseNetworkFilters(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('!'))
    .filter((line) => !line.startsWith('['))
    .filter((line) => !line.includes('##') && !line.includes('#@#') && !line.includes('#?#'))
    .filter((line) => !line.includes('#$#') && !line.includes('#@$#'));
}

export function isSafeSelector(selector) {
  if (!selector || selector.length > 400) return false;
  if (selector.includes('{') || selector.includes('}')) return false;
  if (selector.includes('[-abp-')) return false;
  if (selector.includes(':-abp-')) return false;
  if (selector.includes(':has-text')) return false;
  if (selector.includes(':xpath')) return false;
  if (selector.includes(':matches-css')) return false;
  if (selector.includes(':min-text-length')) return false;
  if (selector.includes(':upward')) return false;
  if (selector.includes(':remove')) return false;
  if (selector.startsWith('+js')) return false;
  return true;
}

export function parseCosmeticLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) return null;
  if (trimmed.includes('#?#') || trimmed.includes('#$#') || trimmed.includes('#@$#') || trimmed.includes('##+js')) {
    return null;
  }

  let type = 'hide';
  let domainsPart = '';
  let selector = '';
  const exceptionAt = trimmed.indexOf('#@#');
  const hideAt = trimmed.indexOf('##');
  if (exceptionAt !== -1 && (hideAt === -1 || exceptionAt <= hideAt)) {
    type = 'exception';
    domainsPart = trimmed.slice(0, exceptionAt);
    selector = trimmed.slice(exceptionAt + 3).trim();
  } else if (hideAt !== -1) {
    type = 'hide';
    domainsPart = trimmed.slice(0, hideAt);
    selector = trimmed.slice(hideAt + 2).trim();
  } else {
    return null;
  }

  if (!isSafeSelector(selector)) return null;
  const domains = domainsPart
    .split(',')
    .map((item) => {
      let domain = item.trim().toLowerCase();
      if (domain.startsWith('~')) return `~${domain.slice(1).replace(/^\./, '')}`;
      return domain.replace(/^\./, '');
    })
    .filter(Boolean);
  return { type, domains, selector };
}

function emptyCosmeticSets() {
  return {
    generic: new Set(),
    specific: new Map(),
    exceptions: {
      generic: new Set(),
      specific: new Map()
    }
  };
}

function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

export function mergeCosmetics(target, parsed) {
  if (!parsed) return;
  const { type, domains, selector } = parsed;
  const isException = type === 'exception';
  if (!domains.length) {
    (isException ? target.exceptions.generic : target.generic).add(selector);
    return;
  }

  const positives = domains.filter((domain) => !domain.startsWith('~'));
  const negatives = domains
    .filter((domain) => domain.startsWith('~'))
    .map((domain) => domain.slice(1))
    .filter(Boolean);

  if (!positives.length && !isException) {
    target.generic.add(selector);
    for (const host of negatives) addToMapSet(target.exceptions.specific, host, selector);
    return;
  }

  const map = isException ? target.exceptions.specific : target.specific;
  for (const domain of positives) addToMapSet(map, domain, selector);
  if (!isException) {
    for (const host of negatives) addToMapSet(target.exceptions.specific, host, selector);
  }
}

export function emptyCosmetics() {
  return {
    generic: [],
    specific: {},
    exceptions: {
      generic: [],
      specific: {}
    }
  };
}

function freezeCosmetics(setForm) {
  const specific = {};
  for (const [domain, selectors] of setForm.specific) specific[domain] = [...selectors];
  const exceptionSpecific = {};
  for (const [domain, selectors] of setForm.exceptions.specific) exceptionSpecific[domain] = [...selectors];
  return {
    generic: [...setForm.generic],
    specific,
    exceptions: {
      generic: [...setForm.exceptions.generic],
      specific: exceptionSpecific
    }
  };
}

export function parseCosmetics(text) {
  const cosmetics = emptyCosmeticSets();
  for (const line of text.split(/\r?\n/)) {
    mergeCosmetics(cosmetics, parseCosmeticLine(line));
  }
  return freezeCosmetics(cosmetics);
}

export function combineCosmetics(parts) {
  const combined = emptyCosmeticSets();
  for (const part of parts) {
    for (const selector of part.generic || []) combined.generic.add(selector);
    for (const selector of part.exceptions?.generic || []) combined.exceptions.generic.add(selector);
    for (const [domain, selectors] of Object.entries(part.specific || {})) {
      for (const selector of selectors) addToMapSet(combined.specific, domain, selector);
    }
    for (const [domain, selectors] of Object.entries(part.exceptions?.specific || {})) {
      for (const selector of selectors) addToMapSet(combined.exceptions.specific, domain, selector);
    }
  }
  return freezeCosmetics(combined);
}

export function sanitizeRule(rule) {
  if (!rule || !SAFE_ACTIONS.has(rule.action?.type)) return null;
  if (!rule.condition || (!rule.condition.urlFilter && !rule.condition.regexFilter && !rule.condition.requestDomains)) {
    return null;
  }
  if (rule.condition.regexFilter && rule.condition.urlFilter) {
    delete rule.condition.urlFilter;
  }
  delete rule.id;
  return rule;
}

export function ruleKey(rule) {
  const condition = rule.condition || {};
  return JSON.stringify({
    a: rule.action?.type || '',
    u: condition.urlFilter || '',
    x: condition.regexFilter || '',
    d: [...(condition.requestDomains || [])].sort(),
    t: [...(condition.resourceTypes || [])].sort(),
    dt: condition.domainType || '',
    i: [...(condition.initiatorDomains || [])].sort(),
    e: [...(condition.excludedRequestDomains || [])].sort()
  });
}

export function applyRegexCap(rules, budget) {
  let remaining = budget;
  return rules.filter((rule) => {
    if (!rule.condition?.regexFilter) return true;
    if (remaining <= 0) return false;
    remaining -= 1;
    return true;
  });
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function convertList(text, label) {
  const filters = parseNetworkFilters(text);
  console.log(`[${label}] ${filters.length} 条网络过滤规则，开始转换…`);
  let converted = 0;
  let skipped = 0;
  const rules = [];

  await mapPool(filters, CONCURRENCY, async (filter, index) => {
    try {
      const output = await convertFilter(filter);
      const list = Array.isArray(output) ? output : output ? [...output] : [];
      for (const raw of list) {
        const rule = sanitizeRule(raw);
        if (rule) rules.push(rule);
        else skipped += 1;
      }
      if (!list.length) skipped += 1;
    } catch {
      skipped += 1;
    }
    converted += 1;
    if (converted % 2000 === 0 || converted === filters.length) {
      console.log(`[${label}] 已处理 ${converted}/${filters.length}，有效 DNR ${rules.length}，跳过 ${skipped}`);
    }
    return index;
  });

  return rules;
}

export function chunk(items, size) {
  const groups = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups.length ? groups : [[]];
}

export function cosmeticsStats(cosmetics) {
  return {
    generic: cosmetics.generic.length,
    specificDomains: Object.keys(cosmetics.specific).length,
    specificSelectors: Object.values(cosmetics.specific).reduce((sum, list) => sum + list.length, 0),
    exceptionGeneric: cosmetics.exceptions.generic.length,
    exceptionDomains: Object.keys(cosmetics.exceptions.specific).length
  };
}
