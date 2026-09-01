(() => {
  const STYLE_ID = 'adblock-hide-style';
  let genericSelectors = [];
  let specificSelectors = [];
  let hideScheduled = false;
  let pendingNodes = [];

  function cssFrom(selectors) {
    if (!selectors.length) return '';
    return `${selectors.join(',\n')}{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;}`;
  }

  function inject() {
    const css = cssFrom([...genericSelectors, ...specificSelectors]);
    const root = document.documentElement;
    if (!root || !css) return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      root.prepend(style);
    }
    style.textContent = css;
  }

  function hideSpecific(root) {
    if (!specificSelectors.length || !root?.querySelectorAll) return;
    for (const selector of specificSelectors) {
      try {
        if (root.matches?.(selector)) {
          root.style.setProperty('display', 'none', 'important');
        }
        for (const el of root.querySelectorAll(selector)) {
          el.style.setProperty('display', 'none', 'important');
        }
      } catch {
        // 非法选择器忽略
      }
    }
  }

  function ensureStyle() {
    if (!genericSelectors.length && !specificSelectors.length) return;
    if (!document.getElementById(STYLE_ID)) inject();
  }

  function scheduleSpecificHide(nodes) {
    if (nodes?.length) pendingNodes.push(...nodes);
    if (!specificSelectors.length) {
      ensureStyle();
      pendingNodes = [];
      return;
    }
    if (hideScheduled) return;
    hideScheduled = true;
    requestAnimationFrame(() => {
      hideScheduled = false;
      const batch = pendingNodes;
      pendingNodes = [];
      ensureStyle();
      if (batch.length) {
        for (const node of batch) {
          if (node.nodeType === 1) hideSpecific(node);
        }
        return;
      }
      hideSpecific(document.documentElement);
    });
  }

  async function start() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_COSMETICS',
        host: location.hostname
      });
      if (!response?.ok || !response.enabled) return;
      genericSelectors = response.generic || [];
      specificSelectors = response.specific || [];
      const apply = () => {
        inject();
        hideSpecific(document.documentElement);
      };
      if (document.documentElement) apply();
      else document.addEventListener('DOMContentLoaded', apply, { once: true });
    } catch {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const added = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.id !== STYLE_ID) added.push(node);
        }
      }
      if (!document.getElementById(STYLE_ID) || added.length) {
        scheduleSpecificHide(added);
      }
    });
    const root = document.documentElement || document;
    observer.observe(root, { childList: true, subtree: true });
  }

  start();
})();
