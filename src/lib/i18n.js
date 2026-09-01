const AdBlockI18n = (() => {
  function t(key, substitutions) {
    const text = chrome.i18n.getMessage(key, substitutions);
    return text || key;
  }

  function apply(root = document) {
    document.documentElement.lang = chrome.i18n.getUILanguage() || 'zh-CN';
    const titleEl = root.querySelector?.('title[data-i18n]');
    if (titleEl?.dataset.i18n) {
      document.title = t(titleEl.dataset.i18n);
    }
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      if (el.tagName === 'TITLE') return;
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.dataset.i18nTitle));
    });
  }

  return { t, apply };
})();
