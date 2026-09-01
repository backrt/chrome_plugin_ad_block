importScripts('../lib/i18n.js', '../lib/storage.js', '../lib/classifier.js', '../lib/dnr.js', '../lib/cosmetics.js', '../lib/list-update.js');

const BLOCKED_BY_CLIENT = 'net::ERR_BLOCKED_BY_CLIENT';

function isSkippableUrl(url) {
  return (
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('devtools://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('moz-extension://')
  );
}

function toListItem(details, source) {
  return AdBlockClassifier.toCandidate(details.url, details.type, source);
}

async function initActionBadge() {
  await chrome.declarativeNetRequest.setExtensionActionOptions({
    displayActionCountAsBadgeText: true
  });
}

async function bootstrap() {
  await AdBlockStorage.ensureDefaults();
  await initActionBadge();
  try {
    await AdBlockDnr.syncRulesetGroupsFromStorage();
  } catch (error) {
    console.warn('Failed to sync rulesets', error);
  }
  try {
    await AdBlockListUpdate.ensureAlarm();
  } catch (error) {
    console.warn('Failed to create update alarm', error);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await bootstrap();
  AdBlockListUpdate.refresh(true).catch((error) => {
    console.warn('Initial filter update failed', error);
    AdBlockListUpdate.getStatus().then((status) => {
      chrome.storage.local.set({
        listUpdate: { ...status, lastError: error.message || String(error) }
      });
    });
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await bootstrap();
  AdBlockListUpdate.refresh(false).catch((error) => {
    console.warn('Startup filter update failed', error);
    AdBlockListUpdate.getStatus().then((status) => {
      chrome.storage.local.set({
        listUpdate: { ...status, lastError: error.message || String(error) }
      });
    });
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AdBlockListUpdate.ALARM_NAME) return;
  AdBlockListUpdate.refresh(false).catch(async (error) => {
    const status = await AdBlockListUpdate.getStatus();
    await chrome.storage.local.set({
      listUpdate: { ...status, lastError: error.message || String(error) }
    });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  AdBlockStorage.clearTab(tabId);
});

AdBlockStorage.ensureDefaults()
  .then(() => initActionBadge())
  .then(() => AdBlockListUpdate.ensureAlarm())
  .catch((error) => console.warn('Failed to initialize extension', error));

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0 || details.type === 'main_frame' || isSkippableUrl(details.url)) {
      return;
    }
    if (!AdBlockClassifier.isAdRequest(details.url, details.type, details.initiator)) {
      return;
    }
    const item = toListItem(details, 'network');
    if (item) {
      AdBlockStorage.addCandidate(details.tabId, item);
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId < 0 || isSkippableUrl(details.url)) {
      return;
    }
    if (details.error !== BLOCKED_BY_CLIENT) {
      return;
    }
    const item = toListItem(details, 'dnr');
    if (item) {
      AdBlockStorage.addBlocked(details.tabId, item);
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });
  return true;
});

function hasTab(tabId) {
  return tabId != null && tabId >= 0;
}

async function getMatched(tabId) {
  try {
    const result = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    return result.rulesMatchedInfo || [];
  } catch {
    return [];
  }
}

function matchedToItems(matched) {
  const items = [];
  const seen = new Set();
  for (const entry of matched) {
    const url = entry.request?.url;
    if (!url) continue;
    const key = AdBlockClassifier.candidateKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = AdBlockClassifier.toCandidate(url, entry.request.type, 'dnr');
    if (item) {
      item.ruleId = entry.rule?.ruleId;
      item.rulesetId = entry.rule?.rulesetId;
      item.timeStamp = entry.timeStamp;
      items.push(item);
    }
  }
  return items;
}

async function handleMessage(message, sender) {
  const type = message?.type;
  const tabId = message?.tabId ?? sender?.tab?.id;

  if (type === 'DOM_CANDIDATES') {
    const pageUrl = sender?.tab?.url || sender?.origin || '';
    const items = (message.items || [])
      .filter((entry) => AdBlockClassifier.isAdRequest(entry.url, entry.resourceType || 'other', pageUrl))
      .map((entry) => AdBlockClassifier.toCandidate(entry.url, entry.resourceType || 'other', 'dom'))
      .filter(Boolean);
    await AdBlockStorage.addCandidates(tabId, items);
    return { ok: true, added: items.length };
  }

  if (type === 'GET_PAGE_DATA') {
    const matched = hasTab(tabId) ? await getMatched(tabId) : [];
    const matchedItems = matchedToItems(matched);
    const sessionBlocked = hasTab(tabId) ? await AdBlockStorage.getBlocked(tabId) : [];
    const blockedMap = new Map();
    for (const item of [...sessionBlocked, ...matchedItems]) {
      blockedMap.set(item.key, item);
    }
    const blocked = [...blockedMap.values()];
    const blockedKeys = new Set(blocked.map((item) => item.key));
    const userRules = await AdBlockStorage.getUserRules();
    const candidates = ((hasTab(tabId) ? await AdBlockStorage.getCandidates(tabId) : [])).filter(
      (item) => !blockedKeys.has(item.key) && !AdBlockDnr.isCoveredByUserRule(item, userRules)
    );
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    return {
      ok: true,
      blocked,
      candidates,
      userRules,
      dynamicRuleCount: dynamicRules.length
    };
  }

  if (type === 'ADD_DYNAMIC_RULES') {
    const pageUrl = message.pageUrl || '';
    const unique = [];
    const seen = new Set();
    for (const candidate of message.candidates || []) {
      const hostWide = AdBlockDnr.shouldUseHostRule(candidate, pageUrl);
      const dedupeKey = hostWide ? `host:${candidate.domain}` : candidate.key;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      unique.push(candidate);
    }
    const results = [];
    for (const candidate of unique) {
      try {
        const rule = await AdBlockDnr.addFromCandidate(candidate, pageUrl);
        results.push({ ok: true, ruleId: rule.id, key: candidate.key });
      } catch (error) {
        if (error.code === 'ALREADY_EXISTS') {
          results.push({ ok: true, skipped: true, key: candidate.key });
          continue;
        }
        results.push({ ok: false, key: candidate.key, error: error.message });
      }
    }
    const failed = results.filter((item) => !item.ok);
    const added = results.filter((item) => item.ok && !item.skipped).length;
    return {
      ok: failed.length === 0,
      added,
      results,
      error: failed.length ? failed.map((item) => item.error).join('；') : undefined
    };
  }

  if (type === 'REMOVE_DYNAMIC_RULE') {
    await AdBlockDnr.removeRule(message.ruleId);
    return { ok: true };
  }

  if (type === 'TOGGLE_DYNAMIC_RULE') {
    await AdBlockDnr.setRuleEnabled(message.ruleId, message.enabled);
    return { ok: true };
  }

  if (type === 'GET_COSMETICS') {
    const enabled = await AdBlockStorage.getCosmeticEnabled();
    if (!enabled) {
      return { ok: true, enabled: false, generic: [], specific: [] };
    }
    const host = message.host || (sender.tab?.url ? new URL(sender.tab.url).hostname : '');
    const selectors = await AdBlockCosmetics.selectorsFor(host);
    return { ok: true, enabled: true, ...selectors };
  }

  if (type === 'SET_COSMETIC_ENABLED') {
    await AdBlockStorage.setCosmeticEnabled(message.enabled);
    AdBlockCosmetics.invalidate();
    return { ok: true };
  }

  if (type === 'REFRESH_FILTER_LISTS') {
    try {
      const listUpdate = await AdBlockListUpdate.refresh(true);
      return { ok: true, listUpdate };
    } catch (error) {
      const status = await AdBlockListUpdate.getStatus();
      const listUpdate = { ...status, lastError: error.message || String(error) };
      await chrome.storage.local.set({ listUpdate });
      return { ok: false, error: listUpdate.lastError, listUpdate };
    }
  }

  if (type === 'GET_OPTIONS_DATA') {
    const userRules = await AdBlockStorage.getUserRules();
    const rulesetGroups = await AdBlockStorage.getRulesetGroups();
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    const allIds = await AdBlockDnr.listedRulesetIds();
    const cosmeticEnabled = await AdBlockStorage.getCosmeticEnabled();
    const listUpdate = await AdBlockListUpdate.getStatus();
    return {
      ok: true,
      userRules,
      rulesetGroups,
      dynamicRuleCount: dynamicRules.length,
      maxDynamicRules: AdBlockDnr.MAX_DYNAMIC_RULES,
      userRuleLimit: AdBlockDnr.USER_RULE_ID_MAX,
      extraRuleCount: dynamicRules.filter((rule) => rule.id >= AdBlockDnr.LIST_RULE_ID_MIN).length,
      rulesetIds: allIds,
      cosmeticEnabled,
      listUpdate
    };
  }

  if (type === 'SET_RULESET_GROUPS') {
    await AdBlockDnr.applyRulesetGroups(message.groups);
    return { ok: true };
  }

  return { ok: false, error: AdBlockI18n.t('errUnknownMessage', [String(type)]) };
}
