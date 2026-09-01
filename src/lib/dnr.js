const AdBlockDnr = (() => {
  const RESOURCE_TYPES_NO_MAIN = [
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'webbundle',
    'other'
  ];

  const MAX_DYNAMIC_RULES = 30000;
  const USER_RULE_ID_MIN = 1;
  const USER_RULE_ID_MAX = 5000;
  const LIST_RULE_ID_MIN = 5001;
  const LIST_RULE_ID_MAX = 30000;
  const LIST_EXTRA_BATCH = 2000;
  const EXTRA_ACTIONS = new Set(['block', 'allow', 'allowAllRequests', 'upgradeScheme']);

  const RULESET_GROUPS = {
    easylist: {
      label: 'EasyList',
      match: (id) => id.startsWith('easylist_') && id !== 'easylist_china' && !id.startsWith('easylist_china')
    },
    easylist_china: {
      label: 'EasyList China',
      match: (id) => id === 'easylist_china' || id.startsWith('easylist_china_')
    }
  };

  async function listedRulesetIds() {
    const manifest = chrome.runtime.getManifest();
    return (manifest.declarative_net_request?.rule_resources || []).map((item) => item.id);
  }

  function groupIds(allIds, groupKey) {
    const group = RULESET_GROUPS[groupKey];
    if (!group) return [];
    return allIds.filter((id) => group.match(id));
  }

  async function nextRuleId() {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const stored = await AdBlockStorage.getNextRuleId();
    const userExisting = existing.filter((rule) => rule.id >= USER_RULE_ID_MIN && rule.id <= USER_RULE_ID_MAX);
    const maxExisting = userExisting.reduce((max, rule) => Math.max(max, rule.id), 0);
    const usableStored = stored >= USER_RULE_ID_MIN && stored <= USER_RULE_ID_MAX ? stored : USER_RULE_ID_MIN;
    const id = Math.max(usableStored, maxExisting + 1, USER_RULE_ID_MIN);
    if (id > USER_RULE_ID_MAX) {
      throw new Error(AdBlockI18n.t('errUserRuleLimit', [String(USER_RULE_ID_MAX)]));
    }
    await AdBlockStorage.setNextRuleId(id + 1);
    return id;
  }

  function sanitizePath(pathname) {
    const path = pathname || '/';
    return path.replace(/[*^|]/g, '');
  }

  function toUrlFilter(domain, pathname) {
    return `||${domain}${sanitizePath(pathname)}`;
  }

  function resourceTypesFor(candidate, hostWide) {
    if (hostWide) return RESOURCE_TYPES_NO_MAIN;
    const type = candidate.resourceType;
    if (type && type !== 'main_frame' && RESOURCE_TYPES_NO_MAIN.includes(type)) {
      return [type];
    }
    return ['image', 'sub_frame', 'script', 'xmlhttprequest', 'media'];
  }

  function shouldUseHostRule(candidate, pageUrl) {
    if (!candidate?.domain || !AdBlockClassifier.isAdDomain(candidate.domain)) {
      return false;
    }
    if (!pageUrl) return true;
    return !AdBlockClassifier.isSameSite(candidate.url, pageUrl);
  }

  function buildCondition(candidate, pageUrl) {
    if (shouldUseHostRule(candidate, pageUrl)) {
      return {
        requestDomains: [candidate.domain],
        resourceTypes: resourceTypesFor(candidate, true)
      };
    }
    const path = AdBlockClassifier.pathnameOf(candidate.url) || '/';
    return {
      urlFilter: toUrlFilter(candidate.domain, path),
      resourceTypes: resourceTypesFor(candidate, false)
    };
  }

  function isCoveredByUserRule(candidate, userRules) {
    const path = AdBlockClassifier.pathnameOf(candidate.url) || '/';
    const urlFilter = toUrlFilter(candidate.domain, path);
    return (userRules || []).some((rule) => {
      if (!rule.enabled) return false;
      if (rule.requestDomains?.includes(candidate.domain)) return true;
      return Boolean(rule.urlFilter) && rule.urlFilter === urlFilter;
    });
  }

  function sameTarget(rule, candidate, pageUrl) {
    const condition = buildCondition(candidate, pageUrl);
    if (condition.requestDomains) {
      return (
        Array.isArray(rule.condition.requestDomains) &&
        rule.condition.requestDomains.includes(candidate.domain)
      );
    }
    return rule.condition.urlFilter === condition.urlFilter;
  }

  async function addFromCandidate(candidate, pageUrl) {
    if (!candidate?.domain) {
      throw new Error(AdBlockI18n.t('errInvalidCandidate'));
    }
    if (candidate.resourceType === 'main_frame') {
      throw new Error(AdBlockI18n.t('errNoMainFrame'));
    }
    const hostWide = shouldUseHostRule(candidate, pageUrl);
    const path = AdBlockClassifier.pathnameOf(candidate.url) || '/';
    if (!hostWide && (!path || path === '/')) {
      throw new Error(AdBlockI18n.t('errPathTooWide'));
    }

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const userCount = existing.filter((rule) => rule.id <= USER_RULE_ID_MAX).length;
    if (userCount >= USER_RULE_ID_MAX) {
      throw new Error(AdBlockI18n.t('errUserRuleLimit', [String(USER_RULE_ID_MAX)]));
    }
    if (existing.some((rule) => sameTarget(rule, candidate, pageUrl))) {
      const error = new Error(AdBlockI18n.t('errAlreadyExists'));
      error.code = 'ALREADY_EXISTS';
      throw error;
    }

    const id = await nextRuleId();
    const rule = {
      id,
      priority: 10,
      action: { type: 'block' },
      condition: buildCondition(candidate, pageUrl)
    };

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [rule],
      removeRuleIds: []
    });

    const userRules = await AdBlockStorage.getUserRules();
    userRules.unshift({
      ruleId: id,
      domain: candidate.domain,
      url: candidate.url,
      urlFilter: rule.condition.urlFilter || '',
      requestDomains: rule.condition.requestDomains || [],
      resourceTypes: rule.condition.resourceTypes,
      sourceUrl: pageUrl || '',
      createdAt: Date.now(),
      enabled: true
    });
    await AdBlockStorage.setUserRules(userRules);
    return rule;
  }

  async function removeRule(ruleId) {
    if (ruleId >= LIST_RULE_ID_MIN) {
      throw new Error(AdBlockI18n.t('errCannotDeleteList'));
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId]
    });
    const userRules = await AdBlockStorage.getUserRules();
    await AdBlockStorage.setUserRules(userRules.filter((item) => item.ruleId !== ruleId));
  }

  async function setRuleEnabled(ruleId, enabled) {
    const userRules = await AdBlockStorage.getUserRules();
    const record = userRules.find((item) => item.ruleId === ruleId);
    if (!record) {
      throw new Error(AdBlockI18n.t('errRuleNotFound'));
    }

    if (enabled) {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      if (!existing.some((rule) => rule.id === ruleId)) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [
            {
              id: ruleId,
              priority: 10,
              action: { type: 'block' },
              condition: record.requestDomains?.length
                ? {
                    requestDomains: record.requestDomains,
                    resourceTypes: record.resourceTypes || RESOURCE_TYPES_NO_MAIN
                  }
                : {
                    urlFilter: record.urlFilter,
                    resourceTypes: record.resourceTypes || RESOURCE_TYPES_NO_MAIN
                  }
            }
          ]
        });
      }
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId]
      });
    }

    record.enabled = enabled;
    await AdBlockStorage.setUserRules(userRules);
  }

  async function applyListExtra(rules) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.filter((rule) => rule.id >= LIST_RULE_ID_MIN).map((rule) => rule.id);
    const capacity = LIST_RULE_ID_MAX - LIST_RULE_ID_MIN + 1;
    const sanitized = [];
    for (const rule of rules || []) {
      const actionType = rule.action?.type;
      if (!EXTRA_ACTIONS.has(actionType)) continue;
      const condition = { ...(rule.condition || {}) };
      if (condition.regexFilter) continue;
      if (!condition.urlFilter && !condition.requestDomains?.length) continue;
      sanitized.push({
        priority: rule.priority || 1,
        action: rule.action,
        condition
      });
    }
    const truncated = sanitized.length > capacity;
    const addRules = sanitized.slice(0, capacity).map((rule, index) => ({
      ...rule,
      id: LIST_RULE_ID_MIN + index
    }));
    if (!removeRuleIds.length && !addRules.length) {
      return { count: 0, truncated: false };
    }
    if (removeRuleIds.length) {
      for (let i = 0; i < removeRuleIds.length; i += LIST_EXTRA_BATCH) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: removeRuleIds.slice(i, i + LIST_EXTRA_BATCH)
        });
      }
    }
    for (let i = 0; i < addRules.length; i += LIST_EXTRA_BATCH) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: addRules.slice(i, i + LIST_EXTRA_BATCH)
      });
    }
    return { count: addRules.length, truncated };
  }

  async function applyRulesetGroups(groups) {
    const allIds = await listedRulesetIds();
    const enableRulesetIds = [];
    const disableRulesetIds = [];
    for (const [key, enabled] of Object.entries(groups)) {
      const ids = groupIds(allIds, key);
      if (enabled) {
        enableRulesetIds.push(...ids);
      } else {
        disableRulesetIds.push(...ids);
      }
    }
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds,
      disableRulesetIds
    });
    await AdBlockStorage.setRulesetGroups(groups);
  }

  async function syncRulesetGroupsFromStorage() {
    const groups = await AdBlockStorage.getRulesetGroups();
    await applyRulesetGroups(groups);
    return groups;
  }

  return {
    RESOURCE_TYPES_NO_MAIN,
    MAX_DYNAMIC_RULES,
    USER_RULE_ID_MAX,
    LIST_RULE_ID_MIN,
    LIST_RULE_ID_MAX,
    RULESET_GROUPS,
    listedRulesetIds,
    groupIds,
    shouldUseHostRule,
    isCoveredByUserRule,
    addFromCandidate,
    applyListExtra,
    removeRule,
    setRuleEnabled,
    applyRulesetGroups,
    syncRulesetGroupsFromStorage
  };
})();
