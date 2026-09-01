const pageUrlEl = document.getElementById('pageUrl');
const statusEl = document.getElementById('status');
const blockedList = document.getElementById('blockedList');
const candidateList = document.getElementById('candidateList');
const ruleList = document.getElementById('ruleList');
const blockedCount = document.getElementById('blockedCount');
const candidateCount = document.getElementById('candidateCount');
const ruleCount = document.getElementById('ruleCount');
const addSelected = document.getElementById('addSelected');

let currentTab = null;
let candidates = [];

const t = AdBlockI18n.t;
AdBlockI18n.apply();

function showStatus(text, ok = false) {
  statusEl.hidden = !text;
  statusEl.className = ok ? 'banner ok' : 'banner';
  statusEl.textContent = text || '';
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function truncate(text, max = 86) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function pathOf(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || '/';
  } catch {
    return url;
  }
}

function emptyRow(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  return li;
}

function renderBlocked(items) {
  blockedList.replaceChildren();
  blockedCount.textContent = String(items.length);
  if (!items.length) {
    blockedList.append(emptyRow(t('emptyBlocked')));
    return;
  }
  for (const item of items.slice(0, 30)) {
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `
      <div class="row-body">
        <div class="domain">${escapeHtml(item.domain)}</div>
        <div class="path">${escapeHtml(truncate(pathOf(item.url)))}</div>
        <div class="meta">
          <span class="pill">${escapeHtml(item.resourceType || 'other')}</span>
          ${item.rulesetId ? `<span class="pill ok">${escapeHtml(item.rulesetId)}</span>` : `<span class="pill ok">${t('blocked')}</span>`}
        </div>
      </div>
    `;
    blockedList.append(li);
  }
}

function renderCandidates(items) {
  candidateList.replaceChildren();
  candidateCount.textContent = String(items.length);
  if (!items.length) {
    candidateList.append(emptyRow(t('emptyCandidates')));
    addSelected.disabled = true;
    return;
  }
  for (const item of items.slice(0, 40)) {
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `
      <label class="check">
        <input type="checkbox" data-key="${escapeHtml(item.key)}" />
        <div class="row-body">
          <div class="domain">${escapeHtml(item.domain)}</div>
          <div class="path">${escapeHtml(truncate(pathOf(item.url)))}</div>
          <div class="meta">
            <span class="pill">${escapeHtml(item.resourceType || 'other')}</span>
            <span class="pill warn">${item.source === 'dom' ? t('sourceDom') : t('sourceNetwork')}</span>
          </div>
        </div>
      </label>
    `;
    candidateList.append(li);
  }
  syncAddButton();
}

function renderRules(items) {
  ruleList.replaceChildren();
  const enabled = items.filter((item) => item.enabled);
  ruleCount.textContent = String(enabled.length);
  if (!items.length) {
    ruleList.append(emptyRow(t('emptyRulesPopup')));
    return;
  }
  for (const item of items.slice(0, 20)) {
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `
      <div class="row-body">
        <div class="domain">${escapeHtml(item.domain)}</div>
        <div class="path">${item.requestDomains?.length ? t('blockByAdDomain') : escapeHtml(truncate(item.urlFilter || item.url))}</div>
        <div class="meta">
          <span class="pill ${item.enabled ? 'ok' : 'warn'}">${item.enabled ? t('statusEnabled') : t('statusDisabled')}</span>
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

function syncAddButton() {
  const checked = candidateList.querySelectorAll('input[type="checkbox"]:checked').length;
  addSelected.disabled = checked === 0;
}

async function loadData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  pageUrlEl.textContent = tab?.url || t('cannotReadTab');
  const response = await chrome.runtime.sendMessage({
    type: 'GET_PAGE_DATA',
    tabId: tab?.id,
    pageUrl: tab?.url
  });
  if (!response?.ok) {
    showStatus(response?.error || t('loadPageFailed'));
    return;
  }
  candidates = response.candidates || [];
  renderBlocked(response.blocked || []);
  renderCandidates(candidates);
  renderRules(response.userRules || []);
}

candidateList.addEventListener('change', syncAddButton);

addSelected.addEventListener('click', async () => {
  const selectedKeys = [...candidateList.querySelectorAll('input[type="checkbox"]:checked')].map(
    (input) => input.dataset.key
  );
  const selected = candidates.filter((item) => selectedKeys.includes(item.key));
  if (!selected.length) return;
  addSelected.disabled = true;
  const response = await chrome.runtime.sendMessage({
    type: 'ADD_DYNAMIC_RULES',
    pageUrl: currentTab?.url || '',
    candidates: selected
  });
  if (response?.ok) {
    const added = response.added ?? selected.length;
    showStatus(added ? t('addedRules', [String(added)]) : t('alreadyInRules'), true);
  } else {
    showStatus(response?.error || t('addRulesFailed'));
  }
  await loadData();
});

ruleList.addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-toggle]');
  const remove = event.target.closest('[data-remove]');
  if (toggle) {
    const ruleId = Number(toggle.dataset.toggle);
    const enabled = toggle.dataset.enabled !== '1';
    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_DYNAMIC_RULE',
      ruleId,
      enabled
    });
    if (!response?.ok) showStatus(response?.error || t('toggleFailed'));
    await loadData();
  }
  if (remove) {
    const ruleId = Number(remove.dataset.remove);
    const response = await chrome.runtime.sendMessage({
      type: 'REMOVE_DYNAMIC_RULE',
      ruleId
    });
    if (!response?.ok) showStatus(response?.error || t('removeFailed'));
    await loadData();
  }
});

loadData().catch((error) => {
  showStatus(error.message || String(error));
});
