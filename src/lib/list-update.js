const AdBlockListUpdate = (() => {
  const UPDATE_BASE = 'https://raw.githubusercontent.com/backrt/chrome_plugin_ad_block/feature/chrome/updates';
  const ALARM_NAME = 'filter-list-update';
  const PERIOD_MINUTES = 24 * 60;

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

  async function fetchJson(fileName, etag) {
    const headers = { 'User-Agent': 'chrome-plugin-ad-block/1.0' };
    if (etag) headers['If-None-Match'] = etag;
    const response = await fetch(`${UPDATE_BASE}/${fileName}`, { headers });
    return response;
  }

  async function refresh(force = false) {
    const status = await getStatus();
    const metaResponse = await fetchJson('meta.json', force ? '' : status.etag);
    if (metaResponse.status === 404) {
      throw new Error('尚未发布更新文件，请先运行 npm run build:updates 或等待 CI');
    }
    if (metaResponse.status === 304) {
      return setStatus({ lastError: null, lastSuccessAt: Date.now() });
    }
    if (!metaResponse.ok) {
      throw new Error(`拉取 meta.json 失败（${metaResponse.status}）`);
    }

    const meta = await metaResponse.json();
    const etag = metaResponse.headers.get('ETag') || status.etag;
    const extensionVersion = chrome.runtime.getManifest().version;
    const baselineMatches = !meta.baselineVersion || meta.baselineVersion === extensionVersion;

    const cosmeticsResponse = await fetchJson('cosmetics.json');
    if (cosmeticsResponse.ok) {
      const cosmetics = await cosmeticsResponse.json();
      await AdBlockCosmetics.setCosmetics(cosmetics);
    }

    let extraRuleCount = 0;
    let truncated = Boolean(meta.truncated);
    if (baselineMatches) {
      const extraResponse = await fetchJson('dnr-extra.json');
      if (!extraResponse.ok) {
        throw new Error(`拉取 dnr-extra.json 失败（${extraResponse.status}）`);
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
      baselineMatches
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
    ALARM_NAME,
    getStatus,
    refresh,
    ensureAlarm
  };
})();
