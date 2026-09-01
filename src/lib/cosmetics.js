const AdBlockCosmetics = (() => {
  const GENERIC_INJECT_MAX = 6000;
  let cache = null;

  function hostChain(host) {
    const hostname = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!hostname) return [];
    const parts = hostname.split('.').filter(Boolean);
    const chain = [];
    for (let i = 0; i < parts.length - 1; i += 1) {
      chain.push(parts.slice(i).join('.'));
    }
    return chain;
  }

  function unique(list) {
    return [...new Set(list.filter(Boolean))];
  }

  async function loadSnapshot() {
    const url = chrome.runtime.getURL('cosmetics/snapshot.json');
    const response = await fetch(url);
    if (!response.ok) {
      return { generic: [], specific: {}, exceptions: { generic: [], specific: {} } };
    }
    return response.json();
  }

  async function load() {
    if (cache) return cache;
    const { cosmetics } = await chrome.storage.local.get('cosmetics');
    cache = cosmetics || (await loadSnapshot());
    return cache;
  }

  function invalidate() {
    cache = null;
  }

  async function setCosmetics(cosmetics) {
    cache = cosmetics;
    await chrome.storage.local.set({ cosmetics });
  }

  function resolve(host, data) {
    const exceptions = new Set(data.exceptions?.generic || []);
    const specific = [];
    for (const domain of hostChain(host)) {
      specific.push(...(data.specific?.[domain] || []));
      for (const selector of data.exceptions?.specific?.[domain] || []) {
        exceptions.add(selector);
      }
    }
    const generic = (data.generic || []).filter((selector) => !exceptions.has(selector)).slice(0, GENERIC_INJECT_MAX);
    return {
      generic,
      specific: unique(specific.filter((selector) => !exceptions.has(selector)))
    };
  }

  async function selectorsFor(host) {
    const data = await load();
    return resolve(host, data);
  }

  return {
    GENERIC_INJECT_MAX,
    load,
    setCosmetics,
    invalidate,
    selectorsFor,
    hostChain
  };
})();
