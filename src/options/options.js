const groupEasylist = document.getElementById('groupEasylist');
const groupChina = document.getElementById('groupChina');
const cosmeticEnabled = document.getElementById('cosmeticEnabled');
const refreshLists = document.getElementById('refreshLists');
const updateMeta = document.getElementById('updateMeta');
const dynamicCount = document.getElementById('dynamicCount');
const ruleList = document.getElementById('ruleList');
const statusEl = document.getElementById('status');

const t = AdBlockI18n.t;
AdBlockI18n.apply();

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showStatus(text, ok = false) {
  statusEl.hidden = !text;
  statusEl.className = ok ? 'banner ok' : 'banner';
  statusEl.textContent = text || '';
}

function emptyRow(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  return li;
}

function renderRules(items) {
  ruleList.replaceChildren();
  if (!items.length) {
    ruleList.append(emptyRow(t('emptyRulesOptions')));
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'row';
    const created = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
    li.innerHTML = `
      <div class="row-body">
        <div class="domain">${escapeHtml(item.domain)}</div>
        <div class="path">${item.requestDomains?.length ? t('blockByAdDomain') : escapeHtml(item.urlFilter || item.url)}</div>
        <div class="meta">
          <span class="pill ${item.enabled ? 'ok' : 'warn'}">${item.enabled ? t('statusEnabled') : t('statusDisabled')}</span>
          ${created ? `<span class="pill">${created}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-toggle="${item.ruleId}" data-enabled="${item.enabled ? '1' : '0'}">${
          item.enabled ? t('actionDisable') : t('actionEnable')
        }</button>
        <button class="btn danger" data-remove="${item.ruleId}">${t('actionDelete')}</button>
      </div>
    `;
    ruleList.append(li);
  }
}

function formatUpdate(status) {
  if (!status) return t('notUpdatedYet');
  const parts = [];
  if (status.lastSuccessAt) {
    parts.push(t('updateLastSuccess', [new Date(status.lastSuccessAt).toLocaleString()]));
  }
  if (status.generatedAt) {
    parts.push(t('updateListGenerated', [new Date(status.generatedAt).toLocaleString()]));
  }
  parts.push(t('updateExtraRules', [String(status.extraRuleCount || 0)]));
  if (status.truncated) parts.push(t('updateTruncated'));
  if (status.baselineMatches === false) parts.push(t('updateBaselineCleared'));
  if (status.lastError) parts.push(t('updateErrorPrefix', [status.lastError]));
  return parts.join(' · ') || t('notUpdatedYet');
}

async function loadData() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_OPTIONS_DATA' });
  if (!response?.ok) {
    showStatus(response?.error || t('loadSettingsFailed'));
    return;
  }
  groupEasylist.checked = Boolean(response.rulesetGroups?.easylist);
  groupChina.checked = Boolean(response.rulesetGroups?.easylist_china);
  cosmeticEnabled.checked = response.cosmeticEnabled !== false;
  updateMeta.textContent = formatUpdate(response.listUpdate);
  const extra = response.extraRuleCount || 0;
  dynamicCount.textContent = t('dynamicCountText', [
    String(response.dynamicRuleCount || 0),
    String(response.maxDynamicRules || 30000),
    String(response.userRules?.length || 0),
    String(response.userRuleLimit || 5000),
    String(extra)
  ]);
  renderRules(response.userRules || []);
}

async function saveGroups() {
  const response = await chrome.runtime.sendMessage({
    type: 'SET_RULESET_GROUPS',
    groups: {
      easylist: groupEasylist.checked,
      easylist_china: groupChina.checked
    }
  });
  if (response?.ok) {
    showStatus(t('staticRulesUpdated'), true);
  } else {
    showStatus(response?.error || t('updateRulesetsFailed'));
  }
}

groupEasylist.addEventListener('change', saveGroups);
groupChina.addEventListener('change', saveGroups);

cosmeticEnabled.addEventListener('change', async () => {
  const response = await chrome.runtime.sendMessage({
    type: 'SET_COSMETIC_ENABLED',
    enabled: cosmeticEnabled.checked
  });
  if (response?.ok) {
    showStatus(t('cosmeticUpdated'), true);
  } else {
    showStatus(response?.error || t('updateCosmeticFailed'));
  }
});

refreshLists.addEventListener('click', async () => {
  refreshLists.disabled = true;
  showStatus(t('updatingLists'), true);
  const response = await chrome.runtime.sendMessage({ type: 'REFRESH_FILTER_LISTS' });
  refreshLists.disabled = false;
  if (response?.ok) {
    showStatus(t('listsUpdated'), true);
  } else {
    showStatus(response?.error || t('updateFailed'));
  }
  await loadData();
});

ruleList.addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-toggle]');
  const remove = event.target.closest('[data-remove]');
  if (toggle) {
    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_DYNAMIC_RULE',
      ruleId: Number(toggle.dataset.toggle),
      enabled: toggle.dataset.enabled !== '1'
    });
    if (!response?.ok) showStatus(response?.error || t('toggleFailed'));
    await loadData();
  }
  if (remove) {
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_DYNAMIC_RULE',
      ruleId: Number(remove.dataset.remove)
    });
    if (!response?.ok) showStatus(response?.error || t('removeFailed'));
    await loadData();
  }
});

loadData().catch((error) => showStatus(error.message || String(error)));
