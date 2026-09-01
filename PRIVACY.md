# 隐私政策 / Privacy Policy

**AI广告拦截（AI Ad Blocker）**  
生效日期：2026-09-01  
联系：backrt@gmail.com

本页与商店提交用的 [docs/privacy.html](docs/privacy.html) 内容一致。GitHub Pages（启用后）：  
https://backrt.github.io/chrome_plugin_ad_block/privacy.html

---

## 中文

本扩展用于在浏览器中拦截广告请求并隐藏广告元素。我们不运营用户账号，也不把你的浏览记录、页面内容或个人信息发送到我们自己的服务器。

扩展会在本机使用 `chrome.storage` / `browser.storage` 保存你的设置、自定义动态规则和过滤列表缓存。这些数据只留在你的设备上，卸载扩展后由浏览器处理。

为拦截广告，扩展需要访问你打开的网页（`<all_urls>`），并可能观察未被拦截的请求，以便在弹窗中列出疑似广告。这些信息不会上传给我们。

扩展会定期从公开地址下载过滤列表数据（JSON），目前包括 GitHub raw 与 jsDelivr 上的 EasyList 转换结果。下载的是规则数据，不会执行远程代码。这些第三方各自有自己的隐私政策。

如有问题，请发邮件至 backrt@gmail.com。

---

## English

AI Ad Blocker blocks ad requests and hides leftover ad elements in your browser. We do not run user accounts, and we do not send your browsing history, page contents, or personal information to our own servers.

The extension stores settings, optional dynamic rules, and cached filter lists in `chrome.storage` / `browser.storage` on your device only. The browser removes this data when you uninstall the extension.

To block ads, the extension needs access to pages you visit (`<all_urls>`) and may observe requests that were not blocked so the popup can list suspected ads. This information stays on your device.

The extension periodically downloads public filter-list data (JSON) from GitHub raw and jsDelivr. These files are treated as data, not remotely executed code. Those hosts have their own privacy policies.

Questions: backrt@gmail.com
