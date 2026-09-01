const groupEasylist = document.getElementById('groupEasylist');
const groupChina = document.getElementById('groupChina');
const cosmeticEnabled = document.getElementById('cosmeticEnabled');
const refreshLists = document.getElementById('refreshLists');
const updateMeta = document.getElementById('updateMeta');
const dynamicCount = document.getElementById('dynamicCount');
const ruleList = document.getElementById('ruleList');
const statusEl = document.getElementById('status');

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
    ruleList.append(emptyRow('还没有自定义动态规则。打开任意网页，在扩展弹窗中勾选疑似广告即可添加。'));
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'row';
    const created = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
    li.innerHTML = `
      <div class="row-body">
        <div class="domain">${escapeHtml(item.domain)}</div>
        <div class="path">${item.requestDomains?.length ? '按广告域名拦截子资源' : escapeHtml(item.urlFilter || item.url)}</div>
        <div class="meta">
          <span class="pill ${item.enabled ? 'ok' : 'warn'}">${item.enabled ? '已启用' : '已停用'}</span>
          ${created ? `<span class="pill">${created}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-toggle="${item.ruleId}" data-enabled="${item.enabled ? '1' : '0'}">${
          item.enabled ? '停用' : '启用'
        }</button>
        <button class="btn danger" data-remove="${item.ruleId}">删除</button>
      </div>
    `;
    ruleList.append(li);
  }
}

function formatUpdate(status) {
  if (!status) return '尚未更新';
  const parts = [];
  if (status.lastSuccessAt) {
    parts.push(`上次成功：${new Date(status.lastSuccessAt).toLocaleString()}`);
  }
  if (status.generatedAt) {
    parts.push(`列表生成：${new Date(status.generatedAt).toLocaleString()}`);
  }
  parts.push(`增量网络规则：${status.extraRuleCount || 0}`);
  if (status.truncated) parts.push('增量已截断至额度上限');
  if (status.baselineMatches === false) parts.push('扩展版本已更新，增量网络规则已清空');
  if (status.lastError) parts.push(`错误：${status.lastError}`);
  return parts.join(' · ') || '尚未更新';
}

async function loadData() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_OPTIONS_DATA' });
  if (!response?.ok) {
    showStatus(response?.error || '读取设置失败');
    return;
  }
  groupEasylist.checked = Boolean(response.rulesetGroups?.easylist);
  groupChina.checked = Boolean(response.rulesetGroups?.easylist_china);
  cosmeticEnabled.checked = response.cosmeticEnabled !== false;
  updateMeta.textContent = formatUpdate(response.listUpdate);
  const extra = response.extraRuleCount || 0;
  dynamicCount.textContent = `${response.dynamicRuleCount || 0} / ${response.maxDynamicRules || 30000}（用户 ${response.userRules?.length || 0} / ${response.userRuleLimit || 5000}，增量 ${extra}）`;
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
    showStatus('静态规则集已更新，请刷新已打开的网页。', true);
  } else {
    showStatus(response?.error || '更新规则集失败');
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
    showStatus('元素隐藏已更新，请刷新已打开的网页。', true);
  } else {
    showStatus(response?.error || '更新元素隐藏失败');
  }
});

refreshLists.addEventListener('click', async () => {
  refreshLists.disabled = true;
  showStatus('正在更新过滤列表…', true);
  const response = await chrome.runtime.sendMessage({ type: 'REFRESH_FILTER_LISTS' });
  refreshLists.disabled = false;
  if (response?.ok) {
    showStatus('过滤列表已更新。', true);
  } else {
    showStatus(response?.error || '更新失败');
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
    if (!response?.ok) showStatus(response?.error || '切换失败');
    await loadData();
  }
  if (remove) {
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_DYNAMIC_RULE',
      ruleId: Number(remove.dataset.remove)
    });
    if (!response?.ok) showStatus(response?.error || '删除失败');
    await loadData();
  }
});

loadData().catch((error) => showStatus(error.message || String(error)));
