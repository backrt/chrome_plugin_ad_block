const AdBlockListUpdate = (() => {
  // Chrome / Edge / Firefox 都拉这一份；列表由 feature/chrome 上的 Action 生成。
  const UPDATE_BASES = [
    'https://raw.githubusercontent.com/backrt/chrome_plugin_ad_block/feature/chrome/updates',
    'https://cdn.jsdelivr.net/gh/backrt/chrome_plugin_ad_block@feature/chrome/updates'
  ];
  const UPDATE_BASE = UPDATE_BASES[0];
  const ALARM_NAME = 'filter-list-update';
  const PERIOD_MINUTES = 24 * 60;
  let activeBase = UPDATE_BASES[0];

  async function getStatus() {
    const { listUpdate } = await chrome.storage.local.get('listUpdate');
    return (
      listUpdate || {
        lastSuccessAt: null,
        lastError: null,
        extraRuleCount: 0,
        truncated: false,
        generatedAt: null,
        etag: null
      }
    );
  }

  async function setStatus(patch) {
    const current = await getStatus();
    const listUpdate = { ...current, ...patch };
    await chrome.storage.local.set({ listUpdate });
    return listUpdate;
  }

  async function fetchJson(fileName, { etag = '', bust = false } = {}) {
    const headers = {};
    if (etag) headers['If-None-Match'] = etag;
    const suffix = bust ? `?t=${Date.now()}` : '';
    const bases = [activeBase, ...UPDATE_BASES.filter((base) => base !== activeBase)];
    let last = null;
    for (const base of bases) {
      try {
        const response = await fetch(`${base}/${fileName}${suffix}`, {
          headers,
          cache: 'no-store'
        });
        last = response;
        if (response.ok || response.status === 304) {
          activeBase = base;
          return response;
        }
      } catch (error) {
        last = { ok: false, status: 0, message: error.message || String(error) };
      }
    }
    return last;
  }

  async function refresh(force = false) {
    const status = await getStatus();
    const metaResponse = await fetchJson('meta.json', {
      etag: force ? '' : status.etag,
      bust: true
    });
    if (!metaResponse || metaResponse.status === 404 || metaResponse.status === 0) {
      throw new Error(AdBlockI18n.t('errUpdateFetch', [String(metaResponse?.status || AdBlockI18n.t('errNetwork'))]));
    }
    if (metaResponse.status === 304) {
      return setStatus({ lastError: null, lastSuccessAt: Date.now() });
    }
    if (!metaResponse.ok) {
      throw new Error(AdBlockI18n.t('errUpdateMeta', [String(metaResponse.status)]));
    }

    const meta = await metaResponse.json();
    const etag = metaResponse.headers.get('ETag') || status.etag;
    const extensionVersion = chrome.runtime.getManifest().version;
    const baselineMatches = !meta.baselineVersion || meta.baselineVersion === extensionVersion;

    const cosmeticsResponse = await fetchJson('cosmetics.json', { bust: true });
    if (cosmeticsResponse?.ok) {
      const cosmetics = await cosmeticsResponse.json();
      await AdBlockCosmetics.setCosmetics(cosmetics);
    }

    let extraRuleCount = 0;
    let truncated = Boolean(meta.truncated);
    if (baselineMatches) {
      const extraResponse = await fetchJson('dnr-extra.json', { bust: true });
      if (!extraResponse?.ok) {
        throw new Error(AdBlockI18n.t('errUpdateExtra', [String(extraResponse?.status || AdBlockI18n.t('errNetwork'))]));
      }
      const extra = await extraResponse.json();
      const applied = await AdBlockDnr.applyListExtra(Array.isArray(extra) ? extra : []);
      extraRuleCount = applied.count;
      truncated = truncated || applied.truncated;
    } else {
      await AdBlockDnr.applyListExtra([]);
      extraRuleCount = 0;
    }

    return setStatus({
      lastSuccessAt: Date.now(),
      lastError: null,
      extraRuleCount,
      truncated,
      generatedAt: meta.generatedAt || null,
      etag,
      baselineVersion: meta.baselineVersion || null,
      baselineMatches,
      updateSource: activeBase
    });
  }

  async function ensureAlarm() {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) {
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: PERIOD_MINUTES });
    }
  }

  return {
    UPDATE_BASE,
    UPDATE_BASES,
    ALARM_NAME,
    getStatus,
    refresh,
    ensureAlarm
  };
})();
