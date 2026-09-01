(() => {
  const BANNER_SIZES = new Set([
    '728x90',
    '300x250',
    '160x600',
    '320x50',
    '468x60',
    '970x90',
    '336x280',
    '250x250',
    '300x600',
    '320x100',
    '970x250'
  ]);

  const MAX_ITEMS = 40;
  let scanTimer = 0;
  let scanCount = 0;

  function sizeKey(width, height) {
    return `${Math.round(width)}x${Math.round(height)}`;
  }

  function resourceTypeOf(node) {
    switch (node.tagName) {
      case 'IFRAME':
        return 'sub_frame';
      case 'IMG':
        return 'image';
      case 'SCRIPT':
        return 'script';
      case 'VIDEO':
      case 'SOURCE':
        return 'media';
      default:
        return 'other';
    }
  }

  function collectUrlsFromElement(element) {
    const urls = [];
    const attrs = ['src', 'data-src', 'data-ad-src'];
    for (const attr of attrs) {
      const value = element.getAttribute?.(attr);
      if (value && /^https?:/i.test(value)) {
        urls.push(value);
      }
    }
    if (element.src && /^https?:/i.test(element.src)) {
      urls.push(element.src);
    }
    return urls;
  }

  function looksLikeAdElement(element) {
    const identity = [
      element.id,
      typeof element.className === 'string' ? element.className : '',
      element.getAttribute?.('name'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('data-anchor-id')
    ]
      .filter(Boolean)
      .join(' ');
    if (AdBlockClassifier.attrLooksLikeAd(identity)) {
      return true;
    }
    const width = element.offsetWidth || Number(element.getAttribute?.('width')) || 0;
    const height = element.offsetHeight || Number(element.getAttribute?.('height')) || 0;
    return element.tagName === 'IFRAME' && BANNER_SIZES.has(sizeKey(width, height));
  }

  function scan() {
    if (scanCount > 20) return;
    scanCount += 1;
    const items = [];
    const seen = new Set();
    const nodes = document.querySelectorAll(
      [
        'iframe',
        'ins.adsbygoogle',
        '[id*="google_ads"]',
        '[id*="ad-slot"]',
        '[id*="ad_slot"]',
        '[class*="adsbygoogle"]',
        '[class*="ad-slot"]',
        '[data-ad]',
        'img[src*="doubleclick"]',
        'img[src*="googlesyndication"]',
        'img[src*="/ads/"]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]'
      ].join(', ')
    );

    for (const node of nodes) {
      const urls = collectUrlsFromElement(node);
      const suspicious = looksLikeAdElement(node);
      for (const url of urls) {
        const type = resourceTypeOf(node);
        if (!AdBlockClassifier.isAdRequest(url, type, location.href)) {
          continue;
        }
        if (!AdBlockClassifier.hostnameOf(url)) continue;
        const key = AdBlockClassifier.candidateKey(url);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ url, resourceType: type, suspicious });
        if (items.length >= MAX_ITEMS) break;
      }
      if (items.length >= MAX_ITEMS) break;
    }

    if (!items.length) return;
    chrome.runtime.sendMessage({ type: 'DOM_CANDIDATES', items }).catch(() => {});
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  } else {
    scheduleScan();
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
