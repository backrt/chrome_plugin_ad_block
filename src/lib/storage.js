const AdBlockStorage = (() => {
  const DEFAULTS = {
    nextRuleId: 1,
    userRules: [],
    rulesetGroups: {
      easylist: true,
      easylist_china: true
    },
    cosmeticEnabled: true,
    listUpdate: {
      lastSuccessAt: null,
      lastError: null,
      extraRuleCount: 0,
      truncated: false,
      generatedAt: null,
      etag: null
    }
  };

  const MAX_CANDIDATES_PER_TAB = 100;
  let writeQueue = Promise.resolve();

  function isValidTabId(tabId) {
    return tabId != null && tabId >= 0;
  }

  function enqueue(task) {
    const next = writeQueue.then(task, task);
    writeQueue = next.catch((error) => {
      console.warn('Session write failed', error);
    });
    return next;
  }

  async function getLocal(keys) {
    return chrome.storage.local.get(keys);
  }

  async function setLocal(values) {
    return chrome.storage.local.set(values);
  }

  async function getSession(keys) {
    return chrome.storage.session.get(keys);
  }

  async function setSession(values) {
    try {
      await chrome.storage.session.set(values);
    } catch (error) {
      console.warn('Failed to write session storage', error);
    }
  }

  async function removeSession(keys) {
    try {
      await chrome.storage.session.remove(keys);
    } catch (error) {
      console.warn('Failed to remove session storage', error);
    }
  }

  function tabKey(kind, tabId) {
    return `${kind}:${tabId}`;
  }

  async function ensureDefaults() {
    const current = await getLocal(Object.keys(DEFAULTS));
    const patch = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (current[key] === undefined) {
        patch[key] = value;
      }
    }
    if (Object.keys(patch).length) {
      await setLocal(patch);
    }
  }

  async function getUserRules() {
    const { userRules = [] } = await getLocal(['userRules']);
    return userRules;
  }

  async function setUserRules(userRules) {
    await setLocal({ userRules });
  }

  async function getNextRuleId() {
    const { nextRuleId = 1 } = await getLocal(['nextRuleId']);
    return nextRuleId;
  }

  async function setNextRuleId(nextRuleId) {
    await setLocal({ nextRuleId });
  }

  async function getRulesetGroups() {
    const { rulesetGroups } = await getLocal(['rulesetGroups']);
    return { ...DEFAULTS.rulesetGroups, ...(rulesetGroups || {}) };
  }

  async function setRulesetGroups(rulesetGroups) {
    await setLocal({ rulesetGroups });
  }

  async function getCosmeticEnabled() {
    const { cosmeticEnabled } = await getLocal(['cosmeticEnabled']);
    return cosmeticEnabled !== false;
  }

  async function setCosmeticEnabled(cosmeticEnabled) {
    await setLocal({ cosmeticEnabled: Boolean(cosmeticEnabled) });
  }

  function upsertItem(list, item) {
    const index = list.findIndex((entry) => entry.key === item.key);
    if (index >= 0) {
      list[index] = { ...list[index], ...item, count: (list[index].count || 1) + 1 };
      return;
    }
    list.unshift(item);
    if (list.length > MAX_CANDIDATES_PER_TAB) {
      list.length = MAX_CANDIDATES_PER_TAB;
    }
  }

  async function readTabList(kind, tabId) {
    if (!isValidTabId(tabId)) return [];
    const key = tabKey(kind, tabId);
    const data = await getSession([key]);
    return data[key] || [];
  }

  async function addToTabList(kind, tabId, items) {
    if (!isValidTabId(tabId) || !items?.length) return;
    return enqueue(async () => {
      const key = tabKey(kind, tabId);
      const data = await getSession([key]);
      const list = data[key] || [];
      for (const item of items) {
        upsertItem(list, item);
      }
      await setSession({ [key]: list });
    });
  }

  async function addCandidate(tabId, item) {
    await addToTabList('candidates', tabId, item ? [item] : []);
  }

  async function addCandidates(tabId, items) {
    await addToTabList('candidates', tabId, items);
  }

  async function getCandidates(tabId) {
    return enqueue(async () => readTabList('candidates', tabId));
  }

  async function addBlocked(tabId, item) {
    await addToTabList('blocked', tabId, item ? [item] : []);
  }

  async function getBlocked(tabId) {
    return enqueue(async () => readTabList('blocked', tabId));
  }

  async function clearTab(tabId) {
    if (!isValidTabId(tabId)) return;
    return enqueue(async () => {
      await removeSession([tabKey('candidates', tabId), tabKey('blocked', tabId)]);
    });
  }

  return {
    DEFAULTS,
    MAX_CANDIDATES_PER_TAB,
    ensureDefaults,
    getUserRules,
    setUserRules,
    getNextRuleId,
    setNextRuleId,
    getRulesetGroups,
    setRulesetGroups,
    getCosmeticEnabled,
    setCosmeticEnabled,
    addCandidate,
    addCandidates,
    getCandidates,
    addBlocked,
    getBlocked,
    clearTab
  };
})();
