const AdBlockClassifier = (() => {
  const AD_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'googletagservices.com',
    'adservice.google.com',
    '2mdn.net',
    'googleads.g.doubleclick.net',
    'pagead2.googlesyndication.com',
    'adservice.google.com',
    'amazon-adsystem.com',
    'media.net',
    'adnxs.com',
    'adsrvr.org',
    'adsafeprotected.com',
    'advertising.com',
    'adform.net',
    'adition.com',
    'adotmob.com',
    'ads-twitter.com',
    'ads.yahoo.com',
    'ads.linkedin.com',
    'ads.facebook.com',
    'aniview.com',
    'appnexus.com',
    'bidswitch.net',
    'casalemedia.com',
    'contextweb.com',
    'criteo.com',
    'criteo.net',
    'indexww.com',
    'lijit.com',
    'moatads.com',
    'openx.net',
    'outbrain.com',
    'pubmatic.com',
    'rfihub.com',
    'rubiconproject.com',
    'scorecardresearch.com',
    'servenobid.com',
    'sharethrough.com',
    'simpli.fi',
    'smartadserver.com',
    'sovrn.com',
    'spotxchange.com',
    'taboola.com',
    'teads.tv',
    '3lift.com',
    'yieldmo.com',
    'mgid.com',
    'popads.net',
    'propellerads.com',
    'exoclick.com',
    'juicyads.com',
    'trafficjunky.net',
    'adsterra.com',
    'inmobi.com',
    'unityads.unity3d.com',
    'applovin.com',
    'pangle.io',
    'pangle-ads.com',
    'gdt.qq.com',
    'lianmeng.360.cn',
    'union.baidu.com',
    'cpro.baidu.com',
    'pos.baidu.com',
    'cbjs.baidu.com',
    'tanx.com',
    'alimama.com',
    'mmstat.com',
    'ads.helo-app.com',
    'atm.youku.com',
    'admaster.com.cn',
    'ipinyou.com',
    'gridsumdissector.com',
    'mediav.com',
    'mvad.com',
    'quantserve.com',
    'quantcount.com',
    'bluekai.com',
    'krxd.net',
    'rlcdn.com',
    'agkn.com',
    'demdex.net',
    'omtrdc.net',
    'everesttech.net',
    'ads-api.twitter.com',
    'ads.reddit.com',
    'pagead.l.doubleclick.net',
    'adclick.g.doubleclick.net',
    'static.doubleclick.net',
    'ad.doubleclick.net',
    'securepubads.g.doubleclick.net',
    'tpc.googlesyndication.com',
    'partner.googleadservices.com',
    'adssettings.google.com',
    'fundingchoicesmessages.google.com',
    'pagead46.l.doubleclick.net',
    'ad-delivery.net',
    'creativecdn.com',
    'lijit.com',
    'bnmla.com',
    '1rx.io',
    'yieldlab.net',
    'adhigh.net',
    'adroll.com',
    'advertising.amazon.com'
  ];

  const PATH_PATTERNS = [
    /\/ads?\//i,
    /\/ad[-_/]/i,
    /\/adserve/i,
    /\/adserver/i,
    /\/advert/i,
    /\/banner/i,
    /\/sponsor/i,
    /\/pagead/i,
    /\/adsbygoogle/i,
    /\/gpt\.js/i,
    /\/gpt\/pubads/i,
    /\/doubleclick/i,
    /\/prebid/i,
    /\/adsystem/i,
    /\/adunit/i,
    /\/ad-slot/i,
    /\/nativead/i,
    /\/popup[-_]?ad/i,
    /\/preroll/i,
    /\/midroll/i,
    /\/video[-_]?ad/i
  ];

  const DOM_ATTR_PATTERN =
    /\b(ads?(bygoogle)?|advert(ising|isement)?|sponsor(ed)?|promo(tion)?|doubleclick|taboola|outbrain|adsense|adslot|ad-container|ad_wrapper|google_ads|gpt-ad)\b/i;

  const FALSE_POSITIVE_HOSTS = [
    'googleapis.com',
    'gstatic.com',
    'google.com',
    'gvt1.com',
    'youtube.com',
    'ytimg.com',
    'ggpht.com',
    'github.com',
    'githubusercontent.com',
    'cloudflare.com',
    'jsdelivr.net',
    'unpkg.com',
    'cdnjs.cloudflare.com'
  ];

  const MULTI_PART_TLDS = new Set([
    'co.uk',
    'com.cn',
    'net.cn',
    'org.cn',
    'com.au',
    'co.jp',
    'co.kr',
    'com.tw',
    'co.nz',
    'com.hk'
  ]);

  const AD_RESOURCE_TYPES = new Set([
    'sub_frame',
    'image',
    'script',
    'xmlhttprequest',
    'media',
    'object',
    'ping',
    'websocket',
    'other'
  ]);

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  function pathnameOf(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  }

  function domainMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
  }

  function baseDomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const lastTwo = parts.slice(-2).join('.');
    if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return lastTwo;
  }

  function isFalsePositiveHost(hostname) {
    return FALSE_POSITIVE_HOSTS.some((domain) => domainMatches(hostname, domain));
  }

  function isAdDomain(hostname) {
    if (!hostname) return false;
    return AD_DOMAINS.some((domain) => domainMatches(hostname, domain));
  }

  function isSameSite(url, pageUrl) {
    const requestHost = hostnameOf(url);
    const pageHost = hostnameOf(pageUrl);
    if (!requestHost || !pageHost) return false;
    if (requestHost === pageHost) return true;
    const requestBase = baseDomain(requestHost);
    const pageBase = baseDomain(pageHost);
    return Boolean(requestBase && pageBase && requestBase === pageBase);
  }

  function pathLooksLikeAd(pathname) {
    return PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  }

  function candidateKey(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.toLowerCase()}|${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  function isThirdParty(url, initiator) {
    if (!initiator) return true;
    return !isSameSite(url, initiator);
  }

  function isFirstParty(url, pageUrl) {
    return isSameSite(url, pageUrl);
  }

  function isAdRequest(url, resourceType, initiator) {
    if (!url || url.startsWith('chrome') || url.startsWith('about:') || url.startsWith('devtools:')) {
      return false;
    }
    if (resourceType === 'main_frame') return false;
    const hostname = hostnameOf(url);
    if (!hostname) return false;
    if (isAdDomain(hostname)) return true;
    if (isFalsePositiveHost(hostname)) return false;
    if (!AD_RESOURCE_TYPES.has(resourceType || 'other')) return false;
    const pathname = pathnameOf(url);
    if (!pathLooksLikeAd(pathname)) return false;
    if (resourceType === 'script' || resourceType === 'xmlhttprequest') {
      return isThirdParty(url, initiator);
    }
    return true;
  }

  function attrLooksLikeAd(value) {
    if (!value) return false;
    return DOM_ATTR_PATTERN.test(String(value));
  }

  function toCandidate(url, resourceType, source) {
    const hostname = hostnameOf(url);
    if (!hostname) return null;
    return {
      key: candidateKey(url),
      url,
      domain: hostname,
      resourceType: resourceType || 'other',
      source,
      firstSeen: Date.now(),
      count: 1
    };
  }

  return {
    AD_DOMAINS,
    hostnameOf,
    pathnameOf,
    candidateKey,
    isAdDomain,
    isAdRequest,
    isThirdParty,
    isFirstParty,
    isSameSite,
    attrLooksLikeAd,
    toCandidate
  };
})();
